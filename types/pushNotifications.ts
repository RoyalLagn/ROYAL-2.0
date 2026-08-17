export type PushAudience = "customers" | "vendors" | "everyone" | "vendor";

export type PushCampaignStatus =
  | "pending"
  | "sending"
  | "sent"
  | "partial"
  | "failed";

export type PushCampaign = {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  audience: PushAudience;
  target_vendor_id: string | null;
  target_path: string | null;
  status: PushCampaignStatus;
  inbox_count: number;
  sent_count: number;
  failed_count: number;
  error_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PushCampaignInput = {
  title: string;
  message: string;
  imageUrl?: string | null;
  audience: PushAudience;
  targetVendorId?: string | null;
  targetPath?: string | null;
};

export type PushSendResult = {
  campaign: PushCampaign;
  inboxCount: number;
  sentCount: number;
  failedCount: number;
};

export type PushTokenRecord = {
  id: string;
  profile_id: string;
  role: "public_user" | "vendor" | "admin";
  token: string;
  platform: "ios" | "android" | "web" | "unknown";
  created_at: string;
  updated_at: string;
};
