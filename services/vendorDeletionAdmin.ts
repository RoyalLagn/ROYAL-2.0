import { FunctionsHttpError } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/services/adminAuth";
import { AdminDashboardService } from "@/services/adminDashboardService";
import { supabase } from "@/services/supabase";

export type VendorDeletionRequest = {
  id: string;
  request_reference: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  reason: string | null;
  status: string;
  requested_at: string;
  email_verified_at: string | null;
  decision_reason: string | null;
  processing_error: string | null;
  vendor_snapshot: { business_name?: string; owner_name?: string; subscription_status?: string } | null;
};

export async function listVendorDeletionRequests(): Promise<VendorDeletionRequest[]> {
  await verifyAdminSession();
  const { data, error } = await supabase
    .from("account_deletion_requests")
    .select("id,request_reference,email,full_name,phone,reason,status,requested_at,email_verified_at,decision_reason,processing_error,vendor_snapshot")
    .eq("account_type", "vendor")
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorDeletionRequest[];
}

export async function processVendorDeletion(requestId: string, decision: "approve" | "reject", reason: string) {
  const identity = await verifyAdminSession();
  const { data, error } = await supabase.functions.invoke("admin-process-vendor-deletion", {
    headers: { Authorization: `Bearer ${identity.session.access_token}` },
    body: { requestId, decision, reason },
  });
  if (error instanceof FunctionsHttpError) {
    let backendMessage = "";
    try {
      const payload = await error.context.json();
      backendMessage = payload?.error ? String(payload.error) : "";
    } catch { /* Response body was not JSON. */ }
    if (backendMessage) throw new Error(backendMessage);
  }
  if (error) throw new Error(error.message || "Unable to process this deletion request.");
  if (data?.error) throw new Error(String(data.error));
  AdminDashboardService.invalidate();
}
