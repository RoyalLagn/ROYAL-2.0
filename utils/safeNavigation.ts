export type SafeNavigationTarget = {
  pathname: string;
  params?: Record<string, string>;
};

/**
 * Converts a stored notification target into an internal route only when its
 * pathname is explicitly allowed. This keeps malformed, stale, protocol-based,
 * and cross-role targets from reaching Expo Router.
 */
export function safeInternalTarget(
  path: string | null | undefined,
  allowedPathnames: ReadonlySet<string>,
): SafeNavigationTarget | null {
  const candidate = path?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return null;

  const queryIndex = candidate.indexOf("?");
  const pathname = queryIndex >= 0 ? candidate.slice(0, queryIndex) : candidate;
  if (!allowedPathnames.has(pathname)) return null;

  if (queryIndex < 0 || queryIndex === candidate.length - 1) return { pathname };

  const params = Object.fromEntries(new URLSearchParams(candidate.slice(queryIndex + 1)).entries());
  return Object.keys(params).length ? { pathname, params } : { pathname };
}
