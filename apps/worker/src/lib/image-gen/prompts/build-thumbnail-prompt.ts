export interface ThumbnailPromptInput {
  videoTitle: string;
  videoDescription: string | null;
  chapterTitle: string;
  chapterStartMs: number;
  channelStyle: string | null;
  niche: string;
  durationSeconds: number;
  hasReferenceFrame?: boolean;
}

export interface ThumbnailPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

export const buildThumbnailPrompt = (input: ThumbnailPromptInput): ThumbnailPromptResult => {
  const systemParts: string[] = [
    "You are a YouTube thumbnail designer. Generate a high-CTR 16:9 (1280x720) thumbnail image that looks like a real frame from the actual video — not an AI-generated illustration.",
  ];

  if (input.hasReferenceFrame) {
    systemParts.push(
      "",
      "REFERENCE FRAME — A frame from the actual video chapter is provided. CRITICAL:",
      "- USE the real person's/subject's face from the reference — do NOT generate an AI face. The person must be recognizable.",
      "- Match the background scene, lighting, color palette, and setting from the reference frame.",
      "- The thumbnail must look like it was pulled straight from the video footage, not like a generated illustration.",
      "",
      "ANTI-AI ARTIFACT RULES (must follow):",
      "- Natural skin texture — avoid smooth/plastic AI-generated skin",
      "- Realistic lighting and shadows consistent with the reference frame",
      "- No distorted proportions, extra fingers, or unnatural anatomy",
      "- No AI artifacts, glitch patterns, or oversmoothed surfaces",
      "- The output must look like a real video frame, period.",
    );
  } else {
    systemParts.push(
      "",
      "DESIGN GUIDELINES:",
      "- Avoid generic AI illustration look — aim for photorealistic quality",
      "- Natural textures and realistic lighting",
      "- No distorted proportions or unnatural anatomy",
    );
  }

  systemParts.push(
    "",
    "Design rules:",
    "- Bold, readable text overlay (max 3-4 words) — use high-contrast colors that pop in YouTube's dark UI",
    "- Clean composition — don't clutter the frame",
    "- If the chapter features a person, a close-up face shot works best (higher CTR)",
  );

  const styleContext = input.channelStyle
    ? `\n\nChannel style analysis:\n${input.channelStyle}`
    : "";

  const userPrompt = [
    `Video title: "${input.videoTitle}"`,
    input.videoDescription
      ? `Description: "${input.videoDescription.slice(0, 500)}"`
      : "",
    `Chapter: "${input.chapterTitle}" (at ${Math.floor(input.chapterStartMs / 1000)}s)`,
    `Content niche: ${input.niche}`,
    `Video duration: ${Math.floor(input.durationSeconds / 60)} min`,
    styleContext,
    "\nGenerate a YouTube thumbnail for this chapter moment. Make it eye-catching, on-brand, and clickable.",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt: systemParts.join("\n"), userPrompt };
};
