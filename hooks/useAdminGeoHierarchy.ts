import { useCallback, useEffect, useState } from "react";
import type { GeoDistrict, GeoState, GeoTaluka } from "@/locations/types";
import {
  listAdminGeoDistricts,
  listAdminGeoStates,
  listAdminGeoTalukas,
  setDistrictTalukasAcceptingApplications,
  setGeoTalukaAcceptingApplications,
} from "@/services/geoLocations";

export function useAdminGeoHierarchy() {
  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [talukas, setTalukas] = useState<GeoTaluka[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingTalukas, setLoadingTalukas] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTalukaIds, setSavingTalukaIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const loadStates = useCallback(async () => {
    const items = await listAdminGeoStates();
    setStates(items);
    setSelectedStateId((current) => {
      if (current && items.some((item) => item.id === current)) return current;
      return items.find((item) => item.name.toLowerCase() === "maharashtra")?.id
        ?? items.find((item) => item.isActive)?.id
        ?? items[0]?.id
        ?? null;
    });
  }, []);

  useEffect(() => {
    loadStates()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load States."))
      .finally(() => setLoading(false));
  }, [loadStates]);

  useEffect(() => {
    setDistricts([]);
    setTalukas([]);
    setSelectedDistrictId(null);
    if (!selectedStateId) return;

    let active = true;
    setLoadingDistricts(true);
    setError("");
    listAdminGeoDistricts(selectedStateId)
      .then((items) => {
        if (!active) return;
        setDistricts(items);
        setSelectedDistrictId(items.find((item) => item.isActive)?.id ?? items[0]?.id ?? null);
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Unable to load Districts."))
      .finally(() => active && setLoadingDistricts(false));
    return () => { active = false; };
  }, [selectedStateId]);

  useEffect(() => {
    setTalukas([]);
    if (!selectedDistrictId) return;

    let active = true;
    setLoadingTalukas(true);
    setError("");
    listAdminGeoTalukas(selectedDistrictId)
      .then((items) => active && setTalukas(items))
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Unable to load Talukas."))
      .finally(() => active && setLoadingTalukas(false));
    return () => { active = false; };
  }, [selectedDistrictId]);

  const selectState = useCallback((id: string) => setSelectedStateId(id), []);
  const selectDistrict = useCallback((id: string) => setSelectedDistrictId(id), []);

  const toggleTaluka = useCallback(async (talukaId: string, accepting: boolean) => {
    // Optimistic, single-row update -- only the matching taluka.id changes
    // in local state, so a toggle can never bleed into a sibling Taluka.
    const previous = talukas.find((item) => item.id === talukaId)?.acceptingApplications;
    setError("");
    setTalukas((items) => items.map((item) => item.id === talukaId ? { ...item, acceptingApplications: accepting } : item));
    setSavingTalukaIds((items) => new Set(items).add(talukaId));
    try {
      await setGeoTalukaAcceptingApplications(talukaId, accepting);
    } catch (caught) {
      if (previous != null) {
        setTalukas((items) => items.map((item) => item.id === talukaId ? { ...item, acceptingApplications: previous } : item));
      }
      setError(caught instanceof Error ? caught.message : "Unable to update this Taluka.");
    } finally {
      setSavingTalukaIds((items) => {
        const next = new Set(items);
        next.delete(talukaId);
        return next;
      });
    }
  }, [talukas]);

  // Bulk on/off for every Taluka in the selected District at once (the
  // switch next to "X of Y active" in the Taluka list header). One atomic
  // `update ... where district_id = X` -- never a client-side loop of N
  // single-row writes, and scoped strictly to the current District so a
  // different District/State can never be affected.
  const setAllTalukasAccepting = useCallback(async (accepting: boolean) => {
    if (!selectedDistrictId || !talukas.length) return;
    const previous = talukas.map((item) => ({ id: item.id, acceptingApplications: item.acceptingApplications }));
    setError("");
    setTalukas((items) => items.map((item) => ({ ...item, acceptingApplications: accepting })));
    setSavingTalukaIds(new Set(talukas.map((item) => item.id)));
    try {
      await setDistrictTalukasAcceptingApplications(selectedDistrictId, accepting);
    } catch (caught) {
      setTalukas((items) => items.map((item) => {
        const found = previous.find((entry) => entry.id === item.id);
        return found ? { ...item, acceptingApplications: found.acceptingApplications } : item;
      }));
      setError(caught instanceof Error ? caught.message : "Unable to update Talukas for this District.");
    } finally {
      setSavingTalukaIds(new Set());
    }
  }, [selectedDistrictId, talukas]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadStates();
      if (selectedDistrictId) setTalukas(await listAdminGeoTalukas(selectedDistrictId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh locations.");
    } finally {
      setRefreshing(false);
    }
  }, [loadStates, selectedDistrictId]);

  return {
    states,
    districts,
    talukas,
    selectedStateId,
    selectedDistrictId,
    loading,
    loadingDistricts,
    loadingTalukas,
    refreshing,
    savingTalukaIds,
    error,
    selectState,
    selectDistrict,
    toggleTaluka,
    setAllTalukasAccepting,
    refresh,
  };
}
