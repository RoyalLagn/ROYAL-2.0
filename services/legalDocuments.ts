import { supabase } from "@/services/supabase";

const TERMS_KEY = "terms_and_conditions";
const PRIVACY_KEY = "privacy_policy";

export const DEFAULT_TERMS_CONTENT = [
  "RoyalLagn connects couples with independent wedding vendors. Sending an enquiry does not create a confirmed booking with a vendor.",
  "Users should independently confirm vendor availability, services, pricing and cancellation terms directly with the vendor before making arrangements.",
].join("\n\n");

export const DEFAULT_PRIVACY_CONTENT = [
  "# RoyalLagn Privacy Policy",
  "RoyalLagn is a wedding-vendor discovery and marketplace platform. This Privacy Policy explains how we collect, use, share, store, and protect information when you use the RoyalLagn app, website, and related services.",
  "## 1. Information We Collect",
  "Depending on how you use RoyalLagn, we may collect:",
  "* Name, email address, phone number, profile image, and account information\n* Favourites, reviews, ratings, enquiries, event details, and other content you submit\n* Vendor business information, services, packages, pricing, contact details, portfolio media, and verification documents\n* Photos, videos, and documents you choose to upload\n* Vendor subscription and transaction information\n* App activity such as searches, profile views, Clip interactions, favourites, and enquiries\n* Device information, push notification token, IP address, and security or diagnostic information",
  "### Location",
  "If you use **Near Me** and grant permission, we may temporarily use your device location to show nearby Vendors and calculate distance.",
  "Location permission is optional. You can manually select a city or area instead.",
  "## 2. How We Use Information",
  "We use information to:",
  "* Create and secure accounts\n* Operate Vendor listings and profiles\n* Provide search and nearby Vendor discovery\n* Manage favourites, reviews, Clips, and enquiries\n* Connect users with selected Vendors\n* Process Vendor subscriptions and payments\n* Send notifications and provide support\n* Prevent fraud, abuse, and security incidents\n* Improve RoyalLagn\n* Meet legal, tax, accounting, and regulatory requirements",
  "## 3. Sharing of Information",
  "Vendor profiles, portfolios, pricing, reviews, and other information intended for publication may be visible to RoyalLagn users.",
  "When you send an enquiry, relevant contact, event, and enquiry information may be shared with the Vendor you select.",
  "RoyalLagn uses service providers including:",
  "* **Supabase** for authentication, database, and backend services\n* **Cloudinary** for image, video, and document hosting\n* **Razorpay** for supported Vendor payments\n* **Expo** for push notifications\n* Device and location services for features you choose to use",
  "These providers may process information as necessary to provide their services and in accordance with applicable privacy and security requirements.",
  "RoyalLagn does **not sell personal information or use it for cross-app behavioural advertising.**",
  "## 4. Payments",
  "Vendor payments may be processed through **Razorpay**.",
  "Razorpay may process payment information required to complete a transaction.",
  "Sensitive payment credentials such as full card details, CVV, UPI PIN, or banking passwords are handled by Razorpay and are not intended to be stored by RoyalLagn.",
  "RoyalLagn may retain payment references, transaction status, and financial records where required for accounting, tax, fraud prevention, disputes, or legal compliance.",
  "## 5. Permissions and Your Choices",
  "RoyalLagn may request permission for:",
  "* **Location** — for optional Near Me functionality\n* **Photos and Media** — when you choose to upload content\n* **Notifications** — for app notifications",
  "You may deny or disable these permissions through your device settings.",
  "You may also update your profile, manage favourites and reviews, select your location manually, and log out.",
  "## 6. Account and Data Deletion",
  "You may request deletion of your RoyalLagn account and associated personal information.",
  "Account deletion can be initiated from:",
  "**RoyalLagn App → Settings → Account → Delete Account**",
  "You can also request account deletion through:",
  "**https://www.royallagn.com/account-deletion**",
  "After a deletion request is submitted, RoyalLagn may verify the request before processing it.",
  "We will delete or anonymize associated personal information unless certain records must be retained for legal, tax, payment, fraud-prevention, security, or dispute-resolution purposes.",
  "For privacy or deletion assistance, contact:",
  "**royallagnsupport@gmail.com**",
  "## 7. Security and Retention",
  "We use reasonable technical and organizational safeguards to protect information, including secure authentication, encrypted connections, access controls, and database security measures.",
  "However, no online service can guarantee absolute security.",
  "We retain information only for as long as reasonably necessary to operate RoyalLagn, provide services, meet legal obligations, maintain financial records, prevent fraud, and resolve disputes.",
  "## 8. Children’s Privacy",
  "RoyalLagn is intended for users **18 years of age or older** and is not designed as a service for children.",
  "If you believe a child has provided personal information to RoyalLagn, contact:",
  "**royallagnsupport@gmail.com**",
  "## 9. Changes to This Policy",
  "We may update this Privacy Policy when RoyalLagn, our services, legal requirements, service providers, or data practices change.",
  "The latest version will be available through the RoyalLagn app and website.",
  "## 10. Contact Us",
  "**RoyalLagn**\nAt Post – Sate, Taluka Maval, District Pune, Maharashtra – 412106, India",
  "**Website:** https://royallagn.com/\n**Support:** royallagnsupport@gmail.com\n**Privacy:** royallagnsupport@gmail.com\n**Legal/IP Notices:** royallagn@gmail.com",
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
