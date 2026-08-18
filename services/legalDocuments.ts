import { supabase } from "@/services/supabase";

const TERMS_KEY = "terms_and_conditions";
const PRIVACY_KEY = "privacy_policy";

export const DEFAULT_TERMS_CONTENT = [
  "RoyalLagn connects couples with independent wedding vendors. Sending an enquiry does not create a confirmed booking with a vendor.",
  "Users should independently confirm vendor availability, services, pricing and cancellation terms directly with the vendor before making arrangements.",
].join("\n\n");

export const DEFAULT_PRIVACY_CONTENT = [
  "RoyalLagn uses the account, profile and activity information you provide, such as your name, contact details, favourites and enquiries, to operate your account and connect you with wedding vendors.",
  "RoyalLagn does not sell your personal information. Information is used to operate the marketplace, support enquiries, protect the platform and improve your experience.",
  "Information is retained only for as long as it is needed for the purposes described in this policy or to meet legal and security requirements.",
].join("\n\n");

type LegalSettingValue = { content?: unknown };

export type LegalDocument = {
  content: string;
  updatedAt: string | null;
};

function readContent(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const content = (value as LegalSettingValue).content;
  return typeof content === "string" && content.trim() ? content.trim() : fallback;
}

async function loadDocument(key: string, fallback: string): Promise<LegalDocument> {
  const { data, error } = await supabase
    .from("application_settings")
    .select("value,updated_at")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return { content: readContent(data?.value, fallback), updatedAt: data?.updated_at ?? null };
}

async function saveDocument(rpc: string, content: string, fallback: string, emptyMessage: string): Promise<LegalDocument> {
  const normalized = content.trim();
  if (!normalized) throw new Error(emptyMessage);
  const { data, error } = await supabase.rpc(rpc, { target_content: normalized });
  if (error) throw error;
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved) throw new Error("The document could not be saved.");
  return { content: readContent(saved.value, fallback), updatedAt: saved.updated_at ?? null };
}

export const LegalDocumentsService = {
  async loadTerms(): Promise<LegalDocument> {
    return loadDocument(TERMS_KEY, DEFAULT_TERMS_CONTENT);
  },

  async saveTerms(content: string): Promise<LegalDocument> {
    return saveDocument("update_terms_and_conditions", content, DEFAULT_TERMS_CONTENT, "Terms & Conditions cannot be empty.");
  },

  async loadPrivacy(): Promise<LegalDocument> {
    return loadDocument(PRIVACY_KEY, DEFAULT_PRIVACY_CONTENT);
  },

  async savePrivacy(content: string): Promise<LegalDocument> {
    return saveDocument("update_privacy_policy", content, DEFAULT_PRIVACY_CONTENT, "Privacy Policy cannot be empty.");
  },
};
