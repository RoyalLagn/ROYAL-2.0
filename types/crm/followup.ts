export type CrmFollowupStatus = "pending" | "completed" | "cancelled";
export type CrmFollowupPriority = "low" | "medium" | "high";
export type CrmFollowupType = "call" | "meeting" | "visit" | "other";

export const crmFollowupTypeLabels: Record<CrmFollowupType, string> = {
  call: "Call",
  meeting: "Meeting",
  visit: "Visit",
  other: "Other",
};

export type CrmFollowup = {
  id: string;
  vendor_id: string;
  type: CrmFollowupType;
  scheduled_date: string;
  scheduled_time: string | null;
  priority: CrmFollowupPriority;
  notes: string | null;
  status: CrmFollowupStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
