import { supabase } from "@/services/supabase";
import type { TeamMembership, TeamPermission } from "@/types/team";

export const TeamAuthService = {
  /**
   * Fetches team membership for the currently authenticated user.
   * If the user is an admin in profiles, auto-synthesizes an admin_owner membership if not explicitly defined.
   */
  async getCurrentTeamMembership(): Promise<TeamMembership | null> {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) return null;

      const userId = authData.user.id;

      // 1. Check team_memberships table
      const { data: memberData, error: memberError } = await supabase
        .from("team_memberships")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (memberData) {
        return {
          id: memberData.id,
          userId: memberData.user_id,
          email: memberData.email,
          fullName: memberData.full_name,
          phone: memberData.phone,
          permissions: (memberData.permissions || []) as TeamPermission[],
          isActive: memberData.is_active,
          createdBy: memberData.created_by,
          createdAt: memberData.created_at,
          updatedAt: memberData.updated_at,
        };
      }

      // 2. Check profiles table for admin / super_admin role
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, full_name, phone, role, is_active")
        .eq("id", userId)
        .maybeSingle();

      if (profile && (profile.role === "admin" || profile.role === "super_admin") && profile.is_active) {
        return {
          id: `admin-${profile.id}`,
          userId: profile.id,
          email: profile.email,
          fullName: profile.full_name || "Platform Admin",
          phone: profile.phone,
          permissions: [
            "payment_verifier",
            "finance_operator",
            "vendor_verifier",
            "marketing_teammate",
            "team_manager",
            "admin_owner",
          ],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      return null;
    } catch (err) {
      console.error("getCurrentTeamMembership error:", err);
      return null;
    }
  },

  hasPermission(membership: TeamMembership | null, permission: TeamPermission): boolean {
    if (!membership || !membership.isActive) return false;
    if (membership.permissions.includes("admin_owner")) return true;
    return membership.permissions.includes(permission);
  },

  canVerifyPayments(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "payment_verifier") || this.hasPermission(membership, "team_manager");
  },

  canHandleFinance(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "finance_operator") || this.hasPermission(membership, "team_manager");
  },

  canVerifyVendors(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "vendor_verifier") || this.hasPermission(membership, "team_manager");
  },

  isMarketingTeammate(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "marketing_teammate");
  },

  isTeamManager(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "team_manager") || this.hasPermission(membership, "admin_owner");
  },

  isAdminOwner(membership: TeamMembership | null): boolean {
    return this.hasPermission(membership, "admin_owner");
  },
};
