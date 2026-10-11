import { supabase } from "@/services/supabase";
import type { TeamMembership, TeamPermission, TeamActivityLogEntry } from "@/types/team";

export const TeamManagementService = {
  /**
   * Fetches all team members.
   */
  async listTeamMembers(): Promise<TeamMembership[]> {
    try {
      const { data, error } = await supabase.rpc("get_team_members");
      if (error) throw error;
      if (!data) return [];

      return data.map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        email: m.email,
        fullName: m.full_name,
        phone: m.phone,
        permissions: (m.permissions || []) as TeamPermission[],
        isActive: m.is_active,
        createdBy: m.created_by,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      }));
    } catch (err) {
      console.error("listTeamMembers error:", err);
      return [];
    }
  },

  /**
   * Creates or updates a team member's profile and permissions.
   */
  async upsertMember(params: {
    userId: string;
    email: string;
    fullName: string;
    phone?: string;
    permissions: TeamPermission[];
    isActive?: boolean;
  }): Promise<{ success: boolean; member?: TeamMembership; message?: string }> {
    try {
      const { data, error } = await supabase.rpc("team_manage_member", {
        p_user_id: params.userId,
        p_email: params.email.trim().toLowerCase(),
        p_full_name: params.fullName.trim(),
        p_phone: params.phone?.trim() || null,
        p_permissions: params.permissions,
        p_is_active: params.isActive ?? true,
      });

      if (error) throw error;
      return {
        success: true,
        member: {
          id: data.id,
          userId: data.user_id,
          email: data.email,
          fullName: data.full_name,
          phone: data.phone,
          permissions: (data.permissions || []) as TeamPermission[],
          isActive: data.is_active,
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || "Failed to save team member" };
    }
  },

  /**
   * Fetches recent team activity logs.
   */
  async getActivityLogs(limit = 50): Promise<TeamActivityLogEntry[]> {
    try {
      const { data, error } = await supabase.rpc("get_team_activity_logs", {
        p_limit: limit,
      });

      if (error) throw error;
      if (!data) return [];

      return data.map((log: any) => ({
        id: log.id,
        actorId: log.actor_id,
        actorName: log.actor_name,
        actorEmail: log.actor_email,
        entityType: log.entity_type,
        entityId: log.entity_id,
        action: log.action,
        details: log.details || {},
        createdAt: log.created_at,
      }));
    } catch (err) {
      console.error("getActivityLogs error:", err);
      return [];
    }
  },
};
