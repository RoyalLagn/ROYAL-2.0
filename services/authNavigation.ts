import { supabase } from "@/services/supabase";
import { normalizeEmail, resolvePublicLoginProfile } from "@/services/publicAuth";
import { resolveVendorDestination, type VendorDestination } from "@/services/vendorAuth";
import { isAdminRole } from "@/services/adminAuth";

export type MobileLoginDestination = { pathname: "/(tabs)" } | VendorDestination;

export async function loginMobileUser(
  email: string,
  password: string,
): Promise<MobileLoginDestination> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error || !data.user || !data.session) {
    throw error ?? new Error("Unable to restore your session.");
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const role = profile?.role ?? data.user.user_metadata?.role;
    if (isAdminRole(role)) {
      throw new Error("Admin access is available through the RoyalLagn Admin Portal.");
    }
    if (role === "vendor") {
      const resolution = await resolveVendorDestination(data.user);
      if (resolution.state === "not_vendor" || resolution.state === "unauthenticated") {
        throw new Error("This Vendor account is not active.");
      }
      return resolution.destination;
    }
    if (role === "public_user") {
      await resolvePublicLoginProfile(data.user);
      return { pathname: "/(tabs)" };
    }
    throw new Error("This account type is not supported in the RoyalLagn mobile app.");
  } catch (caught) {
    await supabase.auth.signOut({ scope: "local" });
    throw caught;
  }
}

export async function getCurrentMobileAccountRole() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Your verification session expired.");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return profile?.role ?? userData.user.user_metadata?.role ?? null;
}
