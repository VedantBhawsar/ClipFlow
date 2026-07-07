/**
 * Smoke test for `ImageGenClient`.
 *
 * Hits the real Gemini (or Replicate) endpoint and writes the first returned
 * image to disk so you can eyeball whether actual image generation is
 * happening. Not part of the vitest suite — run with:
 *
 *   pnpm --filter worker test:image-gen
 *   pnpm --filter worker test:image-gen -- --prompt "your prompt here"
 *
 * Requires `GEMINI_API_KEY` (or `REPLICATE_API_TOKEN`) in the worker's `.env`.
 * Output PNG/JPEG goes to `apps/worker/.image-gen-smoke/<timestamp>.png`.
 *
 * Exits non-zero on failure so it composes with CI smoke pipelines if you
 * ever want to wire it up.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "@clipflow/config";
import { ImageGenClient } from "../src/lib/image-gen/image-gen-client.js";
import { classifyImageGenError } from "../src/lib/image-gen/image-gen-errors.js";

// ---- 1. Parse CLI args (very small — no commander dep) ----

const args = process.argv.slice(2);
const promptArgIdx = args.indexOf("--prompt");
const userPrompt =
  promptArgIdx !== -1 && args[promptArgIdx + 1]
    ? args[promptArgIdx + 1]
    : "A vibrant red apple on a pure white background, photorealistic studio lighting, soft shadow";

const PROVIDER_FLAG = "--provider";
const providerOverride =
  args.indexOf(PROVIDER_FLAG) !== -1 ? args[args.indexOf(PROVIDER_FLAG) + 1] : undefined;

// ---- 2. Lightweight .env loader (avoids pulling in the worker's Redis-required env) ----

const loadDotEnvIfPresent = (): void => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadDotEnvIfPresent();
if (providerOverride && (providerOverride === "gemini" || providerOverride === "replicate")) {
  process.env.IMAGE_GEN_PROVIDER = providerOverride;
}

// ---- 3. Validate env + bootstrap the client ----

let env: ReturnType<typeof loadEnv>;
try {
  env = loadEnv();
} catch (err) {
  console.error("\n❌ Failed to load env. Common causes:");
  console.error("   • GEMINI_API_KEY is missing or empty in apps/worker/.env");
  console.error("   • IMAGE_GEN_PROVIDER is set to a provider whose API key is absent");
  console.error("");
  console.error("Underlying error:");
  console.error(err instanceof Error ? err.message : String(err));
  console.error("");
  process.exit(1);
}

console.log("\n=== Image generation smoke test ===");
console.log(`Provider : ${env.IMAGE_GEN_PROVIDER}`);
console.log(`Model    : ${
  env.IMAGE_GEN_PROVIDER === "gemini" ? env.GEMINI_IMAGE_MODEL : env.REPLICATE_IMAGE_MODEL
}`);
console.log(`Prompt   : "${userPrompt}"`);
console.log("");

const client = new ImageGenClient(env);

// ---- 4. Run + write to disk ----

const start = Date.now();
let result: Awaited<ReturnType<typeof client.generateImage>>;
try {
  result = await client.generateImage({ prompt: userPrompt, aspectRatio: "16:9" });
} catch (err) {
  const classified = classifyImageGenError(err);
  console.error("❌ Image generation FAILED");
  console.error(`   kind       : ${classified.kind}`);
  console.error(`   reasonCode : ${classified.reasonCode}`);
  console.error(`   message    : ${classified.message}`);
  process.exit(1);
}

if (result.images.length === 0) {
  console.error("❌ Provider returned 0 images — generation did not produce output.");
  process.exit(2);
}

const outDir = resolve(process.cwd(), ".image-gen-smoke");
mkdirSync(outDir, { recursive: true });

const savedPaths: string[] = [];
for (let i = 0; i < result.images.length; i++) {
  const uri = result.images[i];
  const match = /^data:([^;]+);base64,(.+)$/s.exec(uri);
  if (!match) {
    console.error(`⚠️  Image ${i}: not a data: URI (${uri.slice(0, 40)}…) — skipping write`);
    continue;
  }
  const mime = match[1];
  const ext = mime.split("/")[1] ?? "png";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = i === 0 ? `${ts}.${ext}` : `${ts}-${i + 1}.${ext}`;
  const fullPath = resolve(outDir, filename);
  writeFileSync(fullPath, Buffer.from(match[2], "base64"));
  savedPaths.push(fullPath);
}

const elapsedMs = Date.now() - start;
console.log(`✅ Generated ${result.images.length} image(s) in ${elapsedMs}ms`);
console.log(`   model  : ${result.modelUsed}`);
console.log(`   bytes  : ${savedPaths.map((p) => p).join(", ")}`);
for (const p of savedPaths) {
  console.log(`   file   : ${p}`);
}
console.log("\nOpen the file(s) above to verify the image is real (not a 1×1 placeholder).");
console.log("Exiting 0.\n");
process.exit(0);