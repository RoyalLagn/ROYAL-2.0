import type { User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import {
  normalizeEmail,
  type OtpPurpose,
} from "@/services/publicAuth";
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from "@/utils/authValidation";
import { clearRecoverySession } from "@/services/authRecoverySession";

export type VendorSignupDetails = {
  email: string;
  ownerName: string;
  phone: string;
};

export type VendorDestination =
  | { pathname: "/vendor-dashboard" }
  | { pathname: "/BecomeVendor" }
  | {
      pathname: "/VendorAuthStatus";
      params: { status: "pending" | "rejected"; reason?: string };
    };

async function requireVendorProfile(user: User) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.role !== "vendor" || !data.is_active) {
    throw new Error("This account is not an active Vendor account.");
  }
  return data;
}

export async function resolveVendorDestination(user: User): Promise<VendorDestination> {
  await requireVendorProfile(user);
  const email = normalizeEmail(user.email || "");
  const { data: applications, error } = await supabase
    .from("vendor_applications")
    .select("id,status,rejection_reason,profile_id")
    .or(`profile_id.eq.${user.id},email.eq.${email}`)
    .order("submitted_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const application = applications?.[0];
  if (!application) return { pathname: "/BecomeVendor" };
  if (application.status === "pending") {
    return { pathname: "/VendorAuthStatus", params: { status: "pending" } };
  }
  if (application.status === "rejected") {
    return {
      pathname: "/VendorAuthStatus",
      params: {
        status: "rejected",
        reason: application.rejection_reason || undefined,
      },
    };
  }

  const { error: claimError } = await supabase.rpc("claim_vendor_workspace");
  if (claimError) throw claimError;
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id,is_verified")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (vendorError) throw vendorError;
  if (!vendor?.is_verified) {
    return { pathname: "/VendorAuthStatus", params: { status: "pending" } };
  }
  return { pathname: "/vendor-dashboard" };
}

export async function loginVendor(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error || !data.user) throw error ?? new Error("Unable to restore the Vendor session.");
  try {
    return await resolveVendorDestination(data.user);
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
        phone: details.phone.trim(),
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
      phone: details.phone.trim(),
      registration_pending: false,
    },
  });
  if (error || !data.user) throw error ?? new Error("Unable to create the Vendor account.");
  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    email: normalizeEmail(details.email),
    full_name: details.ownerName.trim(),
    phone: details.phone.trim(),
    role: "vendor",
  });
  if (profileError) throw profileError;
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
  return message || fallback;
}

export type VendorOtpPurpose = OtpPurpose;
