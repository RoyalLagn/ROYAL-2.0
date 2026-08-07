import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabase";
import { useVendorSession } from "@/context/VendorSessionContext";

export type CompletionState = "complete" | "partial" | "missing" | "attention";
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
};

const emptyWorkspace: VendorWorkspace = {
  vendor: null, albums: [], media: [], heroMedia: [], availability: [], enquiries: [],
  notifications: [], reviews: [], services: [], subscription: null,
};

const hasText = (value?: string | null) => Boolean(value?.trim());

// Centralized per-section readiness rules. Both the readiness checklist
// (below) and each dedicated section form import these so the checklist
// card and the form it opens can never disagree about what "complete"
// means for that section. Keep every rule here -- do not re-derive
// completion inline in a screen.
export const VendorReadinessRules = {
  businessInfo(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    if (!hasText(v.business_name)) return "missing";
    if (!hasText(v.owner_name) || !v.category_id) return "partial";
    return "complete";
  },
  about(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    if (!hasText(v.description)) return "missing";
    if (v.description.trim().length < 80 || v.experience == null) return "partial";
    return "complete";
  },
  location(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    const hasPincode = /^[1-9][0-9]{5}$/.test(v.pincode ?? "");
    const hasCity = Boolean(v.primary_city_id || hasText(v.city));
    const hasArea = Boolean(v.primary_area_id);
    const score = [hasPincode, hasCity, hasArea].filter(Boolean).length;
    if (score === 0) return "missing";
    if (score < 3) return "partial";
    return "complete";
  },
  contact(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    const hasPrimary = hasText(v.contact_email) || hasText(v.contact_phone);
    const hasBonus = hasText(v.website) || hasText(v.instagram) || hasText(v.facebook);
    if (hasPrimary) return "complete";
    if (hasBonus) return "partial";
    return "missing";
  },
  brand(vendor: any | null): CompletionState {
    return hasText(vendor?.logo_url) ? "complete" : "missing";
  },
  services(services: any[]): CompletionState {
    if (!services.length) return "missing";
    return services.some((service) => service.status === "active") ? "complete" : "partial";
  },
  pricing(services: any[]): CompletionState {
    const active = services.filter((service) => service.status === "active");
    if (!active.length) return "missing";
    const priced = active.some((service) => service.price_type !== "contact" && Number(service.price) > 0);
    return priced ? "complete" : "partial";
  },
  portfolio(albums: any[], media: any[]): CompletionState {
    if (!media.length) return "missing";
    return media.length >= 6 && albums.length >= 1 ? "complete" : "partial";
  },
  availability(vendor: any | null, availability: any[]): CompletionState {
    const v = vendor ?? {};
    const hasHours = Array.isArray(v.business_hours) && v.business_hours.some((entry: any) => !entry?.closed);
    const hasDates = availability.length >= 3;
    if (!hasHours && !availability.length) return "attention";
    if (hasHours && hasDates) return "complete";
    return "partial";
  },
  tags(vendor: any | null): CompletionState {
    const count = vendor?.tags?.length ?? 0;
    if (!count) return "missing";
    return count >= 3 ? "complete" : "partial";
  },
};

export function calculateVendorCompletion(data: VendorWorkspace) {
  const v = data.vendor ?? {};

  const items: CompletionItem[] = [
    { id: "business", label: "Business information", state: VendorReadinessRules.businessInfo(v), route: "/VendorEditBusinessInfo" },
    { id: "about", label: "About the business", state: VendorReadinessRules.about(v), route: "/VendorEditAbout" },
    { id: "location", label: "Location", state: VendorReadinessRules.location(v), route: "/VendorEditLocation" },
    { id: "contact", label: "Contact information", state: VendorReadinessRules.contact(v), route: "/VendorEditContact" },
    { id: "identity", label: "Logo and brand", state: VendorReadinessRules.brand(v), route: "/VendorEditBrand" },
    { id: "services", label: "Services", state: VendorReadinessRules.services(data.services), route: "/VendorServices" },
    { id: "pricing", label: "Pricing and packages", state: VendorReadinessRules.pricing(data.services), route: "/VendorServices" },
    { id: "portfolio", label: "Portfolio albums", state: VendorReadinessRules.portfolio(data.albums, data.media), route: "/VendorGallery" },
    { id: "availability", label: "Availability", state: VendorReadinessRules.availability(v, data.availability), route: "/VendorCalendar" },
    { id: "tags", label: "Search tags", state: VendorReadinessRules.tags(v), route: "/VendorEditTags" },
  ];
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
      if (!isCurrent()) return;
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
      if (isCurrent()) setError(caught instanceof Error ? caught.message : "Unable to load your vendor workspace.");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isPreviewMode, workspaceEpoch]);

  useEffect(() => { void refresh(); }, [refresh]);

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
