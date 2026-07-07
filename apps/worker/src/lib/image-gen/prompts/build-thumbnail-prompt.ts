export interface ThumbnailPromptInput {
  videoTitle: string;
  videoDescription: string | null;
  chapterTitle: string;
  chapterStartMs: number;
  channelStyle: string | null;
  niche: string;
  durationSeconds: number;
}

export interface ThumbnailPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

export const buildThumbnailPrompt = (input: ThumbnailPromptInput): ThumbnailPromptResult => {
  const systemPrompt = `You are a YouTube thumbnail designer. Generate a high-CTR thumbnail image that matches the creator's channel style. Rules:
- 16:9 aspect ratio (1280x720)
- Bold, readable text overlay (max 3-4 words)
- High contrast colors that pop in YouTube's dark UI
- Face-closeups when relevant (higher CTR)
- Clean composition — don't clutter
- Match the channel's established visual style`;

  const styleContext = input.channelStyle
    ? `\n\nChannel style analysis: ${input.channelStyle}`
    : "";

  const userPrompt = [
    `Video title: "${input.videoTitle}"`,
    input.videoDescription ? `Description: "${input.videoDescription.slice(0, 500)}"` : "",
    `Chapter: "${input.chapterTitle}" (at ${Math.floor(input.chapterStartMs / 1000)}s)`,
    `Content niche: ${input.niche}`,
    `Video duration: ${Math.floor(input.durationSeconds / 60)} min`,
    styleContext,
    "\nGenerate a YouTube thumbnail for this chapter moment. Make it eye-catching, on-brand, and clickable.",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt };
};
