import type { ThumbnailDto, ChannelThumbnailStyleDto } from "@clipflow/types";

export const toThumbnailDto = (row: {
  id: string;
  videoId: string;
  s3Key: string;
  source: string;
  generationIndex: number;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  createdAt: Date;
}): ThumbnailDto => ({
  id: row.id,
  videoId: row.videoId,
  s3Key: row.s3Key,
  source: row.source as ThumbnailDto["source"],
  generationIndex: row.generationIndex,
  width: row.width,
  height: row.height,
  fileSizeBytes: row.fileSizeBytes,
  createdAt: row.createdAt.toISOString(),
});

export const toStyleDto = (row: {
  id: string;
  dominantColors: unknown;
  textPlacement: string | null;
  compositionStyle: string | null;
  facePresence: string | null;
  brandElements: unknown;
  analysisRaw: string | null;
  styleOverride: string;
  thumbnailCount: number;
  lastAnalyzedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChannelThumbnailStyleDto => ({
  id: row.id,
  dominantColors: Array.isArray(row.dominantColors)
    ? row.dominantColors.map(String)
    : null,
  textPlacement: row.textPlacement,
  compositionStyle: row.compositionStyle,
  facePresence: row.facePresence,
  brandElements: Array.isArray(row.brandElements)
    ? row.brandElements.map(String)
    : null,
  analysisRaw: row.analysisRaw,
  styleOverride: row.styleOverride as ChannelThumbnailStyleDto["styleOverride"],
  thumbnailCount: row.thumbnailCount,
  lastAnalyzedAt: row.lastAnalyzedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
