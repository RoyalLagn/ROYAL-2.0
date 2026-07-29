export type ClipLogScope =
  | "upload"
  | "compression"
  | "cloudinary"
  | "database"
  | "analytics"
  | "moderation";
export type ClipLogLevel = "debug" | "info" | "warn" | "error";
export type ClipLogSink = (
  level: ClipLogLevel,
  scope: ClipLogScope,
  message: string,
  context?: Record<string, unknown>,
) => void;

let sink: ClipLogSink | null = null;

function write(
  level: ClipLogLevel,
  scope: ClipLogScope,
  message: string,
  context?: Record<string, unknown>,
) {
  const details = { timestamp: new Date().toISOString(), ...context };
  if (sink) {
    sink(level, scope, message, details);
    return;
  }
  const method = level === "debug" ? "log" : level;
  let serialized = "";
  try {
    serialized = JSON.stringify(details);
  } catch {
    serialized = JSON.stringify({ timestamp: details.timestamp, context: "Unable to serialize log context" });
  }
  console[method](`[Clips][${scope}] ${message} ${serialized}`);
}

export const ClipLogger = {
  configure(nextSink: ClipLogSink | null) {
    sink = nextSink;
  },
  debug(scope: ClipLogScope, message: string, context?: Record<string, unknown>) {
    write("debug", scope, message, context);
  },
  info(scope: ClipLogScope, message: string, context?: Record<string, unknown>) {
    write("info", scope, message, context);
  },
  warn(scope: ClipLogScope, message: string, context?: Record<string, unknown>) {
    write("warn", scope, message, context);
  },
  error(scope: ClipLogScope, message: string, context?: Record<string, unknown>) {
    write("error", scope, message, context);
  },
  uploadDebug(
    uploadId: string,
    stage: string,
    event: "START" | "DONE" | "PROGRESS" | "ERROR" | "FINALLY",
    context?: Record<string, unknown>,
  ) {
    write(
      event === "ERROR" ? "error" : "info",
      "upload",
      `[CLIP-DEBUG][${uploadId}] ${stage} ${event}`,
      { uploadId, stage, event, ...context },
    );
  },
};
