import type { ClipCursor } from "../types";
import { ClipModuleError } from "./errors";

export function encodeClipCursor(cursor: ClipCursor): string {
  return `${cursor.createdAt}|${cursor.id}`;
}

export function decodeClipCursor(value?: string | null): ClipCursor | null {
  if (!value) return null;
  const separator = value.lastIndexOf("|");
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (separator < 1 || !id || Number.isNaN(Date.parse(createdAt))) {
    throw new ClipModuleError("VALIDATION_ERROR", "Invalid Clips cursor.");
  }
  return { createdAt, id };
}
