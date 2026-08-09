import { supabase } from "@/services/supabase";

export const VENDOR_REGISTRATION_CLOSED_MESSAGE =
  "Vendor registrations are temporarily unavailable.";

function parseEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return parseEnabled(value[0]);
  if (value && typeof value === "object" && "enabled" in value) {
    return Boolean((value as { enabled: unknown }).enabled);
  }
  return value !== false;
}

export async function getVendorRegistrationEnabled(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_vendor_registration_enabled");
  if (error) throw error;
  return parseEnabled(data);
}

export async function requireVendorRegistrationEnabled(): Promise<void> {
  const { error } = await supabase.rpc("assert_vendor_registration_enabled");
  if (error) throw new Error(error.message || VENDOR_REGISTRATION_CLOSED_MESSAGE);
}

export async function setVendorRegistrationEnabled(enabled: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("admin_set_vendor_registration_enabled", {
    enabled,
  });
  if (error) throw error;
  return parseEnabled(data);
}
