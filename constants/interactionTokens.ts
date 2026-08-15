/**
 * Shared native interaction geometry. Android's 48dp floor also satisfies
 * iOS's 44pt minimum, so one value keeps cross-platform controls consistent.
 */
export const interactionTokens = {
  minimumTouchTarget: 48,
} as const;
