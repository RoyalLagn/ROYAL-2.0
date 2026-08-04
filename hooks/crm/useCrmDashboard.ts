import { useCallback, useEffect, useState } from "react";
import { CrmVendorService } from "@/services/crm/vendorService";
import type { CrmVendorStatistics } from "@/types/crm/vendor";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load CRM dashboard.");
  }
  return "Unable to load CRM dashboard.";
}

export function useCrmDashboard() {
  const [statistics, setStatistics] = useState<CrmVendorStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setStatistics(await CrmVendorService.statistics());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmVendorService.subscribe(() => void load(true)), [load]);

  return { statistics, loading, refreshing, error, refresh: () => load(true) };
}
