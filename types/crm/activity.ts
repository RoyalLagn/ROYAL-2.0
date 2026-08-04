import type { CrmVendorStatus } from "@/types/crm/vendor";

export type CrmActivity = {
  id: string;
  vendor_id: string;
  actor_id: string | null;
  action: string;
  from_status: CrmVendorStatus | null;
  to_status: CrmVendorStatus | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CrmNote = {
  id: string;
  vendor_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};
