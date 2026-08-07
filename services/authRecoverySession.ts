import { Platform } from "react-native";

/**
 * Tracks the short-lived Supabase session created by a password-recovery OTP.
 * That session authenticates the user, but it must not be treated as a normal
 * login: the auth contexts check this flag so a half-finished recovery never
 * drops the user into the app.
 *
 * On web the flag is mirrored into sessionStorage because a reload between the
 * OTP screen and the new-password screen would otherwise lose it and let the
 * recovery session pass as a real login.
 */
const STORAGE_KEY = "royallagn.auth.recovery-active";

let recoverySessionActive = false;

function webStorage(): Storage | null {
  if (Platform.OS !== "web") return null;
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Storage can throw in privacy modes / sandboxed frames.
    return null;
  }
}

export function markRecoverySessionActive() {
  recoverySessionActive = true;
  try {
    webStorage()?.setItem(STORAGE_KEY, "1");
  } catch {
    // In-memory flag still covers this session.
  }
}

export function clearRecoverySession() {
  recoverySessionActive = false;
  try {
    webStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clean up.
  }
}

export function isRecoverySessionActive() {
  if (recoverySessionActive) return true;
  try {
    return webStorage()?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
