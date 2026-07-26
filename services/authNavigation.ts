import { supabase } from "@/services/supabase";
import { resolveVendorDestination, type VendorDestination } from "@/services/vendorAuth";
import { restoreAdminSession } from "@/services/adminAuth";

export type AuthenticationRole = "public" | "vendor" | "admin";

export type RoleDestination =
  | { pathname: "/Login" }
  | { pathname: "/VendorLogin" }
  | { pathname: "/AdminLogin" }
  | { pathname: "/(tabs)/profile" }
  | { pathname: "/admin-dashboard" }
  | VendorDestination;

const loginDestination = (role: AuthenticationRole): RoleDestination => {
  if (role === "public") return { pathname: "/Login" };
  if (role === "vendor") return { pathname: "/VendorLogin" };
  return { pathname: "/AdminLogin" };
};

export async function resolveSelectedRole(
  role: AuthenticationRole,
): Promise<RoleDestination> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return loginDestination(role);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) return loginDestination(role);

  if (role === "public") {
    return profile.role === "public_user"
      ? { pathname: "/(tabs)/profile" }
      : loginDestination(role);
  }

  if (role === "admin") {
    try {
      return (await restoreAdminSession())
        ? { pathname: "/admin-dashboard" }
        : loginDestination(role);
    } catch {
      return loginDestination(role);
    }
  }

  if (profile.role !== "vendor") return loginDestination(role);
  return resolveVendorDestination(data.user);
}
