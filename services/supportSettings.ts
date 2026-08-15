import { Linking } from "react-native";
import { supabase } from "@/services/supabase";

export type SupportSettings = {
  email: string | null;
  phone: string | null;
  showEmail: boolean;
  showPhone: boolean;
  updatedAt: string | null;
};

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  email: "support@royallagn.com",
  phone: null,
  showEmail: true,
  showPhone: false,
  updatedAt: null,
};

type SupportSettingsRow = {
  support_email: string | null;
  support_phone: string | null;
  show_email: boolean;
  show_phone: boolean;
  updated_at: string | null;
};

function cleanOptional(value: string | null | undefined) {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function mapSupportSettings(row: SupportSettingsRow | null): SupportSettings {
  if (!row) return DEFAULT_SUPPORT_SETTINGS;
  return {
    email: cleanOptional(row.support_email),
    phone: cleanOptional(row.support_phone),
    showEmail: Boolean(row.show_email && cleanOptional(row.support_email)),
    showPhone: Boolean(row.show_phone && cleanOptional(row.support_phone)),
    updatedAt: row.updated_at,
  };
}

export function isValidSupportEmail(value: string) {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidSupportPhone(value: string) {
  const phone = value.trim();
  const digitCount = phone.replace(/\D/g, "").length;
  return phone.length <= 40 && digitCount >= 7 && digitCount <= 15 && /^[+()\-\s\d]+$/.test(phone);
}

export function validateSupportSettings(input: Pick<SupportSettings, "email" | "phone" | "showEmail" | "showPhone">) {
  const email = cleanOptional(input.email);
  const phone = cleanOptional(input.phone);
  if (!input.showEmail && !input.showPhone) return "Keep at least one support contact visible.";
  if (input.showEmail && (!email || !isValidSupportEmail(email))) return "Enter a valid support email before showing it.";
  if (input.showPhone && (!phone || !isValidSupportPhone(phone))) return "Enter a valid contact number before showing it.";
  if (email && !isValidSupportEmail(email)) return "Enter a valid support email or remove it.";
  if (phone && !isValidSupportPhone(phone)) return "Enter a valid contact number or remove it.";
  return null;
}

export async function loadSupportSettings(): Promise<SupportSettings> {
  const { data, error } = await supabase
    .from("support_settings")
    .select("support_email,support_phone,show_email,show_phone,updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return mapSupportSettings(data as SupportSettingsRow | null);
}

export async function updateSupportSettings(
  input: Pick<SupportSettings, "email" | "phone" | "showEmail" | "showPhone">,
) {
  const validationError = validateSupportSettings(input);
  if (validationError) throw new Error(validationError);
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("support_settings")
    .update({
      support_email: cleanOptional(input.email),
      support_phone: cleanOptional(input.phone),
      show_email: input.showEmail,
      show_phone: input.showPhone,
      updated_by: authData.user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("support_email,support_phone,show_email,show_phone,updated_at")
    .single();
  if (error) throw error;
  return mapSupportSettings(data as SupportSettingsRow);
}

export function subscribeToSupportSettings(onChange: () => void) {
  const channel = supabase
    .channel(`support-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_settings" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function supportEmailUrl(email: string, subject: string, body?: string) {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body?.trim()) params.push(`body=${encodeURIComponent(body.trim())}`);
  return `mailto:${email.trim()}?${params.join("&")}`;
}

export function supportPhoneUrl(phone: string) {
  const normalized = phone.trim().replace(/(?!^\+)\D/g, "");
  return `tel:${normalized}`;
}

export async function canOpenSupportUrl(url: string) {
  if (!(await Linking.canOpenURL(url))) return false;
  await Linking.openURL(url);
  return true;
}
