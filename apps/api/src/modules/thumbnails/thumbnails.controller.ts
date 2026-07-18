import type { Request, Response, NextFunction } from "express";
import type { Env } from "@clipflow/config";
import { prisma } from "../../lib/prisma.js";
import * as thumbnailsService from "./thumbnails.service.js";

const getEnv = (req: Request): Env => req.app.get("env") as Env;
const getUserId = (req: Request): string => req.user!.id;

export const listThumbnailsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await thumbnailsService.listThumbnails(
      req.params.id!,
      getUserId(req),
    );
    res.json({ success: true, data: result, message: "Thumbnails retrieved." });
  } catch (err) {
    next(err);
  }
};

export const selectThumbnailController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await thumbnailsService.selectThumbnail(
      req.params.id!,
      req.params.thumbnailId!,
      getUserId(req),
    );
    res.json({ success: true, data: result, message: "Thumbnail selected." });
  } catch (err) {
    next(err);
  }
};

export const regenerateThumbnailsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Fetch the user's email verification status from DB
    const user = await prisma.user.findUnique({
      where: { id: getUserId(req) },
      select: { emailVerifiedAt: true },
    });

    const result = await thumbnailsService.regenerateThumbnails(
      req.params.id!,
      getUserId(req),
      user?.emailVerifiedAt ?? null,
      getEnv(req),
    );
    res.json({
      success: true,
      data: result,
      message: "Thumbnail regeneration started.",
    });
  } catch (err) {
    next(err);
  }
};

export const getThumbnailStyleController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await thumbnailsService.getThumbnailStyle(getUserId(req));
    res.json({
      success: true,
      data: result,
      message: result ? "Style profile retrieved." : "No style profile yet.",
    });
  } catch (err) {
    next(err);
  }
};

export const updateThumbnailStyleController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await thumbnailsService.updateThumbnailStyle(
      getUserId(req),
      req.body.styleOverride,
    );
    res.json({ success: true, data: result, message: "Style override saved." });
  } catch (err) {
    next(err);
  }
};

export const triggerStyleAnalysisController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const body = (req.body ?? {}) as {
      selectedThumbnailUrls?: string[];
    };
    if (body.selectedThumbnailUrls && body.selectedThumbnailUrls.length > 0) {
      // User picked references themselves — branch to the personalized
      // enqueue. The Zod schema in `triggerStyleAnalysisBodySchema`
      // already enforced 1-4 URLs and a valid image extension; the
      // service re-asserts the size cap and the channel-connected gate.
      const result = await thumbnailsService.triggerPersonalizedStyleAnalysis(
        getUserId(req),
        body.selectedThumbnailUrls,
        getEnv(req),
      );
      res.json({
        success: true,
        data: result,
        message: "Style analysis started. We'll let you know when it's ready.",
      });
      return;
    }

    await thumbnailsService.triggerStyleAnalysis(getUserId(req), getEnv(req));
    res.json({
      success: true,
      data: null,
      message: "Style analysis started. Results will appear shortly.",
    });
  } catch (err) {
    next(err);
  }
};
