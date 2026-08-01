import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SubscriptionAccessService } from "@/subscriptions/services/SubscriptionAccessService";
import type { SubscriptionAccess, SubscriptionFeatureKey, SubscriptionOffer, SubscriptionPlan } from "@/subscriptions/types";
import { ClipUploadService } from "@/clips/services";
import { DEFAULT_CLIP_PLAN_LIMITS } from "@/clips/constants";
import { subscriptionErrorMessage } from "@/subscriptions/error";

type SubscriptionContextValue = {
  access: SubscriptionAccess | null;
  plans: SubscriptionPlan[];
  offers: SubscriptionOffer[];
  settings: Record<string, unknown>;
  loading: boolean;
  error: string | null;
  platformAvailable: boolean;
  hasFeature: (feature: SubscriptionFeatureKey) => boolean;
  refresh: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: React.PropsWithChildren) {
  const [access, setAccess] = useState<SubscriptionAccess | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [offers, setOffers] = useState<SubscriptionOffer[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const refreshRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setLoading(true);
    setError(null);
    try {
      const nextPlans = await SubscriptionAccessService.listPlans();
      if (!SubscriptionAccessService.isPlatformSchemaAvailable()) {
        if (!mounted.current || request !== refreshRequest.current) return;
        setAccess(null); setPlans([]); setOffers([]); setSettings({});
        return;
      }
      const [nextAccess, nextOffers, nextSettings] = await Promise.all([
        SubscriptionAccessService.getCurrentAccess(),
        SubscriptionAccessService.listOffers(),
        SubscriptionAccessService.listPublicSettings(),
      ]);
      if (!mounted.current || request !== refreshRequest.current) return;
      setAccess(nextAccess);
      setPlans(nextPlans);
      setOffers(nextOffers);
      setSettings(nextSettings);
    } catch (caught) {
      if (!mounted.current || request !== refreshRequest.current) return;
      const message = subscriptionErrorMessage(caught, "Unable to load subscription access.");
      if (!/does not exist|schema cache|PGRST20/i.test(message)) setError(message);
    } finally {
      if (mounted.current && request === refreshRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setAccess(null);
    setPlans([]);
    setOffers([]);
    setSettings({});
    setError(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    ClipUploadService.configureLimitResolver({
      resolve: async () => {
        const nextAccess = await SubscriptionAccessService.getCurrentAccess();
        const nextPlans = await SubscriptionAccessService.listPlans();
        const plan = nextPlans.find((candidate) => candidate.id === nextAccess?.plan_id);
        const configured = plan?.features.find((feature) => feature.feature_key === "upload_clips")?.limit_value;
        return { maximumClips: configured ?? DEFAULT_CLIP_PLAN_LIMITS.maximumClips };
      },
    });
    return () => ClipUploadService.configureLimitResolver(null);
  }, []);

  const hasFeature = useCallback(
    (feature: SubscriptionFeatureKey) => SubscriptionAccessService.hasFeature(access, plans, feature),
    [access, plans],
  );
  const platformAvailable = Boolean(access || plans.length || Object.keys(settings).length);
  const value = useMemo(() => ({ access, plans, offers, settings, loading, error, platformAvailable, hasFeature, refresh }), [access, error, hasFeature, loading, offers, plans, platformAvailable, refresh, settings]);
  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error("useSubscription must be used inside SubscriptionProvider.");
  return context;
}
