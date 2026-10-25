import { supabase } from "@/services/supabase";

const TERMS_KEY = "terms_and_conditions";
const PRIVACY_KEY = "privacy_policy";

export const DEFAULT_TERMS_CONTENT = [
  "# RoyalLagn Terms & Conditions",
  "These Terms & Conditions govern your use of the RoyalLagn mobile app, website, and related services.",
  "By accessing RoyalLagn, creating an account, registering as a Vendor, submitting content, or purchasing a Vendor plan, you agree to these Terms & Conditions.",
  "## 1. About RoyalLagn",
  "RoyalLagn is a wedding-vendor discovery, listing, and enquiry platform.",
  "RoyalLagn helps users discover and contact independent wedding Vendors.",
  "RoyalLagn does not itself provide the wedding services offered by Vendors and is generally not a party to agreements, bookings, quotations, payments, cancellations, or disputes between users and Vendors.",
  "Users should independently verify a Vendor before making any booking or payment.",
  "## 2. Accounts",
  "You must provide accurate and current information when creating or managing an account.",
  "You are responsible for keeping your password, email account, verification codes, and device access secure.",
  "You must not:",
  "* Impersonate another person or business\n* Create fraudulent accounts\n* Use another person's information without permission\n* Share unauthorized administrative access\n* Use RoyalLagn for unlawful purposes",
  "RoyalLagn is intended for users aged 18 years or older.",
  "## 3. Vendor Accounts and Listings",
  "Vendors are responsible for ensuring that their business information is accurate, lawful, and not misleading.",
  "This includes:",
  "* Business identity and contact information\n* Services and availability\n* Locations and service areas\n* Packages and pricing\n* Photos, videos, and portfolio content\n* Required business permissions or registrations",
  "Submitting a Vendor application does not guarantee approval, verification, enquiries, bookings, ranking, promotion, or revenue.",
  "RoyalLagn may review, verify, reject, restrict, suspend, or remove a Vendor listing where reasonably necessary for security, accuracy, policy enforcement, or legal compliance.",
  "A RoyalLagn verification badge does not guarantee the quality, availability, legality, or performance of a Vendor's services.",
  "## 4. Enquiries, Reviews and Content",
  "Users may contact Vendors using RoyalLagn enquiries or supported external services such as phone, WhatsApp, email, or maps.",
  "RoyalLagn cannot guarantee that a Vendor will respond or that a booking or transaction will occur.",
  "Reviews must represent genuine opinions or experiences and must not contain:",
  "* False or misleading claims\n* Spam or advertisements\n* Harassment or threats\n* Illegal or discriminatory material\n* Excessive personal information\n* Copyrighted material used without permission",
  "RoyalLagn may moderate or remove inappropriate content.",
  "You retain ownership of content you upload.",
  "By submitting content to RoyalLagn, you give RoyalLagn a non-exclusive, royalty-free licence to store, process, resize, display, publish, and distribute that content as reasonably necessary to operate, secure, promote, and improve RoyalLagn.",
  "You must have the necessary rights or permission to upload the content you submit.",
  "## 5. Vendor Plans and Payments",
  "RoyalLagn may offer Free, Premium, Elite, or other Vendor plans.",
  "Available prices, features, limits, and subscription periods are those displayed when the Vendor selects a plan.",
  "Supported Vendor payments may be processed through Razorpay.",
  "Sensitive payment credentials such as card numbers, CVV, UPI PINs, or banking passwords are processed by Razorpay and are not intended to be stored by RoyalLagn.",
  "RoyalLagn may verify a payment before activating a paid plan.",
  "Failed, incomplete, reversed, fraudulent, or unverified payments may not activate Vendor access.",
  "### Renewal",
  "RoyalLagn's currently supported Vendor subscription flow does not automatically renew through Razorpay.",
  "When a paid period expires, the Vendor must initiate a new payment to renew unless RoyalLagn introduces and clearly discloses another renewal method.",
  "### Cancellation",
  "Where cancellation is available, cancelling a Vendor plan normally allows access until the end of the already-paid subscription period.",
  "Cancellation does not automatically create a right to a refund.",
  "Any applicable refund rights or refund process will be handled according to applicable law and any refund terms presented by RoyalLagn.",
  "## 6. Prohibited Use",
  "You must not:",
  "* Provide fraudulent or misleading information\n* Impersonate another person or Vendor\n* Upload illegal or infringing content\n* Manipulate reviews, ratings, views, or enquiries\n* Spam or harass users\n* Upload malware\n* Attempt unauthorized access\n* Circumvent security or subscription restrictions\n* Scrape or systematically extract RoyalLagn data without permission\n* Use RoyalLagn for unlawful activities",
  "## 7. Suspension and Account Termination",
  "RoyalLagn may restrict, suspend, or terminate accounts, listings, content, or Vendor access where reasonably necessary because of:",
  "* Violation of these Terms & Conditions\n* Fraud or payment abuse\n* Misleading Vendor information\n* Security risks\n* Harassment or abuse\n* Intellectual-property infringement\n* Illegal activity\n* Legal or regulatory requirements",
  "Where appropriate, RoyalLagn may provide an opportunity to correct an issue before taking action.",
  "## 8. Intellectual Property",
  "RoyalLagn owns or has rights to the RoyalLagn platform, software, design, branding, logo, interface, and original platform materials.",
  "You may not copy, reproduce, misuse, or commercially exploit RoyalLagn's branding or platform materials without permission.",
  "Users and Vendors retain ownership of their own original content.",
  "For intellectual-property concerns, contact:",
  "royallagn@gmail.com",
  "## 9. Third-Party Services",
  "RoyalLagn may use third-party services including Supabase, Cloudinary, Razorpay, Expo, device location services, WhatsApp, phone, email, and mapping applications.",
  "Third-party services are governed by their own terms and privacy practices.",
  "RoyalLagn is not responsible for the independent operation or availability of third-party services except where responsibility cannot legally be excluded.",
  "## 10. Disclaimer and Liability",
  "RoyalLagn provides the platform based on its current availability.",
  "RoyalLagn does not guarantee:",
  "* Continuous or error-free availability\n* Vendor quality or performance\n* Accuracy of every Vendor listing\n* Vendor availability\n* Any specific number of enquiries or bookings\n* Business revenue or results\n* Completion of communications with Vendors",
  "Disputes relating to Vendor services, bookings, quality, quotations, delivery, cancellation, or payments made directly between a user and Vendor should ordinarily be resolved between those parties.",
  "Nothing in these Terms & Conditions removes rights or protections that cannot legally be excluded under applicable law.",
  "## 11. Privacy and Account Deletion",
  "RoyalLagn handles personal information according to the RoyalLagn Privacy Policy available through the RoyalLagn website and app.",
  "Users can request account deletion through the app or at:",
  "https://www.royallagn.com/account-deletion",
  "Some records may be retained where required for legal, tax, payment, fraud-prevention, security, or dispute-resolution purposes.",
  "## 12. Changes to These Terms",
  "RoyalLagn may update these Terms & Conditions when its services, features, legal requirements, or business practices change.",
  "The latest version will be made available through the RoyalLagn app or website.",
  "Continued use of RoyalLagn after updated Terms become applicable means you accept them to the extent permitted by law.",
  "## 13. Governing Law",
  "These Terms & Conditions are governed by the applicable laws of India.",
  "Subject to any mandatory consumer or statutory rights, disputes relating to RoyalLagn will be subject to the jurisdiction of the appropriate courts in Pune, Maharashtra, India.",
  "## 14. Contact Us",
  "**RoyalLagn**\nAt Post – Sate, Taluka Maval, District Pune, Maharashtra – 412106, India",
  "**Website:** https://royallagn.com/\n**Support:** royallagnsupport@gmail.com\n**Privacy:** royallagnsupport@gmail.com\n**Legal/IP Notices:** royallagn@gmail.com",
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
  "* **Supabase** for authentication, database, and backend services\n* **Cloudinary** for image, video, and document hosting and delivery\n* **Razorpay** for supported Vendor payments\n* **Expo** for push notifications\n* Device and location services for features you choose to use",
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
