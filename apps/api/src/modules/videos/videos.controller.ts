/**
 * Videos controller.
 *
 * Thin HTTP adapters. No cache invalidation here — videos aren't part
 * of the `me:${userId}` / `user:${userId}` bundle that other modules
 * cache, so writes don't need to call `cache.del`. The dashboard reads
 * videos via TanStack Query (`useVideos`) which invalidates on its own.
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import * as videosService from "./videos.service.js";
import type { CreateVideoInput } from "./videos.schemas.js";
import "../auth/auth.types.js";

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    res.status(401).json({
      error: "UNAUTHENTICATED",
      message: "Authentication required.",
    });
    return null;
  }
  return req.user.id;
};

const requireEnv = (req: Request, res: Response): Env | null => {
  const env = req.app.get("env") as Env | undefined;
  if (!env) {
    res.status(500).json({
      error: "ENV_UNAVAILABLE",
      message: "Server is not configured.",
    });
    return null;
  }
  return env;
};

/**
 * POST /api/videos
 */
export const createVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const env = requireEnv(req, res);
  if (!env) return;
  const input = req.body as CreateVideoInput;
  const result = await videosService.createVideo(userId, input, env);
  res.status(201).json(result);
};

/**
 * POST /api/videos/:id/upload-url
 */
export const getUploadUrlController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const env = requireEnv(req, res);
  if (!env) return;
  const id = (req.params as { id?: string }).id;
  if (!id) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "id required." });
    return;
  }
  const result = await videosService.getUploadUrl(userId, id, env);
  res.status(200).json(result);
};

/**
 * POST /api/videos/:id/finalize
 */
export const finalizeVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const env = requireEnv(req, res);
  if (!env) return;
  const id = (req.params as { id?: string }).id;
  if (!id) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "id required." });
    return;
  }
  const result = await videosService.finalizeUpload(userId, id, env);
  res.status(200).json(result);
};

/**
 * GET /api/videos
 */
export const listVideosController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const result = await videosService.listVideos(userId);
  res.status(200).json({ videos: result });
};

/**
 * GET /api/videos/:id
 */
export const getVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const id = (req.params as { id?: string }).id;
  if (!id) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "id required." });
    return;
  }
  const result = await videosService.getVideo(userId, id);
  res.status(200).json(result);
};

/**
 * DELETE /api/videos/:id
 */
export const deleteVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const env = requireEnv(req, res);
  if (!env) return;
  const id = (req.params as { id?: string }).id;
  if (!id) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "id required." });
    return;
  }
  await videosService.deleteVideo(userId, id, env);
  res.status(204).send();
};