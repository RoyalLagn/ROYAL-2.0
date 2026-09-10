import { supabase } from "@/services/supabase";

export type CommunicationPreferences = {
  emailUpdatesEnabled: boolean;
};

export const defaultCommunicationPreferences: CommunicationPreferences = {
  emailUpdatesEnabled: true,
};

export async function getCommunicationPreferences(): Promise<CommunicationPreferences> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to manage email updates.");
  const { data, error } = await supabase
    .from("communication_preferences")
    .select("email_updates_enabled")
    .eq("profile_id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return { emailUpdatesEnabled: data?.email_updates_enabled ?? true };
}

export async function setEmailUpdatesEnabled(enabled: boolean) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("Sign in to manage email updates.");
  const { error } = await supabase.from("communication_preferences").upsert({
    profile_id: auth.user.id,
    email_updates_enabled: enabled,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
