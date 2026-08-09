import { supabase } from "@/services/supabase";

export type AdminPublicUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  profile_image: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const columns = "id,full_name,email,phone,profile_image,is_active,created_at,updated_at";

export const AdminUserService = {
  async list(): Promise<AdminPublicUser[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select(columns)
      .eq("role", "public_user")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as AdminPublicUser[];
  },

  async setActive(userId: string, isActive: boolean): Promise<void> {
    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId)
      .eq("role", "public_user")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("User profile was not found or cannot be updated.");
  },

  async deleteProfile(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId)
      .eq("role", "public_user")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("User profile was not found or cannot be deleted.");
  },

  subscribe(onChange: () => void) {
    const channel = supabase
      .channel(`admin-public-users-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { role?: string };
          if (!row.role || row.role === "public_user") onChange();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
