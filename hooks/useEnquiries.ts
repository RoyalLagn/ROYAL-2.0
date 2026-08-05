import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnquiryService, type TrackedEnquiry } from "@/services/enquiries";
import { supabase } from "@/services/supabase";

function useEnquiryList(kind: "customer" | "vendor", vendorId?: string | null) {
  const [items, setItems] = useState<TrackedEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const requestId = useRef(0);
  const realtimeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async (quiet = false) => {
    const thisRequest = ++requestId.current;
    const isCurrent = () => mounted.current && requestId.current === thisRequest;
    if (kind === "vendor" && !vendorId) {
      if (isCurrent()) { setItems([]); setLoading(false); }
      return;
    }
    if (!quiet) setLoading(true);
    setError("");
    try {
      const rows = kind === "vendor" ? await EnquiryService.listVendor(vendorId!) : await EnquiryService.listCustomer();
      if (isCurrent()) setItems(rows);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : "Unable to load enquiries.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [kind, vendorId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const filter = kind === "vendor" && vendorId ? `vendor_id=eq.${vendorId}` : undefined;
    const table = kind === "vendor" ? "vendor_enquiries" : "customer_notifications";
    const channel = supabase.channel(`enquiries-${kind}-${vendorId ?? "customer"}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => {
        if (realtimeDebounce.current) clearTimeout(realtimeDebounce.current);
        realtimeDebounce.current = setTimeout(() => {
          realtimeDebounce.current = null;
          void refresh(true);
        }, 100);
      })
      .subscribe();
    return () => {
      if (realtimeDebounce.current) { clearTimeout(realtimeDebounce.current); realtimeDebounce.current = null; }
      void supabase.removeChannel(channel);
    };
  }, [kind, refresh, vendorId]);
  return { items, loading, error, refresh };
}

export function useCustomerEnquiries() { return useEnquiryList("customer"); }
export function useVendorEnquiries(vendorId?: string | null) {
  const result = useEnquiryList("vendor", vendorId);
  const analytics = useMemo(() => EnquiryService.calculateAnalytics(result.items), [result.items]);
  return { ...result, analytics };
}
