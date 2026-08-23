import { useCallback, useEffect, useState } from "react";
import { CrmVendorService } from "@/services/crm/vendorService";
import type { CrmVendorFilters, CrmVendorListItem, CrmVendorStatus } from "@/types/crm/vendor";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load vendors.");
  }
  return "Unable to load vendors.";
}

const baseFilters = (clusterId: string | null, categoryId: string | null): CrmVendorFilters => ({
  query: "", status: "all", priority: "all",
  categoryId, clusterId, executiveId: null,
  location: "", createdFrom: "", createdTo: "",
  page: 1, pageSize: 20,
});

export function useCrmVendors(clusterId: string | null, categoryId: string | null) {
  const [filters, setFilters] = useState(() => baseFilters(clusterId, categoryId));
  const [rows, setRows] = useState<CrmVendorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await CrmVendorService.list(filters);
      setRows(result.rows);
      setTotal(result.total);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmVendorService.subscribe(() => void load(true)), [load]);

  const updateFilters = useCallback((changes: Partial<CrmVendorFilters>) => {
    setFilters((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  }, []);

  const changeStatus = useCallback(async (id: string, status: CrmVendorStatus, note?: string) => {
    const previous = rows;
    setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row));
    try {
      await CrmVendorService.updateStatus(id, status, note);
    } catch (reason) {
      setRows(previous);
      setError(errorMessage(reason));
      throw reason;
    }
  }, [rows]);

  return { filters, updateFilters, rows, total, loading, refreshing, error, setError, changeStatus, refresh: () => load(true) };
}
