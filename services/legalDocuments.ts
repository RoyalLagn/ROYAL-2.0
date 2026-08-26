import { supabase } from "@/services/supabase";

const TERMS_KEY = "terms_and_conditions";
const PRIVACY_KEY = "privacy_policy";

export const DEFAULT_TERMS_CONTENT = [
  "RoyalLagn connects couples with independent wedding vendors. Sending an enquiry does not create a confirmed booking with a vendor.",
  "Users should independently confirm vendor availability, services, pricing and cancellation terms directly with the vendor before making arrangements.",
].join("\n\n");

export const DEFAULT_PRIVACY_CONTENT = [
  "# RoyalLagn Privacy Policy",
  "**Effective date:** [EFFECTIVE DATE]",
  "RoyalLagn is a wedding-vendor discovery platform. This policy explains how we collect and use personal information when you use our app, website, and related services.",
  "## Information We Collect",
  "We collect information you provide, including your name, email address, phone number, profile details, favourites, reviews, enquiry messages, event details, and support requests. Vendors may also provide business details, packages, pricing, portfolio media, verification documents, and subscription information.",
  "We may collect limited usage and device information, such as app activity, notification token, IP address, and device type, to operate and secure the service. If you choose **Near Me**, we use your device location only to show relevant nearby vendors; you can instead select a location manually.",
  "## How We Use Information",
  "We use your information to provide and improve RoyalLagn, create and protect accounts, display vendor listings, manage enquiries, process vendor subscriptions, send service notifications, respond to support requests, prevent fraud or misuse, and meet legal obligations.",
  "## When We Share Information",
  "Vendor profiles, portfolios, reviews, and other content you choose to publish may be visible to other users. When you submit an enquiry, the relevant contact and event information is shared with the vendor you select.",
  "We use trusted service providers to run RoyalLagn, including Supabase for authentication and data storage, Cloudinary for media hosting, Razorpay for vendor subscription payments, and Expo for push notifications. These providers process information only as needed to provide their services. We may also disclose information when required by law or to protect RoyalLagn, our users, or the public.",
  "RoyalLagn does not sell your personal information or use it for cross-app advertising.",
  "## Your Choices",
  "You can update your profile, manage favourites and reviews where available, choose a manual location, disable location or notification permissions in your device settings, and log out at any time. To request access, correction, or deletion of your information, contact us at [PRIVACY EMAIL]. Some information may be retained where required for payments, legal compliance, security, or dispute resolution.",
  "## Security and Retention",
  "We use reasonable technical and organisational safeguards to protect information. No system is completely secure. We keep information only for as long as needed for the purposes above, unless a longer period is required by law.",
  "## Children’s Privacy",
  "RoyalLagn is not intended for children under [MINIMUM AGE]. If you believe a child has provided us personal information, please contact us at [PRIVACY EMAIL].",
  "## Changes and Contact",
  "We may update this policy from time to time. The latest version will be available in the RoyalLagn app and on our website. For privacy questions, contact [LEGAL ENTITY NAME] at [PRIVACY EMAIL].",
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
