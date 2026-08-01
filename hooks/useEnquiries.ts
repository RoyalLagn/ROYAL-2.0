import { useCallback, useEffect, useMemo, useState } from "react";
import { EnquiryService, type TrackedEnquiry } from "@/services/enquiries";
import { supabase } from "@/services/supabase";

function useEnquiryList(kind: "customer" | "vendor", vendorId?: string | null) {
  const [items, setItems] = useState<TrackedEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async (quiet = false) => {
    if (kind === "vendor" && !vendorId) { setItems([]); setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError("");
    try { setItems(kind === "vendor" ? await EnquiryService.listVendor(vendorId!) : await EnquiryService.listCustomer()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load enquiries."); }
    finally { setLoading(false); }
  }, [kind, vendorId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const filter = kind === "vendor" && vendorId ? `vendor_id=eq.${vendorId}` : undefined;
    const table = kind === "vendor" ? "vendor_enquiries" : "customer_notifications";
    const channel = supabase.channel(`enquiries-${kind}-${vendorId ?? "customer"}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => void refresh(true))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [kind, refresh, vendorId]);
  return { items, loading, error, refresh };
}

export function useCustomerEnquiries() { return useEnquiryList("customer"); }
export function useVendorEnquiries(vendorId?: string | null) {
  const result = useEnquiryList("vendor", vendorId);
  const analytics = useMemo(() => EnquiryService.calculateAnalytics(result.items), [result.items]);
  return { ...result, analytics };
}
