/**
 * Unit tests for `ImageGenClient` (Gemini path via `@google/genai` and
 * Replicate path via the `replicate` SDK).
 *
 * Pure-mock tests — the SDKs are replaced with `vi.hoisted` factories so
 * the test file doesn't need real API keys. The mocks are declared with
 * `vi.hoisted` per the bug-071 pattern: `vi.mock` factories run before
 * module-level consts initialise, so any mock closure that references a
 * top-level binding must use the hoisted variant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@clipflow/config";
import {
  classifyImageGenError,
  ImageGenError,
  mapSdkApiError,
} from "./image-gen-errors.js";

// ---- Mocks (vi.hoisted, see bug-071) ----

const mocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const GoogleGenAICtor = vi.fn();
  let lastConstructorOpts: Record<string, unknown> = {};
  const replicateRun = vi.fn();
  const ReplicateCtor = vi.fn();
  let lastReplicateOpts: Record<string, unknown> = {};
  return {
    generateContent,
    GoogleGenAICtor,
    get lastConstructorOpts() {
      return lastConstructorOpts;
    },
    set lastConstructorOpts(v: Record<string, unknown>) {
      lastConstructorOpts = v;
    },
    replicateRun,
    ReplicateCtor,
    get lastReplicateOpts() {
      return lastReplicateOpts;
    },
    set lastReplicateOpts(v: Record<string, unknown>) {
      lastReplicateOpts = v;
    },
  };
});

// Mock the `@google/genai` module so `new GoogleGenAI({...})` returns
// a stub with a fully mockable `models.generateContent`. The constructor
// captures its opts so we can assert the apiKey wiring.
vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: mocks.generateContent };
    constructor(opts: Record<string, unknown>) {
      mocks.lastConstructorOpts = opts;
      mocks.GoogleGenAICtor(opts);
    }
  },
}));

// Mock the `replicate` module so `new Replicate({...})` returns a stub with
// a fully mockable `run`. Constructor captures opts so we can assert the
// auth token wiring. The `run` method is what we assertion-drive for
// generation success/failure shapes.
vi.mock("replicate", () => ({
  default: class MockReplicate {
    run = mocks.replicateRun;
    constructor(opts: Record<string, unknown>) {
      mocks.lastReplicateOpts = opts;
      mocks.ReplicateCtor(opts);
    }
  },
}));

import { ImageGenClient } from "./image-gen-client.js";

// ---- Helpers ----

const fakeEnv = (
  overrides: Partial<{
    GEMINI_API_KEY: string | undefined;
    IMAGE_GEN_PROVIDER: "gemini" | "replicate" | "nvidia";
    GEMINI_IMAGE_MODEL: string;
    GEMINI_VISION_MODEL: string;
    REPLICATE_API_TOKEN: string | undefined;
    REPLICATE_IMAGE_MODEL: string;
    NVIDIA_API_KEY: string | undefined;
    NVIDIA_IMAGE_MODEL: string;
  }> = {},
): Env => ({
  IMAGE_GEN_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-gemini-key-1234567890",
  GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image",
  GEMINI_VISION_MODEL: "gemini-2.5-flash",
  REPLICATE_API_TOKEN: undefined,
  REPLICATE_IMAGE_MODEL: "black-forest-labs/flux-1.1-pro",
  NVIDIA_API_KEY: undefined,
  NVIDIA_IMAGE_MODEL: "black-forest-labs/flux.1-dev",
  ...overrides,
}) as unknown as Env;

const geminiResponseWithImages = (parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>) => ({
  candidates: [
    {
      content: { parts },
      finishReason: "STOP",
    },
  ],
});

beforeEach(() => {
  mocks.generateContent.mockReset();
  mocks.GoogleGenAICtor.mockClear();
  mocks.lastConstructorOpts = {};
  mocks.replicateRun.mockReset();
  mocks.ReplicateCtor.mockClear();
  mocks.lastReplicateOpts = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Constructor ----

describe("ImageGenClient — constructor", () => {
  it("throws GEMINI_AUTH when IMAGE_GEN_PROVIDER=gemini but no API key", () => {
    expect(() => new ImageGenClient(fakeEnv({ GEMINI_API_KEY: undefined }))).toThrow(
      ImageGenError,
    );
    try {
      new ImageGenClient(fakeEnv({ GEMINI_API_KEY: undefined }));
    } catch (err) {
      expect(err).toBeInstanceOf(ImageGenError);
      expect((err as ImageGenError).code).toBe("GEMINI_AUTH");
    }
  });

  it("constructs the SDK when apiKey is provided", () => {
    new ImageGenClient(fakeEnv());
    expect(mocks.lastConstructorOpts).toEqual({
      apiKey: "test-gemini-key-1234567890",
    });
  });
});

// ---- generateImage (Gemini) ----

describe("ImageGenClient.generateImage — Gemini", () => {
  it("returns image data URIs from inlineData parts", async () => {
    mocks.generateContent.mockResolvedValueOnce(
      geminiResponseWithImages([
        { inlineData: { mimeType: "image/png", data: "BASE64DATA1" } },
        { text: "Optional caption" },
        { inlineData: { mimeType: "image/jpeg", data: "BASE64DATA2" } },
      ]),
    );

    const client = new ImageGenClient(fakeEnv());
    const result = await client.generateImage({ prompt: "draw a cat" });

    expect(result.provider).toBe("gemini");
    expect(result.modelUsed).toBe("gemini-2.5-flash-image");
    expect(result.images).toEqual([
      "data:image/png;base64,BASE64DATA1",
      "data:image/jpeg;base64,BASE64DATA2",
    ]);
  });

  it("throws GEMINI_BAD_REQUEST when response has no image parts", async () => {
    mocks.generateContent.mockResolvedValueOnce(
      geminiResponseWithImages([{ text: "I won't draw anything." }]),
    );

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "draw" })).rejects.toMatchObject({
      code: "GEMINI_BAD_REQUEST",
    });
  });

  it("throws GEMINI_SAFETY when promptFeedback.blockReason is set", async () => {
    mocks.generateContent.mockResolvedValueOnce({
      candidates: [],
      promptFeedback: { blockReason: "SAFETY" },
    });

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "x" })).rejects.toMatchObject({
      code: "GEMINI_SAFETY",
    });
  });

  it("passes aspectRatio via imageConfig", async () => {
    mocks.generateContent.mockResolvedValueOnce(
      geminiResponseWithImages([
        { inlineData: { mimeType: "image/png", data: "X" } },
      ]),
    );

    const client = new ImageGenClient(fakeEnv());
    await client.generateImage({ prompt: "p", aspectRatio: "4:3" });

    const call = mocks.generateContent.mock.calls[0]?.[0] as {
      model: string;
      config: { imageConfig: { aspectRatio: string } };
    };
    expect(call.model).toBe("gemini-2.5-flash-image");
    expect(call.config.imageConfig.aspectRatio).toBe("4:3");
  });

  it("maps an SDK error with status 429 to GEMINI_RATE_LIMIT", async () => {
    const sdkErr = Object.assign(new Error("Too many requests"), {
      status: 429,
      name: "ApiError",
    });
    mocks.generateContent.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "GEMINI_RATE_LIMIT",
    });
  });

  it("maps an SDK error with status 404 to GEMINI_MODEL_NOT_FOUND", async () => {
    const sdkErr = Object.assign(new Error("Not Found"), {
      status: 404,
      name: "ApiError",
    });
    mocks.generateContent.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "GEMINI_MODEL_NOT_FOUND",
    });
  });

  it("maps an SDK error with status 401 to GEMINI_AUTH", async () => {
    const sdkErr = Object.assign(new Error("Unauthorized"), {
      status: 401,
      name: "ApiError",
    });
    mocks.generateContent.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "GEMINI_AUTH",
    });
  });

  it("maps an SDK error with status 500 to GEMINI_UPSTREAM", async () => {
    const sdkErr = Object.assign(new Error("Internal"), {
      status: 500,
      name: "ApiError",
    });
    mocks.generateContent.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "GEMINI_UPSTREAM",
    });
  });

  it("maps an SDK error with unknown status to GEMINI_UPSTREAM", async () => {
    const sdkErr = Object.assign(new Error("???",), {
      status: 418,
      name: "ApiError",
    });
    mocks.generateContent.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(fakeEnv());

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "GEMINI_UPSTREAM",
    });
  });
});

// ---- analyzeImages ----

describe("ImageGenClient.analyzeImages", () => {
  beforeEach(() => {
    // analyzeImages fetches each URL as base64 inlineData. Stub global fetch
    // so tests don't actually hit the network.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns joined text from all text parts", async () => {
    mocks.generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              { text: "First paragraph." },
              { text: "Second paragraph." },
            ],
          },
          finishReason: "STOP",
        },
      ],
    });

    const client = new ImageGenClient(fakeEnv());
    const text = await client.analyzeImages(["https://x/y.jpg"], "describe");

    expect(text).toBe("First paragraph.\nSecond paragraph.");
  });

  it("throws GEMINI_BAD_REQUEST when no text is returned", async () => {
    mocks.generateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: { parts: [{ inlineData: { mimeType: "image/png", data: "X" } }] },
          finishReason: "STOP",
        },
      ],
    });

    const client = new ImageGenClient(fakeEnv());

    await expect(
      client.analyzeImages(["https://x/y.jpg"], "describe"),
    ).rejects.toMatchObject({ code: "GEMINI_BAD_REQUEST" });
  });
});

// ---- mapSdkApiError ----

describe("mapSdkApiError", () => {
  it.each([
    [401, "GEMINI_AUTH"],
    [403, "GEMINI_AUTH"],
    [404, "GEMINI_MODEL_NOT_FOUND"],
    [400, "GEMINI_BAD_REQUEST"],
    [429, "GEMINI_RATE_LIMIT"],
    [500, "GEMINI_UPSTREAM"],
    [502, "GEMINI_UPSTREAM"],
    [418, "GEMINI_UPSTREAM"],
  ])("maps status %i to %s", (status, expectedCode) => {
    const err = Object.assign(new Error("err"), { status });
    const out = mapSdkApiError(err);
    expect(out.code).toBe(expectedCode);
    expect(out).toBeInstanceOf(ImageGenError);
  });

  it("maps a non-status Error to GEMINI_UPSTREAM", () => {
    const out = mapSdkApiError(new Error("totally unexpected"));
    expect(out.code).toBe("GEMINI_UPSTREAM");
  });

  it("maps a non-Error throw to GEMINI_UPSTREAM", () => {
    const out = mapSdkApiError("just a string");
    expect(out.code).toBe("GEMINI_UPSTREAM");
  });
});

// ---- classifyImageGenError ----

describe("classifyImageGenError", () => {
  it("returns kind=permanent for a GEMINI_AUTH ImageGenError", () => {
    const out = classifyImageGenError(new ImageGenError("GEMINI_AUTH", "bad key"));
    expect(out.kind).toBe("permanent");
    expect(out.reasonCode).toBe("GEMINI_AUTH");
  });

  it("returns kind=transient for a GEMINI_RATE_LIMIT ImageGenError", () => {
    const out = classifyImageGenError(new ImageGenError("GEMINI_RATE_LIMIT", "slow down"));
    expect(out.kind).toBe("transient");
    expect(out.reasonCode).toBe("GEMINI_RATE_LIMIT");
  });

  it("falls back to IMG_NETWORK transient for an unknown error", () => {
    const out = classifyImageGenError(new Error("wat"));
    expect(out.kind).toBe("transient");
    expect(out.reasonCode).toBe("IMG_NETWORK");
  });
});

// ---- Replicate (SDK) ----

/** Build a `FileOutput`-shaped object that mimics the SDK's default output. */
const fakeFileOutput = (bytes: Uint8Array, mime = "image/png") => ({
  blob: async () => ({
    type: mime,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }),
  url: () => "https://replicate.delivery/x/y.png",
});

describe("ImageGenClient — constructor (Replicate)", () => {
  it("throws REPLICATE_AUTH when IMAGE_GEN_PROVIDER=replicate but no API token", () => {
    expect(
      () =>
        new ImageGenClient(
          fakeEnv({
            IMAGE_GEN_PROVIDER: "replicate",
            REPLICATE_API_TOKEN: undefined,
          }),
        ),
    ).toThrow(ImageGenError);
    try {
      new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "replicate",
          REPLICATE_API_TOKEN: undefined,
        }),
      );
    } catch (err) {
      expect((err as ImageGenError).code).toBe("REPLICATE_AUTH");
    }
  });

  it("constructs the SDK when api token is provided", () => {
    new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );
    expect(mocks.lastReplicateOpts).toEqual({
      auth: "test-replicate-token-abcdef1234",
    });
  });
});

describe("ImageGenClient.generateImage — Replicate", () => {
  beforeEach(() => {
    // The Replicate path converts FileOutput → data URI via `await blob()`,
    // not `fetch`. But the URL-string path inside the helper DOES hit
    // `fetch` for the model-hosted URL. Stub globally to avoid noise.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4])),
        headers: { get: () => "image/png" },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data URIs from a FileOutput[] response", async () => {
    mocks.replicateRun.mockResolvedValueOnce([
      fakeFileOutput(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png"),
      fakeFileOutput(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"),
    ]);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );
    const result = await client.generateImage({ prompt: "draw a cat" });

    expect(result.provider).toBe("replicate");
    expect(result.modelUsed).toBe("black-forest-labs/flux-1.1-pro");
    expect(result.images).toHaveLength(2);
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/);
    expect(result.images[1]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("passes prompt + aspect_ratio + num_outputs through to run()", async () => {
    mocks.replicateRun.mockResolvedValueOnce([
      fakeFileOutput(new Uint8Array([1]), "image/png"),
    ]);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );
    await client.generateImage({ prompt: "p", aspectRatio: "4:3", count: 3 });

    const call = mocks.replicateRun.mock.calls[0];
    expect(call?.[0]).toBe("black-forest-labs/flux-1.1-pro");
    const opts = call?.[1] as { input: Record<string, unknown> };
    expect(opts.input.prompt).toBe("p");
    expect(opts.input.aspect_ratio).toBe("4:3");
    expect(opts.input.num_outputs).toBe(3);
  });

  it("omits num_outputs when count=1 (default)", async () => {
    mocks.replicateRun.mockResolvedValueOnce([
      fakeFileOutput(new Uint8Array([1]), "image/png"),
    ]);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );
    await client.generateImage({ prompt: "p" });

    const call = mocks.replicateRun.mock.calls[0];
    const opts = call?.[1] as { input: Record<string, unknown> };
    expect(opts.input.num_outputs).toBeUndefined();
  });

  it("normalises a single (non-array) output value", async () => {
    mocks.replicateRun.mockResolvedValueOnce(
      fakeFileOutput(new Uint8Array([0x89]), "image/png"),
    );

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );
    const result = await client.generateImage({ prompt: "p" });
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/);
  });

  it("throws REPLICATE_BAD_REQUEST when output is empty", async () => {
    mocks.replicateRun.mockResolvedValueOnce([]);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_BAD_REQUEST",
    });
  });

  it("maps SDK error with status 429 to REPLICATE_RATE_LIMIT", async () => {
    const sdkErr = Object.assign(new Error("Too many requests"), {
      response: { status: 429 },
      name: "ApiError",
    });
    mocks.replicateRun.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_RATE_LIMIT",
    });
  });

  it("maps SDK error with status 401 to REPLICATE_AUTH", async () => {
    const sdkErr = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
      name: "ApiError",
    });
    mocks.replicateRun.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_AUTH",
    });
  });

  it("maps SDK error with status 404 to REPLICATE_MODEL_NOT_FOUND", async () => {
    const sdkErr = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
      name: "ApiError",
    });
    mocks.replicateRun.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_MODEL_NOT_FOUND",
    });
  });

  it("maps SDK error with status 422 to REPLICATE_BAD_REQUEST", async () => {
    const sdkErr = Object.assign(new Error("Bad input"), {
      response: { status: 422 },
      name: "ApiError",
    });
    mocks.replicateRun.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_BAD_REQUEST",
    });
  });

  it("maps SDK error with status 500 to REPLICATE_UPSTREAM", async () => {
    const sdkErr = Object.assign(new Error("Internal"), {
      response: { status: 500 },
      name: "ApiError",
    });
    mocks.replicateRun.mockRejectedValueOnce(sdkErr);

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_UPSTREAM",
    });
  });

  it("maps a non-status Error to REPLICATE_UPSTREAM", async () => {
    mocks.replicateRun.mockRejectedValueOnce(new Error("totally unexpected"));

    const client = new ImageGenClient(
      fakeEnv({
        IMAGE_GEN_PROVIDER: "replicate",
        REPLICATE_API_TOKEN: "test-replicate-token-abcdef1234",
      }),
    );

    await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
      code: "REPLICATE_UPSTREAM",
    });
  });

  // ---- generateImage (Nvidia) ----

  describe("ImageGenClient.generateImage — Nvidia", () => {
    let originalFetch: typeof globalThis.fetch;
    let mockFetch: any;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      mockFetch = vi.fn();
      globalThis.fetch = mockFetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("throws NVIDIA_AUTH when IMAGE_GEN_PROVIDER=nvidia but no API key", () => {
      expect(() =>
        new ImageGenClient(
          fakeEnv({
            IMAGE_GEN_PROVIDER: "nvidia",
            NVIDIA_API_KEY: undefined,
          }),
        ),
      ).toThrow(ImageGenError);
    });

    it("returns base64 data URIs from artifacts array", async () => {
      const fakeArtifact = { base64: "YWJjZA==" }; // "abcd" in base64
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ artifacts: [fakeArtifact] }),
      });

      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      const result = await client.generateImage({ prompt: "draw a cat" });
      expect(result.provider).toBe("nvidia");
      expect(result.modelUsed).toBe("black-forest-labs/flux.1-dev");
      expect(result.images).toEqual(["data:image/png;base64,YWJjZA=="]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev");
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        "Authorization": "Bearer test-nvidia-key-1234567890",
        "Accept": "application/json",
        "Content-Type": "application/json",
      });
      const body = JSON.parse(init.body);
      expect(body.prompt).toBe("draw a cat");
      expect(body.mode).toBe("base");
      expect(body.cfg_scale).toBe(3.5);
      expect(body.steps).toBe(50);
      expect(body.seed).toBeGreaterThanOrEqual(0);
    });

    it("passes custom mode and reference image to canny mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ artifacts: [{ base64: "YWJjZA==" }] }),
      });

      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      const result = await client.generateImage({
        prompt: "draw a cat",
        mode: "canny",
        referenceImages: ["data:image/png;base64,ref123"],
      });

      expect(result.images).toEqual(["data:image/png;base64,YWJjZA=="]);
      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.mode).toBe("canny");
      expect(body.image).toBe("data:image/png;base64,ref123");
    });

    it("throws NVIDIA_BAD_REQUEST when canny mode is used without reference image", async () => {
      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      await expect(
        client.generateImage({
          prompt: "draw a cat",
          mode: "canny",
        }),
      ).rejects.toMatchObject({
        code: "NVIDIA_BAD_REQUEST",
      });
    });

    it("maps HTTP status 429 to NVIDIA_RATE_LIMIT", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      });

      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
        code: "NVIDIA_RATE_LIMIT",
      });
    });

    it("maps HTTP status 401 to NVIDIA_AUTH", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
        code: "NVIDIA_AUTH",
      });
    });

    it("maps HTTP status 500 to NVIDIA_UPSTREAM", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const client = new ImageGenClient(
        fakeEnv({
          IMAGE_GEN_PROVIDER: "nvidia",
          NVIDIA_API_KEY: "test-nvidia-key-1234567890",
        }),
      );

      await expect(client.generateImage({ prompt: "p" })).rejects.toMatchObject({
        code: "NVIDIA_UPSTREAM",
      });
    });
  });
});