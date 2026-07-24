import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabase";

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
  availability: any[];
  enquiries: any[];
  notifications: any[];
  reviews: any[];
  services: any[];
  subscription: any | null;
};

const emptyWorkspace: VendorWorkspace = {
  vendor: null, albums: [], media: [], availability: [], enquiries: [],
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
  const [data, setData] = useState<VendorWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPortfolioError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setData(emptyWorkspace);
        return;
      }
      const { data: vendor, error: vendorError } = await supabase
        .from("vendors").select("*, categories(name)").eq("profile_id", user.id).maybeSingle();
      if (vendorError) throw vendorError;
      if (!vendor) {
        setData(emptyWorkspace);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const [albums, media, availability, enquiries, notifications, reviews, services, subscription] = await Promise.all([
        supabase.from("vendor_portfolio_albums").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_portfolio_media").select("*").eq("vendor_id", vendor.id).order("display_order"),
        supabase.from("vendor_availability").select("*").eq("vendor_id", vendor.id).gte("date", today).order("date").limit(12),
        supabase.from("vendor_enquiries").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("vendor_notifications").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("reviews").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("vendor_services").select("*").eq("vendor_id", vendor.id).order("created_at"),
        supabase.from("subscriptions").select("*").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      // Album, availability, enquiry and notification tables are additive. Keep
      // the existing Vendor UI usable while a deployment is still applying the
      // new migration instead of failing the whole workspace.
      const failed = [reviews, services, subscription].find((result) => result.error);
      if (failed?.error) throw failed.error;
      const portfolioFailure = albums.error ?? media.error;
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
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const completion = useMemo(() => calculateVendorCompletion(data), [data]);
  return { data, loading, error, portfolioError, completion, refresh };
}
