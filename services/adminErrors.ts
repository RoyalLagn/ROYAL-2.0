/** Supabase/PostgREST errors are often plain objects rather than Error instances. */
export function adminErrorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = String((cause as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}
