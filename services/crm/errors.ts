// Every CRM service call ends in `if (error) throw error`, where `error` is
// the raw object Supabase/PostgREST hands back from `{ data, error }` — a
// plain object (`{ message, details, hint, code }`), not an `Error`
// instance, unless `.throwOnError()` was used. Every CRM screen's catch
// block checks `reason instanceof Error` to decide whether to show the real
// message or a generic fallback, so a raw throw silently defeats every one
// of those checks and only the fallback text is ever shown — regardless of
// the actual failure (permission denied, bad input, expired workspace,
// network error, ...). Route every CRM Supabase error through this so the
// real message always reaches the UI.
export function crmError(error: { message?: string; code?: string; details?: string; hint?: string } | Error | null | undefined, fallback = "Something went wrong. Please try again."): Error {
  if (!error) return new Error(fallback);
  if (error instanceof Error) return error;
  const wrapped = new Error(error.message?.trim() || fallback);
  wrapped.name = "CrmSupabaseError";
  if (error.code) (wrapped as Error & { code?: string }).code = error.code;
  if (error.details) (wrapped as Error & { details?: string }).details = error.details;
  if (error.hint) (wrapped as Error & { hint?: string }).hint = error.hint;
  return wrapped;
}
