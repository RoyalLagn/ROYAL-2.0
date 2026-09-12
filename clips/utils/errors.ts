export type ClipErrorCode =
  | "VALIDATION_ERROR"
  | "PERMISSION_ERROR"
  | "UPLOAD_ERROR"
  | "COMPRESSION_ERROR"
  | "MEDIA_ERROR"
  | "DATABASE_ERROR"
  | "NOT_FOUND"
  | "LIMIT_EXCEEDED"
  | "UNKNOWN_ERROR";

export class ClipModuleError extends Error {
  constructor(
    public readonly code: ClipErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly cause?: unknown,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ClipModuleError";
  }
}

export function asClipError(error: unknown, fallback = "Clip operation failed.") {
  if (error instanceof ClipModuleError) return error;
  return new ClipModuleError(
    "UNKNOWN_ERROR",
    error instanceof Error ? error.message : fallback,
    false,
    error,
  );
}
