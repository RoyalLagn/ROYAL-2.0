const DEV_BYPASS_REQUESTED =
  process.env.EXPO_PUBLIC_ADMIN_MFA_DEV_BYPASS === "true";

function isLoopbackWebHost() {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

/**
 * Temporary local debugging escape hatch.
 *
 * Production bundles can never enable this because __DEV__ is false, and web
 * development is additionally restricted to the local machine. The enrolled
 * Supabase Authenticator factor is intentionally left untouched.
 */
export const ADMIN_MFA_DEV_BYPASS_ENABLED =
  __DEV__ && DEV_BYPASS_REQUESTED && isLoopbackWebHost();
