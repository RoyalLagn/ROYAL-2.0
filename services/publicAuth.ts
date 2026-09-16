import type { User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import {
  validateEmail,
  validateFullName,
  normalizePhone,
  validatePassword,
  validatePhone,
} from "@/utils/authValidation";
import { clearRecoverySession } from "@/services/authRecoverySession";

export type PublicProfile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  profile_image: string | null;
  role: "public_user";
  created_at: string;
  updated_at: string;
  preferred_city_id?: string | null;
  preferred_area_id?: string | null;
};

export type SignupDetails = {
  email: string;
  fullName: string;
  phone: string;
  preferredCityId?: string | null;
  preferredAreaId?: string | null;
};

export type OtpPurpose = "signup" | "recovery";

const PROFILE_COLUMNS =
  "id,email,full_name,phone,profile_image,role,created_at,updated_at,preferred_city_id,preferred_area_id";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function getOwnProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as PublicProfile | null;
}

export async function resolvePublicLoginProfile(user: User) {
  let profile = await getOwnProfile(user.id);

  if (!profile && user.user_metadata?.role === "public_user") {
    const metadata = user.user_metadata;
    profile = await createPublicProfile({
      email: normalizeEmail(user.email || ""),
      fullName: String(metadata.full_name || "").trim(),
      phone: String(metadata.phone || ""),
      preferredCityId: metadata.preferred_city_id || null,
      preferredAreaId: metadata.preferred_area_id || null,
    });
  }

  if (!profile || profile.role !== "public_user") {
    throw new Error("This account is not a Public User account.");
  }
  return profile;
}

export async function loginPublicUser(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error("Unable to restore your session.");

  try {
    const profile = await resolvePublicLoginProfile(data.user);
    return { session: data.session, profile };
  } catch (profileError) {
    await supabase.auth.signOut();
    throw profileError;
  }
}

export async function sendSignupOtp(details: SignupDetails) {
  const email = normalizeEmail(details.email);
  if (!validateFullName(details.fullName) || !validatePhone(details.phone) || !validateEmail(email)) {
    throw new Error("Enter a valid full name, phone number, and email address.");
  }
  if (details.preferredAreaId && !details.preferredCityId) {
    throw new Error("Choose a city for the selected area.");
  }
  if (details.preferredCityId) {
    const { data: city, error: cityError } = await supabase
      .from("supported_cities")
      .select("id")
      .eq("id", details.preferredCityId)
      .eq("is_active", true)
      .maybeSingle();
    if (cityError || !city) throw cityError ?? new Error("Choose an active RoyalLagn city.");
  }
  if (details.preferredAreaId) {
    const { data: area, error: areaError } = await supabase
      .from("supported_areas")
      .select("id")
      .eq("id", details.preferredAreaId)
      .eq("city_id", details.preferredCityId)
      .eq("is_active", true)
      .maybeSingle();
    if (areaError || !area) throw areaError ?? new Error("Choose an active RoyalLagn area.");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: {
        role: "public_user",
        full_name: details.fullName.trim(),
        phone: normalizePhone(details.phone),
        preferred_city_id: details.preferredCityId ?? null,
        preferred_area_id: details.preferredAreaId ?? null,
        registration_pending: true,
      },
    },
  });
  if (error) throw error;
  return email;
}

export async function sendRecoveryOtp(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return normalizedEmail;
}

export async function verifyPublicEmailOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token,
    type: "email",
  });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error("OTP verification did not create a session. Please request a new code.");
  }
  return data;
}

export async function completePublicSignup(details: SignupDetails, password: string) {
  if (
    !validateFullName(details.fullName)
    || !validatePhone(details.phone)
    || !validateEmail(details.email)
    || !validatePassword(password)
  ) {
    throw new Error("Your registration details are incomplete or invalid.");
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Your verification session expired.");
  if (normalizeEmail(userData.user.email || "") !== normalizeEmail(details.email)) {
    await supabase.auth.signOut();
    throw new Error("The verified email does not match this registration.");
  }

  const existing = await getOwnProfile(userData.user.id);
  if (existing && existing.role === "public_user") {
    await supabase.auth.signOut();
    throw new Error("An account already exists for this email. Please log in instead.");
  }

  // Create the profile before setting the password. If anything below fails
  // the account is still reachable: the user has no password yet, so signup
  // can be retried from the start and this RPC is idempotent. Doing it the
  // other way round is what used to strand accounts with a working password
  // and no profile row.
  const profile = await createPublicProfile(details);

  const { error } = await supabase.auth.updateUser({
    password,
    data: {
      role: "public_user",
      full_name: details.fullName.trim(),
      phone: normalizePhone(details.phone),
      preferred_city_id: details.preferredCityId ?? null,
      preferred_area_id: details.preferredAreaId ?? null,
      registration_pending: false,
    },
  });
  if (error) throw error;
  return profile;
}

/**
 * Creates (or repairs) the caller's public profile through the idempotent
 * complete_public_registration RPC. Identity comes from the verified JWT
 * server-side, so this is safe to retry.
 */
async function createPublicProfile(details: SignupDetails): Promise<PublicProfile> {
  const { data, error } = await supabase.rpc("complete_public_registration", {
    full_name: details.fullName.trim(),
    phone: normalizePhone(details.phone),
    preferred_city_id: details.preferredCityId || null,
    preferred_area_id: details.preferredAreaId ?? null,
  });
  if (error) throw error;
  if (!data) throw new Error("Your account could not be created. Please try again.");
  return (Array.isArray(data) ? data[0] : data) as PublicProfile;
}

export async function updateRecoveredPassword(password: string) {
  if (!validatePassword(password)) throw new Error("Your new password does not meet the requirements.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Your recovery session expired.");
  const profile = await getOwnProfile(userData.user.id);
  if (!profile || profile.role !== "public_user") {
    await supabase.auth.signOut({ scope: "local" });
    clearRecoverySession();
    throw new Error("This account is not a Public User account.");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) throw signOutError;
  clearRecoverySession();
}

export async function ensurePublicProfile(user: User): Promise<PublicProfile> {
  const profile = await getOwnProfile(user.id);
  if (!profile || profile.role !== "public_user") {
    throw new Error("This account is not a Public User account.");
  }
  return profile;
}

export async function updatePublicProfile(
  userId: string,
  changes: {
    fullName?: string;
    phone?: string | null;
    profileImage?: string | null;
  },
): Promise<PublicProfile> {
  const payload: Record<string, string | null> = {};
  if (changes.fullName !== undefined) {
    if (!validateFullName(changes.fullName)) throw new Error("Enter a valid full name.");
    payload.full_name = changes.fullName.trim();
  }
  if (changes.phone !== undefined) {
    const phone = changes.phone?.trim() || null;
    if (phone && !validatePhone(phone)) throw new Error("Enter a valid phone number.");
    payload.phone = phone ? normalizePhone(phone) : null;
  }
  if (changes.profileImage !== undefined) {
    payload.profile_image = changes.profileImage?.trim() || null;
  }
  if (!Object.keys(payload).length) {
    const current = await getOwnProfile(userId);
    if (!current) throw new Error("Public profile not found.");
    return current;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .eq("role", "public_user")
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return data as PublicProfile;
}

export function getPublicAuthError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login")) return "Incorrect email or password.";
  if (normalized.includes("email not confirmed")) return "Verify your email before logging in.";
  if (normalized.includes("expired")) return "This code has expired. Request a new one.";
  if (normalized.includes("invalid") && (normalized.includes("token") || normalized.includes("otp"))) {
    return "The verification code is invalid. Check the code and try again.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (normalized.includes("rate") || normalized.includes("seconds")) {
    return "Please wait before requesting another code.";
  }
  if (normalized.includes("user not found") || normalized.includes("signups not allowed")) {
    return "No public account was found for this email.";
  }
  if (normalized.includes("already registered for a different")) {
    return "This email is already registered for a different RoyalLagn account.";
  }
  if (normalized.includes("not currently supported") || normalized.includes("choose a supported")) {
    return "Choose a supported RoyalLagn city and try again.";
  }
  if (normalized.includes("has no field") || normalized.includes("complete_public_registration")) {
    return "We couldn’t finish creating your account. Please try again in a moment.";
  }
  return message || fallback;
}
