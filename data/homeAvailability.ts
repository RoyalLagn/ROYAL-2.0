/**
 * UI-only availability fallback.
 *
 * The current vendor model has no availability field or availability API.
 * Keep this isolated so it can be removed as soon as production availability
 * is exposed by the backend.
 */
export const TEMP_AVAILABLE_VENDOR_IDS = new Set([
  "d1", "d2", "p1", "p2", "c1", "c2", "v1", "m1", "me1", "dj1", "bw1", "gw1", "pw1",
]);
