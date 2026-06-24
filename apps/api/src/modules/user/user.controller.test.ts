/**
 * Unit tests for the YouTube-connection controller.
 *
 * The wire contract under test is the centralized envelope
 * `{ success: true, message, data: <YouTubeConnection> }`.
 *
 * Regression: this endpoint previously returned a bare `YouTubeConnection`
 * DTO. The frontend `api-client` reads `response.json().data`, so the
 * YouTubeConnectCard fell back to its "disconnected" UI even when the
 * channel was connected — which is what made the dashboard show
 * "Connect your YouTube channel" after a successful OAuth. These tests
 * pin the envelope shape so that regression cannot happen silently.
 */
import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";

import { getYouTubeConnectionController } from "./user.controller.js";
import * as youtubeService from "../youtube/youtube.service.js";
import type { YouTubeConnection } from "@clipflow/types";
import type { AuthUser } from "@clipflow/types";

/**
 * Minimal Express response mock. `res.status(N).json(body)` chains the
 * way the real Express `Response` does (returns `res`), which is what
 * `sendOk` relies on.
 */
const buildMockResponse = () => {
  let resRef: Response;
  const json = vi.fn().mockImplementation(() => resRef);
  const status = vi.fn().mockImplementation(() => ({ json }));
  const res = { status, json } as unknown as Response;
  resRef = res;
  return { res, json, status };
};

const buildMockRequest = (user: AuthUser | null): Request => {
  return { user } as unknown as Request;
};

describe("getYouTubeConnectionController", () => {
  it("wraps the connection in the { success, message, data } envelope", async () => {
    const connection: YouTubeConnection = {
      status: "connected",
      channelId: "UCabc",
      channelTitle: "Test Channel",
      channelThumbnailUrl: "https://example.com/thumb.jpg",
      connectedAt: "2026-06-22T15:31:26.638Z",
      lastVerifiedAt: "2026-06-24T16:02:45.593Z",
    };
    const spy = vi
      .spyOn(youtubeService, "getYouTubeConnectionByUserId")
      .mockResolvedValue(connection);

    const user = { id: "user-1" } as AuthUser;
    const { res, status, json } = buildMockResponse();
    await getYouTubeConnectionController(
      buildMockRequest(user),
      res,
    );

    // Wire shape: envelope only — frontend unwraps `.data`.
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "YouTube connection retrieved.",
      data: connection,
    });

    // Sanity check: the connection is reachable at `data`, not at the
    // top level (the exact mistake that caused the dashboard bug).
    const envelopeArg = json.mock.calls[0]?.[0] as {
      success?: boolean;
      data?: YouTubeConnection;
    };
    expect(envelopeArg.success).toBe(true);
    expect(envelopeArg.data?.status).toBe("connected");
    expect(envelopeArg.data?.channelId).toBe("UCabc");

    spy.mockRestore();
  });

  it("returns the disconnected stub inside the envelope when no row exists", async () => {
    const stub: YouTubeConnection = {
      status: "disconnected",
      channelId: null,
      channelTitle: null,
      channelThumbnailUrl: null,
      connectedAt: null,
      lastVerifiedAt: null,
    };
    const spy = vi
      .spyOn(youtubeService, "getYouTubeConnectionByUserId")
      .mockResolvedValue(stub);

    const user = { id: "user-2" } as AuthUser;
    const { res, json } = buildMockResponse();
    await getYouTubeConnectionController(
      buildMockRequest(user),
      res,
    );

    const envelopeArg = json.mock.calls[0]?.[0] as {
      success?: boolean;
      data?: YouTubeConnection;
    };
    expect(envelopeArg.success).toBe(true);
    expect(envelopeArg.data).toEqual(stub);

    spy.mockRestore();
  });

  it("throws UNAUTHENTICATED when requireAuth did not populate req.user", async () => {
    // Defensive guard: requireAuth should have populated this, but if
    // it didn't the controller must throw the canonical AppError so the
    // central error middleware emits the failure envelope — NOT write
    // a raw { error, message } shape like the previous implementation.
    const user = null;
    const { res } = buildMockResponse();

    await expect(
      getYouTubeConnectionController(buildMockRequest(user), res),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  });
});
