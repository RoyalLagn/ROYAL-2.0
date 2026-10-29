import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { useVendorSession } from "@/context/VendorSessionContext";
import { VendorReadinessRules, type CompletionState } from "@/services/vendorReadiness";
import { vendorProfileSections, type VendorProfileSectionId } from "@/vendor/navigation";

export { VendorReadinessRules } from "@/services/vendorReadiness";
export type { CompletionState } from "@/services/vendorReadiness";

// Single source of truth for how each CompletionState reads in the UI, so
// the readiness checklist and every section form's own status badge always
// show the same words for the same state.
export const VendorReadinessLabels: Record<CompletionState, string> = {
  complete: "Complete",
  partial: "In progress",
  missing: "Add details",
  attention: "Needs attention",
};
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
  stats: {
    totalEnquiries: number;
    whatsappEnquiries: number;
    callEnquiries: number;
    openEnquiries: number;
    unreadNotifications: number;
    portfolioMedia: number;
    averageRating: number;
    reviewCount: number;
  };
};

const emptyWorkspace: VendorWorkspace = {
  vendor: null, albums: [], media: [], heroMedia: [], availability: [], enquiries: [],
  notifications: [], reviews: [], services: [], subscription: null,
  stats: { totalEnquiries: 0, whatsappEnquiries: 0, callEnquiries: 0, openEnquiries: 0, unreadNotifications: 0, portfolioMedia: 0, averageRating: 0, reviewCount: 0 },
};

export function calculateVendorCompletion(data: VendorWorkspace) {
  const v = data.vendor ?? {};

  const stateBySection: Record<VendorProfileSectionId, CompletionState> = {
    business: VendorReadinessRules.businessInfo(v),
    about: VendorReadinessRules.about(v),
    location: VendorReadinessRules.location(v),
    contact: VendorReadinessRules.contact(v),
    identity: VendorReadinessRules.brand(v),
    services: VendorReadinessRules.servicesAndPackages(data.services),
    portfolio: VendorReadinessRules.portfolio(data.albums, data.media),
    availability: VendorReadinessRules.availability(v, data.availability),
    tags: VendorReadinessRules.tags(v),
  };
  const items: CompletionItem[] = vendorProfileSections.map((section) => ({
    id: section.id,
    label: section.label,
    state: stateBySection[section.id],
    route: section.route,
  }));
  const weights: Record<CompletionState, number> = { complete: 1, partial: 0.5, missing: 0, attention: 0.25 };
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
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    void workspaceEpoch;
    const thisRequest = ++requestId.current;
    const isCurrent = () => mounted.current && requestId.current === thisRequest;
    setLoading(true);
    setError(null);
    setPortfolioError(null);
    if (isPreviewMode) {
      if (isCurrent()) {
        setData(emptyWorkspace);
        setLoading(false);
      }
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (!user) {
        setData(emptyWorkspace);
        setError("Your Vendor session has expired. Sign in again to edit the live business profile.");
        return;
      }
      const { data: vendor, error: vendorError } = await supabase
        .from("vendors").select("*, categories(name)").eq("profile_id", user.id).maybeSingle();
      if (!isCurrent()) return;
      if (vendorError) throw vendorError;
      if (!vendor) {
        // The Vendor route guard (components/auth/VendorRouteGuard.tsx)
        // already ran resolveVendorDestination() -- which claims an
        // unowned-but-approved workspace exactly once -- before this
        // screen could ever mount, so a missing vendor row here means the
        // workspace genuinely isn't linked to this account. Do NOT call
        // claim_vendor_workspace() again: it is not idempotent-safe to
        // retry blindly from a data hook, and calling it from here as well
        // as from the guard is exactly what caused claim_vendor_workspace
        // to be hit repeatedly (and non-retryably 400) on every mount,
        // focus and refresh.
        throw new Error("No Vendor business is connected to this account. Sign in with your approved Vendor email.");
      }
      if (isCurrent()) setData({ ...emptyWorkspace, vendor });
      const today = new Date().toISOString().slice(0, 10);
      const [
        albums, media, heroMedia, availability, notifications, reviews, services, subscription,
        unreadNotifications, portfolioMedia, reviewSummary,
      ] = await Promise.all([
        supabase.from("vendor_portfolio_albums").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_portfolio_media").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_portfolio_hero_media").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_availability").select("*").eq("vendor_id", vendor.id).gte("date", today).order("date").limit(12),
        supabase.from("vendor_notifications").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("reviews").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("vendor_services").select("*").eq("vendor_id", vendor.id).order("display_order").order("created_at"),
        supabase.from("subscriptions").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("vendor_notifications").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id).eq("is_read", false),
        supabase.from("vendor_portfolio_media").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id),
        supabase.from("review_aggregates").select("average_rating,review_count").eq("vendor_key", vendor.id).maybeSingle(),
      ]);
      if (!isCurrent()) return;
      const failed = [
        reviews, services, subscription, unreadNotifications, portfolioMedia, reviewSummary,
      ].find((result) => result.error);
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
        enquiries: [],
        notifications: notifications.data ?? [],
        reviews: reviews.data ?? [],
        services: services.data ?? [],
        subscription: subscription.data ?? null,
        stats: (() => {
          const revList = reviews.data ?? [];
          const computedAvg = revList.length > 0
            ? Math.round((revList.reduce((acc: number, r: any) => acc + (Number(r.rating) || 0), 0) / revList.length) * 100) / 100
            : 0;
          return {
            totalEnquiries: 0,
            whatsappEnquiries: 0,
            callEnquiries: 0,
            openEnquiries: 0,
            unreadNotifications: unreadNotifications.count ?? 0,
            portfolioMedia: portfolioMedia.count ?? 0,
            averageRating: Number(reviewSummary.data?.average_rating ?? computedAvg),
            reviewCount: Number(reviewSummary.data?.review_count ?? revList.length),
          };
        })(),
      });
    } catch (caught) {
      if (isCurrent()) setError(caught instanceof Error ? caught.message : "Unable to load your vendor workspace.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isPreviewMode, workspaceEpoch]);

  useEffect(() => { void refresh(); }, [refresh]);

  // The workspace shell stays mounted around login and logout routes. Without
  // listening for auth changes it can retain the previous account's empty
  // workspace (and render the fallback business name) after a user switches
  // from a customer session to a vendor session in the same browser tab.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      // Supabase advises deferring client calls out of this callback so token
      // persistence completes before refresh reads the active user.
      setTimeout(() => { void refresh(); }, 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [refresh]);

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
    let channel = supabase
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
      );

    const vendorTables = [
      "vendor_bookings",
      "vendor_enquiries",
      "vendor_notifications",
      "vendor_portfolio_albums",
      "vendor_portfolio_media",
      "vendor_services",
      "vendor_availability",
      "subscriptions",
      "reviews",
      "featured_vendor_placements",
    ];
    vendorTables.forEach((table) => {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `vendor_id=eq.${vendorId}` },
        scheduleRefresh,
      );
    });
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "reviews", filter: `vendor_key=eq.${vendorId}` },
      scheduleRefresh,
    );
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "review_aggregates", filter: `vendor_key=eq.${vendorId}` },
      scheduleRefresh,
    );
    channel.subscribe();

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
