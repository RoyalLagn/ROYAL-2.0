export type CrmVendorStatus =
  | "not_contacted"
  | "contact_attempted"
  | "call_not_answered"
  | "interested"
  | "not_interested"
  | "meeting_scheduled"
  | "meeting_completed"
  | "follow_up_required"
  | "documents_pending"
  | "registered_on_royallagn"
  | "subscription_pending"
  | "premium_customer"
  | "rejected"
  | "closed"
  | "lost_lead";

export type CrmVendorPriority = "low" | "medium" | "high";

export const crmVendorStatusLabels: Record<CrmVendorStatus, string> = {
  not_contacted: "Not Contacted",
  contact_attempted: "Contact Attempted",
  call_not_answered: "Call Not Answered",
  interested: "Interested",
  not_interested: "Not Interested",
  meeting_scheduled: "Meeting Scheduled",
  meeting_completed: "Meeting Completed",
  follow_up_required: "Follow-up Required",
  documents_pending: "Documents Pending",
  registered_on_royallagn: "Registered on RoyalLagn",
  subscription_pending: "Subscription Pending",
  premium_customer: "Premium Customer",
  rejected: "Rejected",
  closed: "Closed",
  lost_lead: "Lost Lead",
};

// Tailwind color pair (background/foreground) per status — used by StatusChip.
export const crmVendorStatusColors: Record<CrmVendorStatus, string> = {
  not_contacted: "bg-slate-500/10 text-slate-500",
  contact_attempted: "bg-sky-500/10 text-sky-500",
  call_not_answered: "bg-amber-500/10 text-amber-500",
  interested: "bg-emerald-500/10 text-emerald-500",
  not_interested: "bg-red-500/10 text-red-500",
  meeting_scheduled: "bg-violet-500/10 text-violet-500",
  meeting_completed: "bg-indigo-500/10 text-indigo-500",
  follow_up_required: "bg-orange-500/10 text-orange-500",
  documents_pending: "bg-yellow-500/10 text-yellow-600",
  registered_on_royallagn: "bg-primary/10 text-primary",
  subscription_pending: "bg-fuchsia-500/10 text-fuchsia-500",
  premium_customer: "bg-rose-500/10 text-rose-500",
  rejected: "bg-red-600/10 text-red-600",
  closed: "bg-neutral-500/10 text-neutral-500",
  lost_lead: "bg-stone-500/10 text-stone-500",
};

export const crmPipelineStages: { status: CrmVendorStatus; label: string }[] = [
  { status: "not_contacted", label: "Not Contacted" },
  { status: "contact_attempted", label: "Contacted" },
  { status: "meeting_scheduled", label: "Meeting" },
  { status: "registered_on_royallagn", label: "Registered" },
  { status: "subscription_pending", label: "Subscription" },
  { status: "premium_customer", label: "Premium Partner" },
];

export type CrmVendorRecord = {
  id: string;
  cluster_id: string;
  category_id: string;
  assigned_executive_id: string | null;
  linked_vendor_id: string | null;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  alternate_phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  google_maps_url: string | null;
  area: string | null;
  priority: CrmVendorPriority;
  lead_source: string | null;
  status: CrmVendorStatus;
  visited_date: string | null;
  notes: string | null;
  rating: number | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmVendorFilters = {
  query: string;
  status: "all" | CrmVendorStatus;
  priority: "all" | CrmVendorPriority;
  categoryId: string | null;
  clusterId: string | null;
  executiveId: string | null;
  page: number;
  pageSize: number;
};

export type CrmVendorListItem = CrmVendorRecord & {
  category_name: string | null;
  cluster_name: string | null;
  executive_name: string | null;
};

export type CrmVendorInput = {
  clusterId: string;
  categoryId: string;
  assignedExecutiveId?: string | null;
  businessName: string;
  ownerName?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  googleMapsUrl?: string | null;
  area?: string | null;
  priority?: CrmVendorPriority;
  leadSource?: string | null;
  visitedDate?: string | null;
  notes?: string | null;
  rating?: number | null;
};

export type CrmVendorStatistics = {
  total: number;
  registered: number;
  premium: number;
  interested: number;
  callsPendingToday: number;
  meetingsPendingToday: number;
  followUpsPending: number;
  documentsPending: number;
};
