import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { useVendorSession } from "@/context/VendorSessionContext";

export type CompletionState = "complete" | "partial" | "missing" | "attention";
export type CompletionItem = {
  id: string;
  label: string;
  state: CompletionState;
  route: string;
};

export type VendorWorkspace = {
  vendor: any | null;
  albums: any[];
  media: any[];
  heroMedia: any[];
  availability: any[];
  enquiries: any[];
  notifications: any[];
  reviews: any[];
  services: any[];
  subscription: any | null;
};

const emptyWorkspace: VendorWorkspace = {
  vendor: null, albums: [], media: [], heroMedia: [], availability: [], enquiries: [],
  notifications: [], reviews: [], services: [], subscription: null,
};

const hasText = (value?: string | null) => Boolean(value?.trim());

export function calculateVendorCompletion(data: VendorWorkspace) {
  const v = data.vendor ?? {};
  const hasLocation = [v.address, v.city, v.state].filter(hasText).length;
  const hasContact = hasText(v.contact_email) || hasText(v.contact_phone);
  const pricedServices = data.services.filter((service) => Number(service.price) > 0);
  const albumMedia = data.media.length;
  const upcomingAvailability = data.availability.length;

  const items: CompletionItem[] = [
    { id: "business", label: "Business information", state: hasText(v.business_name) && v.category_id ? "complete" : hasText(v.business_name) ? "partial" : "missing", route: "/VendorEditProfile" },
    { id: "about", label: "About the business", state: hasText(v.description) && v.description.trim().length >= 80 ? "complete" : hasText(v.description) ? "partial" : "missing", route: "/VendorEditProfile" },
    { id: "location", label: "Location", state: hasLocation >= 3 ? "complete" : hasLocation ? "partial" : "missing", route: "/VendorEditProfile" },
    { id: "contact", label: "Contact information", state: hasContact ? "complete" : "missing", route: "/VendorEditProfile" },
    { id: "identity", label: "Logo and brand", state: hasText(v.logo_url) ? "complete" : "missing", route: "/VendorEditProfile" },
    { id: "services", label: "Services", state: data.services.length >= 2 ? "complete" : data.services.length ? "partial" : "missing", route: "/VendorServices" },
    { id: "pricing", label: "Pricing and packages", state: pricedServices.length >= 2 ? "complete" : pricedServices.length ? "partial" : "missing", route: "/VendorServices" },
    { id: "portfolio", label: "Portfolio albums", state: albumMedia >= 6 && data.albums.length >= 1 ? "complete" : albumMedia ? "partial" : "missing", route: "/VendorGallery" },
    { id: "availability", label: "Availability", state: upcomingAvailability >= 3 ? "complete" : upcomingAvailability ? "partial" : "attention", route: "/VendorCalendar" },
    { id: "tags", label: "Search tags", state: (v.tags?.length ?? 0) >= 3 ? "complete" : (v.tags?.length ?? 0) ? "partial" : "missing", route: "/VendorEditProfile" },
  ];
  const weights = { complete: 1, partial: 0.5, missing: 0, attention: 0.25 };
  const percent = Math.round(items.reduce((sum, item) => sum + weights[item.state], 0) / items.length * 100);
  return { items, percent };
}

export function useVendorWorkspace() {
  const { isPreviewMode, workspaceEpoch } = useVendorSession();
  const [data, setData] = useState<VendorWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeInstanceId = useRef(
    `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  const refresh = useCallback(async () => {
    void workspaceEpoch;
    setLoading(true);
    setError(null);
    setPortfolioError(null);
    if (isPreviewMode) {
      setData(emptyWorkspace);
      setLoading(false);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setData(emptyWorkspace);
        setError("Your Vendor session has expired. Sign in again to edit the live business profile.");
        return;
      }
      let { data: vendor, error: vendorError } = await supabase
        .from("vendors").select("*, categories(name)").eq("profile_id", user.id).maybeSingle();
      if (vendorError) throw vendorError;
      if (!vendor) {
        // An approved application can predate the authenticated workspace
        // link. Claim it on first entry so deep-linked Vendor pages become
        // usable instead of rendering an empty, unsavable editor.
        const { error: claimError } = await supabase.rpc("claim_vendor_workspace");
        if (claimError) {
          throw new Error(
            /no matching vendor application/i.test(claimError.message)
              ? "No Vendor business is connected to this account. Sign in with your approved Vendor email."
              : claimError.message,
          );
        }
        const claimed = await supabase
          .from("vendors").select("*, categories(name)").eq("profile_id", user.id).maybeSingle();
        if (claimed.error) throw claimed.error;
        vendor = claimed.data;
        if (!vendor) throw new Error("Your Vendor business could not be activated. Please sign in again.");
      }
      setData({ ...emptyWorkspace, vendor });
      const today = new Date().toISOString().slice(0, 10);
      const [albums, media, heroMedia, availability, enquiries, notifications, reviews, services, subscription] = await Promise.all([
        supabase.from("vendor_portfolio_albums").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_portfolio_media").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_portfolio_hero_media").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_availability").select("*").eq("vendor_id", vendor.id).gte("date", today).order("date").limit(12),
        supabase.from("vendor_enquiries").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("vendor_notifications").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("reviews").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("vendor_services").select("*").eq("vendor_id", vendor.id).order("display_order").order("created_at"),
        supabase.from("subscriptions").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      // Album, availability, enquiry and notification tables are additive. Keep
      // the existing Vendor UI usable while a deployment is still applying the
      // new migration instead of failing the whole workspace.
      const failed = [reviews, services, subscription].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const portfolioFailure = albums.error ?? media.error ?? heroMedia.error;
      if (portfolioFailure) {
        setPortfolioError(
          /does not exist|schema cache|PGRST205|42P01/i.test(portfolioFailure.message)
            ? "Portfolio storage is not deployed yet. Apply the Vendor workspace Supabase migration to enable albums and uploads."
            : portfolioFailure.message,
        );
      }
      setData({
        vendor,
        albums: albums.data ?? [],
        media: media.data ?? [],
        heroMedia: heroMedia.data ?? [],
        availability: availability.data ?? [],
        enquiries: enquiries.data ?? [],
        notifications: notifications.data ?? [],
        reviews: reviews.data ?? [],
        services: services.data ?? [],
        subscription: subscription.data ?? null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your vendor workspace.");
    } finally {
      setLoading(false);
    }
  }, [isPreviewMode, workspaceEpoch]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const vendorId = data.vendor?.id;
    const profileId = data.vendor?.profile_id;
    if (isPreviewMode || !vendorId || !profileId) return;

    const scheduleRefresh = () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void refresh();
      }, 75);
    };
    const channel = supabase
      .channel(`vendor-workspace-live-${vendorId}-${realtimeInstanceId.current}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendors", filter: `id=eq.${vendorId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profileId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (realtimeRefreshTimer.current) {
        clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [data.vendor?.id, data.vendor?.profile_id, isPreviewMode, refresh]);

  const completion = useMemo(() => calculateVendorCompletion(data), [data]);
  return { data, loading, error, portfolioError, completion, refresh };
}
