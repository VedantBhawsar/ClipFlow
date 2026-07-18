import { GoogleGenAI } from "@google/genai";
import Replicate from "replicate";
import type { Env } from "@clipflow/config";
import { ImageGenError, mapSdkApiError, mapNvidiaApiError } from "./image-gen-errors.js";

export interface ImageGenOptions {
  prompt: string;
  /** Negative prompt (Replicate only — ignored by Gemini). */
  negativePrompt?: string;
  /**
   * Desired number of images. Gemini's `generateContent` returns at most
   * one image per call regardless of this value, so we accept it for
   * backwards-compat with callers that set it but ignore it here. If you
   * need N candidates per chapter, fire N sequential `generateImage`
   * calls — the worker job already does this implicitly by looping.
   */
  count?: number;
  /** Aspect ratio (default "16:9" for YouTube thumbnails). */
  aspectRatio?: string;
  /** Reference image URLs for image-to-image guidance (Gemini). */
  referenceImages?: string[];
  /** Optional mode for Nvidia (e.g. "base" | "canny" | "depth"). Defaults to "base". */
  mode?: "base" | "canny" | "depth";
}

export interface ImageGenResult {
  /** URLs/URIs of the generated images, as `data:image/<mime>;base64,...`. */
  images: string[];
  /** Which model actually served the request. */
  modelUsed: string;
  /** Provider that served the request. */
  provider: "gemini" | "replicate" | "nvidia";
}

/**
 * Image generation client backed by Google's official `@google/genai` SDK.
 *
 * Gemini image generation uses `models.generateContent` with
 * `responseModalities: ["IMAGE","TEXT"]` and an `imageConfig.aspectRatio`
 * knob. The native Gemini image path (e.g. `gemini-2.5-flash-image`)
 * returns image bytes as `inlineData` parts — we surface them as
 * `data:image/...;base64,...` URIs to preserve the contract that
 * `thumbnails.ts → saveBase64Image` already expects.
 *
 * Replicate is kept as a paid fallback for users who hit Gemini's free-
 * tier limits or want higher-quality models (Flux Pro / SDXL).
 */
export class ImageGenClient {
  private provider: "gemini" | "replicate" | "nvidia";
  private genai?: GoogleGenAI;
  private geminiImageModel: string;
  private geminiVisionModel: string;
  private replicate?: Replicate;
  private replicateModel: string;
  private nvidiaApiKey?: string;
  private nvidiaImageModel: string;

  constructor(env: Env) {
    this.provider = env.IMAGE_GEN_PROVIDER;
    this.geminiImageModel = env.GEMINI_IMAGE_MODEL;
    this.geminiVisionModel = env.GEMINI_VISION_MODEL;
    this.replicateModel = env.REPLICATE_IMAGE_MODEL;
    this.nvidiaImageModel = env.NVIDIA_IMAGE_MODEL;

    if (this.provider === "nvidia") {
      if (!env.NVIDIA_API_KEY) {
        throw new ImageGenError(
          "NVIDIA_AUTH",
          "NVIDIA_API_KEY is not configured but IMAGE_GEN_PROVIDER=nvidia",
        );
      }
      this.nvidiaApiKey = env.NVIDIA_API_KEY;
    }

    if (this.provider === "gemini") {
      if (!env.GEMINI_API_KEY) {
        throw new ImageGenError(
          "GEMINI_AUTH",
          "GEMINI_API_KEY is not configured but IMAGE_GEN_PROVIDER=gemini",
        );
      }
      this.genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }

    if (this.provider === "replicate") {
      if (!env.REPLICATE_API_TOKEN) {
        throw new ImageGenError(
          "REPLICATE_AUTH",
          "REPLICATE_API_TOKEN is not configured but IMAGE_GEN_PROVIDER=replicate",
        );
      }
      this.replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });
    }
  }

  async generateImage(opts: ImageGenOptions): Promise<ImageGenResult> {
    if (this.provider === "gemini") {
      return this.generateGemini(opts);
    }
    if (this.provider === "nvidia") {
      return this.generateNvidia(opts);
    }
    return this.generateReplicate(opts);
  }

  /**
   * Analyse a batch of thumbnail URLs (channel-style detection flow).
   * Only Gemini is supported — Replicate has no vision path.
   */
  async analyzeImages(
    imageUrls: string[],
    analysisPrompt: string,
  ): Promise<string> {
    if (!this.genai) {
      throw new ImageGenError(
        "GEMINI_AUTH",
        "GEMINI_API_KEY is required for vision analysis but is not configured",
      );
    }
    return this.callGeminiVision(imageUrls, analysisPrompt);
  }

  // ---- Gemini (SDK) ----

  private async generateGemini(opts: ImageGenOptions): Promise<ImageGenResult> {
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: opts.prompt }];

    if (opts.referenceImages?.length) {
      for (const refUrl of opts.referenceImages) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: await this.fetchImageAsBase64(refUrl),
          },
        });
      }
    }

    let response;
    try {
      response = await this.genai!.models.generateContent({
        model: this.geminiImageModel,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio: opts.aspectRatio ?? "16:9",
          },
        },
      });
    } catch (err) {
      throw mapSdkApiError(err);
    }

    const images: string[] = [];
    for (const candidate of response.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (
          part.inlineData?.mimeType?.startsWith("image/") &&
          part.inlineData.data
        ) {
          images.push(
            `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          );
        }
      }
    }

    if (images.length === 0) {
      // Surface the most likely cause so the dashboard's failureReason is
      // actionable. The SDK exposes both the prompt-level feedback and the
      // candidate-level finishReason; either can explain the empty result.
      const blocked = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;
      if (blocked || finishReason === "SAFETY") {
        throw new ImageGenError(
          "GEMINI_SAFETY",
          `Gemini refused to generate an image: ${blocked ?? finishReason}`,
        );
      }
      throw new ImageGenError(
        "GEMINI_BAD_REQUEST",
        "Gemini returned no image data in the response",
      );
    }

    return {
      images,
      modelUsed: this.geminiImageModel,
      provider: "gemini",
    };
  }

  private async callGeminiVision(
    imageUrls: string[],
    analysisPrompt: string,
  ): Promise<string> {
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [{ text: analysisPrompt }];

    for (const imgUrl of imageUrls) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: await this.fetchImageAsBase64(imgUrl),
        },
      });
    }

    let response;
    try {
      response = await this.genai!.models.generateContent({
        model: this.geminiVisionModel,
        contents: [{ role: "user", parts }],
        config: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      });
    } catch (err) {
      throw mapSdkApiError(err);
    }

    const text = (response.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .filter((p) => p.text)
      .map((p) => p.text ?? "")
      .join("\n");

    if (!text) {
      throw new ImageGenError(
        "GEMINI_BAD_REQUEST",
        "Gemini returned no text in vision response",
      );
    }
    return text;
  }

  // ---- Replicate (SDK) ----

  /**
   * Run the model via the official `replicate` JS SDK. The SDK handles
   * `Prefer: wait=…` polling internally via the `wait: { mode: "block" }`
   * option. Replicate's API caps that header at 1–60 seconds, so we pass
   * `timeout: 60`; the SDK polls client-side beyond that if the prediction
   * isn't done yet.
   *
   * Return shapes vary by model — most image models (Flux Pro / SDXL)
   * return `FileOutput[]`, some return `string[]` (URLs), a few return
   * a single value. We normalise all three to the `data:image/<mime>;base64,…`
   * URI shape our downstream `thumbnails.ts → saveBase64Image` decoder
   * already expects.
   */
  private async generateReplicate(
    opts: ImageGenOptions,
  ): Promise<ImageGenResult> {
    if (!this.replicate) {
      throw new ImageGenError(
        "REPLICATE_AUTH",
        "Replicate client is not initialised",
      );
    }

    const input: Record<string, unknown> = {
      prompt: opts.prompt,
      aspect_ratio: opts.aspectRatio ?? "16:9",
      ...(opts.count && opts.count > 1 ? { num_outputs: opts.count } : {}),
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    };

    let output: unknown;
    try {
      // The SDK's `identifier` param is a template-literal type that
      // guarantees `"owner/name"` or `"owner/name:version"` shape. Our
      // env-driven `this.replicateModel` is always in that form, so we
      // cast at the boundary rather than re-type the field.
      //
      // `timeout` here is what gets sent in the `Prefer: wait=X` header,
      // which Replicate's API caps at 1–60. The SDK then polls client-side
      // beyond that if the prediction isn't done yet.
      const identifier = this.replicateModel as `${string}/${string}`;
      output = await this.replicate.run(identifier, {
        input,
      });
    } catch (err) {
      throw mapReplicateApiError(err);
    }

    const items = normaliseReplicateOutput(output);
    const images: string[] = [];
    for (const item of items) {
      images.push(await this.replicateItemToDataUri(item));
    }

    if (images.length === 0) {
      throw new ImageGenError(
        "REPLICATE_BAD_REQUEST",
        "Replicate returned no images",
      );
    }

    return {
      images,
      modelUsed: this.replicateModel,
      provider: "replicate",
    };
  }

  // ---- Helpers ----

  private async fetchImageAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new ImageGenError(
        "IMG_NETWORK",
        `Failed to fetch image: ${url} (${res.status})`,
      );
    }
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  /**
   * Convert a single Replicate output item (`FileOutput`, URL string, or
   * anything string-castable) into a `data:image/<mime>;base64,…` URI.
   *
   * `FileOutput` exposes `.blob()` (a `Blob` with `.type`) and `.url()` (a
   * string URL). For URL strings we just `fetch` the bytes. Both paths
   * collapse to base64 so the caller doesn't care which shape Replicate
   * returned.
   */
  private async replicateItemToDataUri(item: unknown): Promise<string> {
    if (item == null) {
      throw new ImageGenError(
        "REPLICATE_BAD_REQUEST",
        "Replicate returned a null output item",
      );
    }

    // `FileOutput` shape — read the blob bytes + mime.
    if (
      typeof item === "object" &&
      "blob" in item &&
      typeof (item as { blob: unknown }).blob === "function"
    ) {
      const fo = item as { blob: () => Promise<Blob> };
      const blob = await fo.blob();
      const mime =
        blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
      const buffer = Buffer.from(await blob.arrayBuffer());
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }

    // URL string — fetch the bytes. Mime is hinted by the URL extension
    // with a `image/png` fallback (Replicate hosted outputs are usually PNG).
    if (typeof item === "string") {
      const url = item;
      const res = await fetch(url);
      if (!res.ok) {
        throw new ImageGenError(
          "IMG_NETWORK",
          `Failed to fetch Replicate output: ${url} (${res.status})`,
        );
      }
      const mime = res.headers.get("content-type")?.split(";")[0]?.trim();
      const finalMime = mime && mime.startsWith("image/") ? mime : "image/png";
      const buffer = Buffer.from(await res.arrayBuffer());
      return `data:${finalMime};base64,${buffer.toString("base64")}`;
    }

    // Anything else — best effort.
    if (
      item &&
      typeof item === "object" &&
      "url" in item &&
      typeof (item as { url: unknown }).url === "function"
    ) {
      const url = String((item as { url: () => unknown }).url());
      return this.replicateItemToDataUri(url);
    }

    throw new ImageGenError(
      "REPLICATE_BAD_REQUEST",
      `Unsupported Replicate output item shape: ${typeof item}`,
    );
  }

  // ---- Nvidia NIM ----

  private async generateNvidia(opts: ImageGenOptions): Promise<ImageGenResult> {
    if (!this.nvidiaApiKey) {
      throw new ImageGenError(
        "NVIDIA_AUTH",
        "NVIDIA API key is not configured",
      );
    }

    const model = this.nvidiaImageModel;
    const invokeUrl = model.startsWith("http")
      ? model
      : `https://ai.api.nvidia.com/v1/genai/${model}`;

    const headers = {
      "Authorization": `Bearer ${this.nvidiaApiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    const { width, height } = this.mapAspectRatioToWidthHeight(opts.aspectRatio ?? "16:9");
    const mode = opts.mode ?? "base";

    let imageBase64: string | undefined;
    if (mode === "canny" || mode === "depth") {
      if (!opts.referenceImages || opts.referenceImages.length === 0) {
        throw new ImageGenError(
          "NVIDIA_BAD_REQUEST",
          `A reference image is required for Nvidia '${mode}' mode.`,
        );
      }
      const refUrl = opts.referenceImages[0]!;
      if (refUrl.startsWith("data:")) {
        imageBase64 = refUrl;
      } else {
        const rawBase64 = await this.fetchImageAsBase64(refUrl);
        imageBase64 = `data:image/png;base64,${rawBase64}`;
      }
    }

    const payload: Record<string, any> = {
      prompt: opts.prompt,
      mode,
      cfg_scale: 3.5,
      width,
      height,
      seed: Math.floor(Math.random() * 1_000_000),
      steps: 50,
    };

    if (imageBase64) {
      payload.image = imageBase64;
    }

    let response: Response;
    try {
      response = await fetch(invokeUrl, {
        method: "POST",
        body: JSON.stringify(payload),
        headers,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ImageGenError(
        "NVIDIA_UPSTREAM",
        `NVIDIA network error: ${msg}`,
      );
    }

    if (!response.ok) {
      let errBody = "";
      try {
        errBody = await response.text();
      } catch {
        errBody = response.statusText;
      }
      throw mapNvidiaApiError(response.status, errBody);
    }

    let responseBody: any;
    try {
      responseBody = await response.json();
    } catch (err) {
      throw new ImageGenError(
        "NVIDIA_UPSTREAM",
        `Failed to parse NVIDIA JSON response: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const artifacts = responseBody?.artifacts;
    if (!Array.isArray(artifacts) || artifacts.length === 0) {
      throw new ImageGenError(
        "NVIDIA_BAD_REQUEST",
        "NVIDIA returned no image artifacts",
      );
    }

    const images: string[] = [];
    for (const artifact of artifacts) {
      if (artifact.base64) {
        images.push(`data:image/png;base64,${artifact.base64}`);
      }
    }

    if (images.length === 0) {
      throw new ImageGenError(
        "NVIDIA_BAD_REQUEST",
        "NVIDIA returned no base64 image data",
      );
    }

    return {
      images,
      modelUsed: model,
      provider: "nvidia",
    };
  }

  private static readonly NVIDIA_VALID_DIMS = [
    768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344,
  ] as const;

  private static clampToNearest(
    value: number,
    valid: readonly number[] = ImageGenClient.NVIDIA_VALID_DIMS,
  ): number {
    let best = valid[0]!;
    let bestDist = Math.abs(value - best);
    for (let i = 1; i < valid.length; i++) {
      const d = Math.abs(value - valid[i]!);
      if (d < bestDist) {
        bestDist = d;
        best = valid[i]!;
      }
    }
    return best;
  }

  private mapAspectRatioToWidthHeight(aspectRatio?: string): { width: number; height: number } {
    if (!aspectRatio) {
      return { width: 1024, height: 1024 };
    }
    switch (aspectRatio) {
      case "16:9":
        return { width: 1344, height: 768 };
      case "1:1":
        return { width: 1024, height: 1024 };
      case "4:3":
        return { width: 1024, height: 768 };
      case "3:2":
        return { width: 1152, height: 768 };
      case "21:9":
        return { width: 1344, height: 768 };
      case "9:16":
        return { width: 768, height: 1344 };
      case "3:4":
        return { width: 768, height: 1024 };
      case "2:3":
        return { width: 768, height: 1152 };
      default:
        const parts = aspectRatio.split(":");
        if (parts.length === 2) {
          const w = parseFloat(parts[0]!);
          const h = parseFloat(parts[1]!);
          if (!isNaN(w) && !isNaN(h) && h > 0) {
            const targetWidth = 1024;
            const targetHeight = Math.round((targetWidth * h) / w);
            return {
              width: targetWidth,
              height: ImageGenClient.clampToNearest(targetHeight),
            };
          }
        }
        return { width: 1024, height: 1024 };
    }
  }
}

// ---- Replicate output normalisation (SDK returns `object` — we accept
// three practical shapes: array, single value, or a non-array iterable) ----

const normaliseReplicateOutput = (output: unknown): unknown[] => {
  if (Array.isArray(output)) return output;
  if (output == null) return [];
  return [output];
};

/**
 * SDK-level error detection for the `replicate` JS client.
 *
 * Mirrors the shape-based pattern from `mapSdkApiError` (bug-141): the SDK
 * throws a single `ApiError` class for every HTTP failure, distinguished
 * only by `.response.status`. We detect by shape (presence of a numeric
 * `response.status`) so the check survives test mocks where `instanceof`
 * would fail.
 */
const looksLikeReplicateApiError = (
  err: unknown,
): err is { response: { status: number }; message?: string } & Error => {
  if (!err || typeof err !== "object") return false;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== "object") return false;
  return typeof (response as { status?: unknown }).status === "number";
};

const mapReplicateApiError = (err: unknown): ImageGenError => {
  if (!looksLikeReplicateApiError(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    return new ImageGenError(
      "REPLICATE_UPSTREAM",
      `Replicate SDK error: ${msg}`,
    );
  }

  const status = err.response.status;
  const message = err.message ?? "Unknown Replicate error";

  if (status === 429) {
    return new ImageGenError(
      "REPLICATE_RATE_LIMIT",
      `Replicate rate limit: ${message}`,
    );
  }
  if (status === 401 || status === 403) {
    return new ImageGenError(
      "REPLICATE_AUTH",
      `Replicate auth error: ${message}`,
    );
  }
  if (status === 404) {
    return new ImageGenError(
      "REPLICATE_MODEL_NOT_FOUND",
      `Replicate model not found: ${message}`,
    );
  }
  if (status === 400 || status === 422) {
    return new ImageGenError(
      "REPLICATE_BAD_REQUEST",
      `Replicate bad request: ${message}`,
    );
  }
  if (status >= 500) {
    return new ImageGenError(
      "REPLICATE_UPSTREAM",
      `Replicate upstream error: ${message}`,
    );
  }
  return new ImageGenError(
    "REPLICATE_UPSTREAM",
    `Replicate error (${status}): ${message}`,
  );
};
