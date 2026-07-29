export type AppEventName = "open_clips" | "share_app";
export type AppEventPayload = Record<string, string | number | boolean | null>;
export type AppEventHandler = (
  name: AppEventName,
  payload?: AppEventPayload,
) => void;

let handler: AppEventHandler | null = null;

export function setAppEventHandler(nextHandler: AppEventHandler | null) {
  handler = nextHandler;
}

export function trackAppEvent(
  name: AppEventName,
  payload?: AppEventPayload,
) {
  handler?.(name, payload);
}
