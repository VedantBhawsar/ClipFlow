/**
 * Settings controller.
 *
 * Adapts the lazy settings-bundle service to HTTP. Read-through cache
 * (30 s, key `settings:${userId}`) so the settings forms don't re-hit
 * Postgres on every navigation.
 *
 * Every response is routed through the centralized `sendOk` helper so
 * the wire envelope matches every other module.
 */
import type { Request, Response } from "express";
import { cache } from "../../lib/cache.js";
import { sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import { getSettings, settingsCacheKey } from "./settings.service.js";
import type { SettingsResponse } from "@clipflow/types";
import "../auth/auth.types.js";

const SETTINGS_CACHE_TTL_SECONDS = 30;

/**
 * GET /api/settings — read-through cache.
 */
export const getSettingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  const userId = req.user.id;
  const key = settingsCacheKey(userId);
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    sendOk(res, JSON.parse(cached) as SettingsResponse, "Settings retrieved.");
    return;
  }
  const result = await getSettings(userId);
  await cache.set(key, JSON.stringify(result), SETTINGS_CACHE_TTL_SECONDS);
  res.setHeader("X-Cache", "MISS");
  sendOk(res, result, "Settings retrieved.");
};