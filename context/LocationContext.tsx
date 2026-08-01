import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublicAuth } from "@/context/PublicAuthContext";
import type { LocationPreference, SupportedCity } from "@/locations/types";
import {
  findSupportedSelection,
  formatLocationPreference,
  listActiveLocations,
  loadCustomerLocationPreference,
  loadGuestLocationPreference,
  loadLocationSettings,
  saveCustomerLocationPreference,
  saveGuestLocationPreference,
  subscribeToLocationChanges,
} from "@/services/locations";

type LocationContextValue = {
  locations: SupportedCity[];
  preference: LocationPreference | null;
  location: string;
  city: string;
  area: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  needsLocationSelection: boolean;
  strictCityOnly: boolean;
  claimLocationOnboardingPrompt: () => boolean;
  setLocation: (preference: LocationPreference) => Promise<void>;
  refreshLocations: () => Promise<void>;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = usePublicAuth();
  const [locations, setLocations] = useState<SupportedCity[]>([]);
  const [preference, setPreference] = useState<LocationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLocationSelection, setNeedsLocationSelection] = useState(false);
  const [strictCityOnly, setStrictCityOnly] = useState(false);
  const promptClaimed = useRef(false);

  useEffect(() => {
    promptClaimed.current = false;
  }, [session?.user.id]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [activeLocations, settings] = await Promise.all([
        listActiveLocations({ force }),
        loadLocationSettings(),
      ]);
      setLocations(activeLocations);
      setStrictCityOnly(settings.strictCityOnly);

      const isCustomer = profile?.role === "public_user";
      const stored = isCustomer && session?.user
        ? await loadCustomerLocationPreference(session.user.id)
        : await loadGuestLocationPreference();
      const selected = findSupportedSelection(activeLocations, stored);
      if (selected && stored) {
        setPreference(stored);
        setNeedsLocationSelection(false);
      } else if (stored || isCustomer) {
        // Preserve the inactive preference in storage/database and ask for a
        // replacement. Never silently rewrite historical profile data.
        setPreference(null);
        setNeedsLocationSelection(true);
      } else {
        const first = activeLocations[0];
        setPreference(first ? { cityId: first.id, areaId: null } : null);
        setNeedsLocationSelection(!first);
      }
    } catch (caught) {
      setLocations([]);
      setPreference(null);
      setNeedsLocationSelection(true);
      setError(caught instanceof Error ? caught.message : "Unable to load supported locations.");
    } finally {
      setLoading(false);
    }
  }, [profile?.role, session?.user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeToLocationChanges(() => { void load(true); }), [load]);

  const setLocation = useCallback(async (next: LocationPreference) => {
    const selected = findSupportedSelection(locations, next);
    if (!selected) throw new Error("Choose an active RoyalLagn location.");
    setSaving(true);
    try {
      if (profile?.role === "public_user" && session?.user) {
        await saveCustomerLocationPreference(next);
      } else {
        await saveGuestLocationPreference(next);
      }
      setPreference(next);
      setNeedsLocationSelection(false);
    } finally {
      setSaving(false);
    }
  }, [locations, profile?.role, session?.user]);

  const claimLocationOnboardingPrompt = useCallback(() => {
    if (
      promptClaimed.current
      || profile?.role !== "public_user"
      || !session?.user
      || !needsLocationSelection
    ) return false;
    promptClaimed.current = true;
    return true;
  }, [needsLocationSelection, profile?.role, session?.user]);

  const selection = useMemo(
    () => findSupportedSelection(locations, preference),
    [locations, preference],
  );
  const value = useMemo<LocationContextValue>(() => ({
    locations,
    preference,
    location: formatLocationPreference(locations, preference),
    city: selection?.city.name ?? "Choose location",
    area: selection?.area?.name ?? null,
    loading,
    saving,
    error,
    needsLocationSelection,
    strictCityOnly,
    claimLocationOnboardingPrompt,
    setLocation,
    refreshLocations: () => load(true),
  }), [
    error,
    load,
    loading,
    locations,
    needsLocationSelection,
    preference,
    claimLocationOnboardingPrompt,
    saving,
    selection?.area?.name,
    selection?.city.name,
    setLocation,
    strictCityOnly,
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useCustomerLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useCustomerLocation must be used inside LocationProvider");
  return context;
}
