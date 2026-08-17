import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import { clearRecoverySession } from "@/services/authRecoverySession";
import { normalizeEmail } from "@/services/publicAuth";
import { validateEmail, validatePassword } from "@/utils/authValidation";
import { ADMIN_MFA_DEV_BYPASS_ENABLED } from "@/services/adminMfaPolicy";

export const ADMIN_ROLES = ["admin", "super_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  profile_image: string | null;
  role: AdminRole;
  is_active: boolean;
};

export type AdminIdentity = {
  session: Session;
  user: User;
  profile: AdminProfile;
};

export type AdminAuthErrorCode =
  | "invalid_credentials"
  | "unauthorized"
  | "disabled"
  | "missing_session"
  | "mfa_required"
  | "invalid_recovery";

const ADMIN_PROFILE_COLUMNS =
  "id,email,full_name,phone,profile_image,role,is_active";

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly code: AdminAuthErrorCode,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export function isAdminRole(role: unknown): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

async function getAdminProfile(userId: string): Promise<AdminProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(ADMIN_PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !isAdminRole(data.role)) {
    throw new AdminAuthError(
      "You are not authorized to access the Admin Dashboard.",
      "unauthorized",
    );
  }
  if (!data.is_active) {
    throw new AdminAuthError(
      "Your administrator account has been disabled.",
      "disabled",
    );
  }
  return data as AdminProfile;
}

async function signOutLocalSession() {
  await supabase.auth.signOut({ scope: "local" });
}

function shouldClearAdminSession(error: AdminAuthError) {
  return error.code === "unauthorized" || error.code === "disabled";
}

/**
 * Verifies the password/email session and administrator role without requiring
 * the second factor. This narrower check is intentionally limited to login,
 * MFA enrollment/challenge and password recovery; workspace access must call
 * verifyAdminSession(), which also requires aal2.
 */
export async function verifyAdminRoleSession(
  session?: Session | null,
  clearUnauthorized = true,
): Promise<AdminIdentity> {
  const currentSession =
    session === undefined
      ? (await supabase.auth.getSession()).data.session
      : session;
  if (!currentSession?.user) {
    throw new AdminAuthError("Administrator session required.", "missing_session");
  }

  try {
    const profile = await getAdminProfile(currentSession.user.id);
    return { session: currentSession, user: currentSession.user, profile };
  } catch (error) {
    if (
      clearUnauthorized &&
      error instanceof AdminAuthError &&
      shouldClearAdminSession(error)
    ) {
      await signOutLocalSession();
    }
    throw error;
  }
}

/** Fully verifies an administrator session, including its TOTP second factor. */
export async function verifyAdminSession(
  session?: Session | null,
  clearUnauthorized = true,
): Promise<AdminIdentity> {
  const identity = await verifyAdminRoleSession(session, clearUnauthorized);
  if (ADMIN_MFA_DEV_BYPASS_ENABLED) return identity;
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel !== "aal2") {
    throw new AdminAuthError(
      "Microsoft Authenticator verification required.",
      "mfa_required",
    );
  }
  return identity;
}

export async function loginAdmin(
  email: string,
  password: string,
): Promise<AdminIdentity> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error || !data.session) {
    throw new AdminAuthError(
      "Invalid email or password.",
      "invalid_credentials",
    );
  }
  return verifyAdminRoleSession(data.session);
}

export async function restoreAdminSession(): Promise<AdminIdentity | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return verifyAdminSession(data.session);
}

export async function logoutAdmin() {
  clearRecoverySession();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}

async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : null;
  if (!context) return null;
  try {
    const payload = await context.clone().json();
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  } catch {
    // Fall through — no readable JSON error body.
  }
  return null;
}

/**
 * Revokes every active session for the current administrator account across
 * every device (server-side, via the admin-logout-all-devices Edge
 * Function), then clears this device's own local session exactly like the
 * normal logout. If the server-side revocation fails, this throws before
 * touching the local session, so a failed attempt never leaves the admin
 * logged out here while other devices remain logged in undetected.
 */
export async function logoutAdminAllDevices() {
  const identity = await verifyAdminSession(undefined, false);
  const { data, error } = await supabase.functions.invoke<{ success?: boolean }>(
    "admin-logout-all-devices",
    { headers: { Authorization: `Bearer ${identity.session.access_token}` } },
  );
  if (error) {
    const detail = await readFunctionErrorMessage(error);
    throw new Error(detail || error.message || "Unable to sign out of all devices. Try again.");
  }
  if (!data?.success) {
    throw new Error("Unable to sign out of all devices. Try again.");
  }
  clearRecoverySession();
  const { error: localError } = await supabase.auth.signOut({ scope: "local" });
  if (localError) throw localError;
}

export async function sendAdminRecoveryOtp(email: string) {
  const normalized = normalizeEmail(email);
  if (!validateEmail(normalized)) {
    throw new Error("Enter a valid registered administrator email address.");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return normalized;
}

export async function verifyAdminRecoveryOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token,
    type: "email",
  });
  if (error || !data.session || !data.user) {
    throw error ?? new AdminAuthError(
      "OTP verification did not create a recovery session.",
      "invalid_recovery",
    );
  }
  try {
    await getAdminProfile(data.user.id);
  } catch (profileError) {
    await signOutLocalSession();
    throw profileError;
  }
  return data;
}

export async function updateAdminRecoveredPassword(password: string) {
  if (!validatePassword(password)) {
    throw new Error("Your new password does not meet the requirements.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new AdminAuthError("Your recovery session expired.", "invalid_recovery");
  }
  await verifyAdminRoleSession(data.session);
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) throw updateError;
  await logoutAdmin();
}

export function getAdminAuthError(error: unknown, fallback: string) {
  if (error instanceof AdminAuthError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (/invalid login/i.test(message)) return "Invalid email or password.";
  if (/expired/i.test(message)) return "This code has expired. Request a new one.";
  if (/invalid.*(token|otp)|(token|otp).*invalid/i.test(message)) {
    return "The verification code is invalid.";
  }
  if (/rate|seconds/i.test(message)) {
    return "Please wait before requesting another code.";
  }
  if (/network|fetch/i.test(message)) {
    return "Network error. Check your connection and try again.";
  }
  return message || fallback;
}
