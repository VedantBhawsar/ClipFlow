export interface StyleAnalysisInput {
  channelTitle: string;
  thumbnailCount: number;
}

export interface StyleAnalysisResult {
  dominantColors: string[];
  textPlacement: string;
  compositionStyle: string;
  facePresence: string;
  brandElements: string[];
  analysisRaw: string;
}

export const buildStyleAnalysisPrompt = (input: StyleAnalysisInput): string => {
  return [
    `Analyze these ${input.thumbnailCount} YouTube thumbnails from the channel "${input.channelTitle}".`,
    "Extract the following structured information as JSON:",
    "",
    "```json",
    "{",
    '  "dominantColors": ["#hex1", "#hex2", "#hex3"],',
    '  "textPlacement": "top" | "bottom" | "center" | "left" | "right" | "mixed",',
    '  "compositionStyle": "face-focused" | "text-heavy" | "minimalist" | "busy" | "split",',
    '  "facePresence": "always" | "often" | "sometimes" | "rarely",',
    '  "brandElements": ["logo top-left", "channel name watermark", ...],',
    '  "styleDescription": "A short paragraph describing the overall visual style and recurring patterns"',
    "}",
    "```",
    "",
    "Focus on:",
    "- Color palette: what 3-5 colors dominate the thumbnails",
    "- Text placement: where does text usually appear",
    "- Composition: how are elements arranged",
    "- Faces: how often do faces appear and where are they positioned",
    "- Branding: recurring logos, watermarks, or visual signatures",
    "- Overall: what makes these thumbnails recognizably from this creator",
  ].join("\n");
};

/**
 * Parse the raw Gemini analysis text into structured data.
 */
export const parseStyleAnalysis = (raw: string): StyleAnalysisResult => {
  const defaultResult: StyleAnalysisResult = {
    dominantColors: [],
    textPlacement: "center",
    compositionStyle: "text-heavy",
    facePresence: "sometimes",
    brandElements: [],
    analysisRaw: raw,
  };

  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch?.[1] ?? raw;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    return {
      dominantColors: Array.isArray(parsed.dominantColors)
        ? parsed.dominantColors.map(String)
        : defaultResult.dominantColors,
      textPlacement: typeof parsed.textPlacement === "string"
        ? parsed.textPlacement
        : defaultResult.textPlacement,
      compositionStyle: typeof parsed.compositionStyle === "string"
        ? parsed.compositionStyle
        : defaultResult.compositionStyle,
      facePresence: typeof parsed.facePresence === "string"
        ? parsed.facePresence
        : defaultResult.facePresence,
      brandElements: Array.isArray(parsed.brandElements)
        ? parsed.brandElements.map(String)
        : defaultResult.brandElements,
      analysisRaw: raw,
    };
  } catch {
    return defaultResult;
  }
};
