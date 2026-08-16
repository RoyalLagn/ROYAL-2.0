import { supabase } from "@/services/supabase";
import {
  AdminAuthError,
  verifyAdminRoleSession,
  verifyAdminSession,
  type AdminIdentity,
} from "@/services/adminAuth";
import { ADMIN_MFA_DEV_BYPASS_ENABLED } from "@/services/adminMfaPolicy";

export type AdminMfaRequirement = "setup" | "verify";

export type AdminMfaState = {
  currentLevel: string | null;
  nextLevel: string | null;
  requirement: AdminMfaRequirement | null;
  factorId: string | null;
};

export type AdminMfaEnrollment = {
  factorId: string;
  authenticatorUri: string;
  secret: string;
};

const TOTP_CODE_PATTERN = /^\d{6}$/;
let activeEnrollment: Promise<AdminMfaEnrollment> | null = null;

function verifiedTotpFactor<T extends { status?: string }>(factors: T[]) {
  return factors.find((factor) => factor.status === "verified") ?? null;
}

/** Returns where a role-verified admin must go before workspace access. */
export async function getAdminMfaState(): Promise<AdminMfaState> {
  await verifyAdminRoleSession(undefined, false);
  if (ADMIN_MFA_DEV_BYPASS_ENABLED) {
    return {
      currentLevel: null,
      nextLevel: null,
      requirement: null,
      factorId: null,
    };
  }
  const [assurance, factors] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (assurance.error) throw assurance.error;
  if (factors.error) throw factors.error;

  const verified = verifiedTotpFactor(factors.data.totp);
  const currentLevel = assurance.data.currentLevel;
  const nextLevel = assurance.data.nextLevel;

  return {
    currentLevel,
    nextLevel,
    requirement:
      currentLevel === "aal2" ? null : verified ? "verify" : "setup",
    factorId: verified?.id ?? null,
  };
}

async function removeIncompleteTotpFactors() {
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) throw factors.error;

  if (verifiedTotpFactor(factors.data.totp)) {
    throw new AdminAuthError(
      "Microsoft Authenticator is already configured for this account.",
      "mfa_required",
    );
  }

  for (const factor of factors.data.totp) {
    if (factor.status !== "verified") {
      const removal = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removal.error) throw removal.error;
    }
  }
}

const FACTOR_NAME = "RoyalLagn Admin";

/**
 * Supabase's own auth-js error codes for the TOTP `factors` endpoint. Relying
 * on these (instead of guessing from the HTTP status or message text) lets us
 * tell apart "you're already fully enrolled" from "a stale factor collided on
 * name" from "you're out of factor slots" — each needs a different recovery.
 * See @supabase/auth-js/src/lib/error-codes.ts.
 */
function isAlreadyVerifiedConflict(error: { code?: string }) {
  return error.code === "mfa_verified_factor_exists";
}

function isNameConflict(error: { code?: string }) {
  return error.code === "mfa_factor_name_conflict";
}

async function createAdminMfaEnrollment(): Promise<AdminMfaEnrollment> {
  await verifyAdminRoleSession(undefined, false);
  await removeIncompleteTotpFactors();

  let enrollment = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FACTOR_NAME,
  });
  if (enrollment.error) {
    // Temporary diagnostic: the browser's network panel truncates the
    // response body, so surface Supabase's exact error code/message here
    // where it's easy to copy. Safe to remove once enrollment is reliable.
    console.error("MFA_ENROLL_ERROR", {
      code: enrollment.error.code,
      status: enrollment.error.status,
      message: enrollment.error.message,
    });
  }
  if (enrollment.error && isAlreadyVerifiedConflict(enrollment.error)) {
    throw new AdminAuthError(
      "Microsoft Authenticator is already configured for this account.",
      "mfa_required",
    );
  }
  if (enrollment.error && isNameConflict(enrollment.error)) {
    // A leftover unverified factor (still being deleted server-side, or
    // created by a concurrent render/tab) can briefly collide on friendly
    // name even right after cleanup. Remove it and retry once under a
    // unique name so the retry can never collide with whatever is still
    // settling server-side.
    await removeIncompleteTotpFactors();
    enrollment = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `${FACTOR_NAME} ${Date.now().toString(36)}`,
    });
    if (enrollment.error && isAlreadyVerifiedConflict(enrollment.error)) {
      throw new AdminAuthError(
        "Microsoft Authenticator is already configured for this account.",
        "mfa_required",
      );
    }
  }
  if (enrollment.error?.code === "mfa_totp_enroll_not_enabled") {
    throw new Error(
      "Authenticator sign-in isn't turned on for this project yet. In the Supabase dashboard, go to Authentication → Sign In / Providers → Multi-Factor Authentication and enable TOTP, then retry.",
    );
  }
  if (enrollment.error?.code === "too_many_enrolled_mfa_factors") {
    throw new Error(
      "This account already has the maximum number of Authenticator factors Supabase allows. Remove old ones from the Supabase dashboard (Authentication → Users → this user → MFA) before enrolling again.",
    );
  }
  if (enrollment.error) throw enrollment.error;

  return {
    factorId: enrollment.data.id,
    authenticatorUri: enrollment.data.totp.uri,
    secret: enrollment.data.totp.secret,
  };
}

/** Starts one clean first-time TOTP enrollment for the signed-in administrator. */
export function beginAdminMfaEnrollment(): Promise<AdminMfaEnrollment> {
  if (activeEnrollment) return activeEnrollment;
  activeEnrollment = createAdminMfaEnrollment().finally(() => {
    activeEnrollment = null;
  });
  return activeEnrollment;
}

export async function verifyAdminMfaCode(
  factorId: string,
  code: string,
): Promise<AdminIdentity> {
  const normalizedCode = code.trim();
  if (!TOTP_CODE_PATTERN.test(normalizedCode)) {
    throw new Error("Enter the complete 6-digit Authenticator code.");
  }

  await verifyAdminRoleSession(undefined, false);
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalizedCode,
  });
  if (error) throw error;

  // challengeAndVerify refreshes the active session. Re-read it and require
  // aal2 before returning an authenticated administrator identity.
  return verifyAdminSession(undefined, false);
}

export function getAdminMfaError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/invalid.*(code|totp)|code.*invalid|mfa.*verify/i.test(message)) {
    return "That Authenticator code is invalid or expired. Enter the current code.";
  }
  if (/factor.*already|already.*factor/i.test(message)) {
    return "Microsoft Authenticator is already configured. Continue to verification.";
  }
  if (/rate|too many/i.test(message)) {
    return "Too many attempts. Wait briefly and try again.";
  }
  if (/network|fetch/i.test(message)) {
    return "Network error. Check your connection and try again.";
  }
  return message || fallback;
}
