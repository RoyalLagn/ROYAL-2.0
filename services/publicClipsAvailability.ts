import { supabase } from "@/services/supabase";

function parseEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return parseEnabled(value[0]);
  return value !== false;
}

export async function getPublicClipsEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_public_clips_enabled");
  if (error) throw error;
  return parseEnabled(data);
}

export async function setPublicClipsEnabled(enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_set_public_clips_enabled", { enabled });
  if (error) throw error;
  return parseEnabled(data);
}
