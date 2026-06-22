/**
 * Typed application error used across the API. Services/controllers throw
 * `AppError` instances; the central error middleware maps them to
 * `ApiErrorBody` JSON with the appropriate `statusCode`. Unknown errors are
 * converted to a generic 500 by the middleware — never reach for `throw new
 * Error(...)` directly in route handlers.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  /**
   * Construct a typed application error.
   *
   * @param statusCode HTTP status code to return (e.g. 400, 401, 404, 409, 500).
   * @param code Stable machine-readable error code (e.g. "EMAIL_TAKEN", "INVALID_CREDENTIALS").
   * @param message Human-friendly message safe to show to end users.
   * @param details Optional structured detail payload (e.g. field-level validation errors).
   */
  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Preserve a clean prototype chain for `instanceof` after transpilation to ES5.
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
