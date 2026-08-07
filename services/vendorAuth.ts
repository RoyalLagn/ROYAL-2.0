import type { User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import {
  normalizeEmail,
  type OtpPurpose,
} from "@/services/publicAuth";
import {
  validateEmail,
  validateFullName,
  normalizePhone,
  validatePassword,
  validatePhone,
} from "@/utils/authValidation";
import { clearRecoverySession } from "@/services/authRecoverySession";

export type VendorSignupDetails = {
  email: string;
  ownerName: string;
  phone: string;
};

export type VendorApplicationSummary = {
  id: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  profile_id: string | null;
};

export type VendorRecord = { id: string; is_verified: boolean; profile_id: string | null };

/** Every state the centralized resolver can settle on. Exactly one state
 * maps to exactly one destination -- see `destinationForState`. */
export type VendorResolutionState =
  | "unauthenticated"
  | "not_vendor"
  | "no_application"
  | "pending"
  | "rejected"
  | "approved_unverified"
  | "approved_verified";

export type VendorDestination =
  | { pathname: "/VendorAuth" }
  | { pathname: "/BecomeVendor" }
  | { pathname: "/VendorAuthStatus"; params: { status: "pending" | "rejected"; reason?: string } }
  | { pathname: "/vendor-dashboard" };

export type VendorResolution = {
  state: VendorResolutionState;
  destination: VendorDestination;
  application: VendorApplicationSummary | null;
  vendor: VendorRecord | null;
};

// ---------------------------------------------------------------------------
// Safe error logging. Never logs tokens, passwords, or session contents --
// only the fields PostgREST/Postgres put on a query error.
// ---------------------------------------------------------------------------
export function logSupabaseError(context: string, error: unknown) {
  const e = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  if (e && typeof e === "object" && ("code" in e || "message" in e)) {
    console.error(`[vendorAuth] ${context}`, {
      code: e.code ?? null,
      message: e.message ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
    });
  } else {
    console.error(`[vendorAuth] ${context}`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Retry helper. Postgres/PostgREST errors that carry a `code` are
// deterministic query results (bad input, RLS denial, no matching row,
// business-rule rejection) -- retrying them just repeats the same failure
// and, for a raised exception like claim_vendor_workspace's "no matching
// application", turns one 400 into several. Only genuine transport failures
// (no response reached the server) are retried, with a small capped count.
// ---------------------------------------------------------------------------
function isRetryableTransportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; status?: number; message?: string };
  if (typeof e.status === "number") return e.status === 429 || e.status >= 500;
  if (e.code) return false; // a Postgres/PostgREST error code means the server answered.
  return /network|fetch|timeout|failed to fetch/i.test(e.message || "");
}

async function withTransportRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableTransportError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 3 ** attempt));
    }
  }
  throw lastError;
}

async function fetchVendorProfile(userId: string) {
  const { data, error } = await withTransportRetry(async () =>
    supabase.from("profiles").select("id,email,role,is_active").eq("id", userId).maybeSingle()
  );
  if (error) {
    logSupabaseError("fetchVendorProfile", error);
    throw error;
  }
  return data;
}

async function fetchLatestApplication(userId: string, email: string): Promise<VendorApplicationSummary | null> {
  const { data, error } = await withTransportRetry(async () =>
    supabase
      .from("vendor_applications")
      .select("id,status,rejection_reason,profile_id")
      .or(`profile_id.eq.${userId},email.eq.${email}`)
      .order("submitted_at", { ascending: false })
      .limit(1)
  );
  if (error) {
    logSupabaseError("fetchLatestApplication", error);
    throw error;
  }
  return (data?.[0] as VendorApplicationSummary | undefined) ?? null;
}

async function fetchVendorRecord(userId: string): Promise<VendorRecord | null> {
  const { data, error } = await withTransportRetry(async () =>
    supabase.from("vendors").select("id,is_verified,profile_id").eq("profile_id", userId).maybeSingle()
  );
  if (error) {
    logSupabaseError("fetchVendorRecord", error);
    throw error;
  }
  return data as VendorRecord | null;
}

/**
 * The single, centralized resolver for "where should this vendor land".
 * Performs one round of fetches (profile -> application -> vendor) and
 * returns exactly one destination. It is safe to call repeatedly (each
 * state's destination is idempotent to compute), but callers must not call
 * it from more than one place per navigation decision -- see
 * context/VendorAuthContext.tsx, which is the only owner of this call.
 *
 * claim_vendor_workspace() is invoked at most once per resolve, and only
 * when the application is approved but the vendor workspace is not yet
 * linked to this profile / not yet verified. A vendor who already has a
 * linked, verified workspace never triggers the RPC.
 */
export async function resolveVendorDestination(user: User | null): Promise<VendorResolution> {
  if (!user) {
    return { state: "unauthenticated", destination: { pathname: "/VendorAuth" }, application: null, vendor: null };
  }

  const profile = await fetchVendorProfile(user.id);
  if (!profile || profile.role !== "vendor" || !profile.is_active) {
    return { state: "not_vendor", destination: { pathname: "/VendorAuth" }, application: null, vendor: null };
  }

  const email = normalizeEmail(user.email || "");
  const application = await fetchLatestApplication(user.id, email);

  if (!application) {
    return { state: "no_application", destination: { pathname: "/BecomeVendor" }, application: null, vendor: null };
  }

  if (application.status === "pending") {
    return {
      state: "pending",
      destination: { pathname: "/VendorAuthStatus", params: { status: "pending" } },
      application,
      vendor: null,
    };
  }

  if (application.status === "rejected") {
    return {
      state: "rejected",
      destination: {
        pathname: "/VendorAuthStatus",
        params: { status: "rejected", reason: application.rejection_reason || undefined },
      },
      application,
      vendor: null,
    };
  }

  // application.status === "approved" from here on.
  let vendor = await fetchVendorRecord(user.id);
  const needsClaim = !vendor || vendor.profile_id !== user.id || !vendor.is_verified;

  if (needsClaim) {
    const { error: claimError } = await supabase.rpc("claim_vendor_workspace");
    if (claimError) {
      logSupabaseError("claim_vendor_workspace", claimError);
      throw claimError;
    }
    vendor = await fetchVendorRecord(user.id);
  }

  if (!vendor?.is_verified) {
    return {
      state: "approved_unverified",
      destination: { pathname: "/VendorAuthStatus", params: { status: "pending" } },
      application,
      vendor,
    };
  }

  return { state: "approved_verified", destination: { pathname: "/vendor-dashboard" }, application, vendor };
}

async function requireVendorProfile(user: User) {
  const profile = await fetchVendorProfile(user.id);
  if (!profile || profile.role !== "vendor" || !profile.is_active) {
    throw new Error("This account is not an active Vendor account.");
  }
  return profile;
}

/** Password login -- verifies vendor role, session is ready for the caller
 * to resolve a destination via resolveVendorDestination(). */
export async function loginVendor(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error || !data.user) throw error ?? new Error("Unable to restore the Vendor session.");
  try {
    await requireVendorProfile(data.user);
    return data.user;
  } catch (caught) {
    await supabase.auth.signOut();
    throw caught;
  }
}

export async function sendVendorSignupOtp(details: VendorSignupDetails) {
  if (
    !validateFullName(details.ownerName)
    || !validatePhone(details.phone)
    || !validateEmail(details.email)
  ) {
    throw new Error("Enter a valid owner name, phone number, and business email.");
  }
  const email = normalizeEmail(details.email);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        role: "vendor",
        full_name: details.ownerName.trim(),
        phone: normalizePhone(details.phone),
        registration_pending: true,
      },
    },
  });
  if (error) throw error;
  return email;
}

export async function sendVendorRecoveryOtp(email: string) {
  const normalized = normalizeEmail(email);
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return normalized;
}

export async function verifyVendorOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token,
    type: "email",
  });
  if (error || !data.user || !data.session) {
    throw error ?? new Error("OTP verification did not create a session.");
  }
  return data;
}

export async function completeVendorSignup(details: VendorSignupDetails, password: string) {
  if (
    !validateFullName(details.ownerName)
    || !validatePhone(details.phone)
    || !validateEmail(details.email)
    || !validatePassword(password)
  ) throw new Error("Your Vendor registration details are incomplete or invalid.");

  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError || !current.user) throw currentError ?? new Error("Your verification session expired.");
  if (normalizeEmail(current.user.email || "") !== normalizeEmail(details.email)) {
    await supabase.auth.signOut();
    throw new Error("The verified email does not match this Vendor registration.");
  }
  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", current.user.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    await supabase.auth.signOut();
    throw new Error("An account already exists for this email. Please log in.");
  }

  const { data, error } = await supabase.auth.updateUser({
    password,
    data: {
      role: "vendor",
      full_name: details.ownerName.trim(),
      phone: normalizePhone(details.phone),
      registration_pending: false,
    },
  });
  if (error || !data.user) throw error ?? new Error("Unable to create the Vendor account.");
  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    email: normalizeEmail(details.email),
    full_name: details.ownerName.trim(),
    phone: normalizePhone(details.phone),
    role: "vendor",
  });
  if (profileError) throw profileError;

  // updateUser() refreshes the existing session in place and does not sign
  // the user out, but confirm a usable session actually survived before the
  // caller navigates into BecomeVendor, which requires one.
  const { data: sessionCheck } = await supabase.auth.getSession();
  if (!sessionCheck.session) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      throw new Error("Your account was created, but the session could not be restored. Please log in.");
    }
  }
}

export async function updateVendorRecoveredPassword(password: string) {
  if (!validatePassword(password)) throw new Error("The password does not meet the requirements.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Your recovery session expired.");
  try {
    await requireVendorProfile(data.user);
  } catch (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    clearRecoverySession();
    throw profileError;
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) throw updateError;
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) throw signOutError;
  clearRecoverySession();
}

export function getVendorAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/invalid login/i.test(message)) return "Incorrect business email or password.";
  if (/expired/i.test(message)) return "This OTP has expired. Request a new one.";
  if (/rate|seconds/i.test(message)) return "Please wait before requesting another OTP.";
  if (/network|fetch/i.test(message)) return "Network error. Check your connection and try again.";
  if (/invalid.*(token|otp)|(token|otp).*invalid/i.test(message)) return "The verification code is invalid.";
  if (/no matching vendor application/i.test(message)) {
    return "No Vendor business is connected to this account. Sign in with your approved Vendor email.";
  }
  return message || fallback;
}

export type VendorOtpPurpose = OtpPurpose;
