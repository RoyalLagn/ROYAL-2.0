import { supabase } from "@/services/supabase";
import { restoreAdminSession } from "@/services/adminAuth";

export type AuthenticationRole = "public" | "vendor" | "admin";

export type RoleDestination =
  | { pathname: "/Login" }
  | { pathname: "/VendorAuth" }
  | { pathname: "/AdminLogin" }
  | { pathname: "/(tabs)/profile" }
  | { pathname: "/admin-dashboard" };

const loginDestination = (role: AuthenticationRole): RoleDestination => {
  if (role === "public") return { pathname: "/Login" };
  if (role === "vendor") return { pathname: "/VendorAuth" };
  return { pathname: "/AdminLogin" };
};

export async function resolveSelectedRole(
  role: AuthenticationRole,
): Promise<RoleDestination> {
  // Vendor Login always opens the auth screen — DashboardCenter never
  // resolves or auto-skips a Vendor session. Every Vendor destination past
  // this point is decided exactly once by resolveVendorDestination(),
  // called from VendorAuth itself (services/vendorAuth.ts).
  if (role === "vendor") return loginDestination(role);

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

  try {
    return (await restoreAdminSession())
      ? { pathname: "/admin-dashboard" }
      : loginDestination(role);
  } catch {
    return loginDestination(role);
  }
}
