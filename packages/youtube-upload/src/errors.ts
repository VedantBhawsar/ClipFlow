/**
 * Typed errors thrown by `publishVideo` and its collaborators. The
 * worker uses these to decide whether to retry (transient) or to
 * stop and mark the video PUBLISH_FAILED (permanent).
 */

/**
 * Permanent reason codes — kept narrow so the UI can surface a
 * meaningful message for each.
 */
export type PermanentReasonCode =
  | "QUOTA_EXCEEDED"
  | "INVALID_METADATA"
  | "FORBIDDEN"
  | "CHANNEL_NOT_CONNECTED"
  | "CHANNEL_NEEDS_REAUTH"
  | "VIDEO_NOT_FOUND"
  | "VIDEO_NOT_PUBLISHED"
  | "MALFORMED_RESPONSE";

/**
 * A transient failure — network error, 5xx, 408, or 429 from YouTube.
 * The worker should let BullMQ retry per its backoff policy.
 */
export class TransientPublishError extends Error {
  public readonly code = "TRANSIENT_PUBLISH_ERROR" as const;
  public readonly httpStatus?: number;

  constructor(message: string, httpStatus?: number) {
    super(message);
    this.name = "TransientPublishError";
    this.httpStatus = httpStatus;
    Object.setPrototypeOf(this, TransientPublishError.prototype);
  }
}

/**
 * A permanent failure — YouTube rejected the request for a reason that
 * won't fix itself on retry. The worker marks the video PUBLISH_FAILED
 * with this reason and stops retrying.
 */
export class PermanentPublishError extends Error {
  public readonly code = "PERMANENT_PUBLISH_ERROR" as const;
  public readonly reasonCode: PermanentReasonCode;
  public readonly httpStatus?: number;

  constructor(reasonCode: PermanentReasonCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "PermanentPublishError";
    this.reasonCode = reasonCode;
    this.httpStatus = httpStatus;
    Object.setPrototypeOf(this, PermanentPublishError.prototype);
  }
}

/**
 * Decide whether an HTTP status is transient (retry) or permanent
 * (fail fast). 408 Request Timeout and 429 Too Many Requests are
 * transient. Everything in 5xx is transient. Other 4xx are permanent.
 */
export const isTransientHttpStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;