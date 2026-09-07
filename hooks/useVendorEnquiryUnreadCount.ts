import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useVendorSession } from "@/context/VendorSessionContext";
import { EnquiryService } from "@/services/enquiries";
import { supabase } from "@/services/supabase";

let vendorEnquiryBadgeChannelSequence = 0;

/** Keeps the enquiries badge current without loading the whole enquiries list. */
export function useVendorEnquiryUnreadCount() {
  const { isPreviewMode, workspaceEpoch } = useVendorSession();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (isPreviewMode) {
      if (mounted.current) { setVendorId(null); setUnreadCount(0); }
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      if (mounted.current) { setVendorId(null); setUnreadCount(0); }
      return;
    }
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (error || !vendor) {
      if (mounted.current) { setVendorId(null); setUnreadCount(0); }
      return;
    }
    const count = await EnquiryService.getVendorUnseenCount(vendor.id);
    if (mounted.current) { setVendorId(vendor.id); setUnreadCount(count); }
  }, [isPreviewMode]);

  useEffect(() => { void refresh(); }, [refresh, workspaceEpoch]);

  useEffect(() => {
    if (isPreviewMode) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [isPreviewMode, refresh]);

  useEffect(() => {
    if (!vendorId) return;
    vendorEnquiryBadgeChannelSequence += 1;
    const channel = supabase
      .channel(`vendor-enquiry-badge-${vendorId}-${vendorEnquiryBadgeChannelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_enquiries", filter: `vendor_id=eq.${vendorId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, vendorId]);

  return { unreadCount, refresh };
}
