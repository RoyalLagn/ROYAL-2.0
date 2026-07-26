import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminVendorService } from "@/services/adminVendorService";
import type { AdminVendorRecord, VendorFilters, VendorHealthMetrics, VendorStatistics } from "@/types/adminVendors";

const defaults: VendorFilters = {
  query: "", status: "all", verification: "all", plan: "all",
  categoryId: null, city: null, state: null,
  sort: "newest", page: 1, pageSize: 20,
};

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load vendors.");
  }
  return "Unable to load vendors.";
}

export function useAdminVendors() {
  const [filters, setFilters] = useState(defaults);
  const [rows, setRows] = useState<AdminVendorRecord[]>([]);
  const rowsRef = useRef<AdminVendorRecord[]>([]);
  const [statistics, setStatistics] = useState<VendorStatistics | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [health, setHealth] = useState<Record<string, VendorHealthMetrics>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const [listResult, statsResult, categoryResult] = await Promise.allSettled([
      AdminVendorService.list(filters, force),
      AdminVendorService.statistics(),
      AdminVendorService.categories(),
    ]);
    if (listResult.status === "fulfilled") {
      setRows(listResult.value.rows);
      setTotal(listResult.value.total);
      AdminVendorService.healthMetrics(listResult.value.rows)
        .then(setHealth)
        .catch(() => setHealth({}));
    } else setError(errorMessage(listResult.reason));
    if (statsResult.status === "fulfilled") setStatistics(statsResult.value);
    if (categoryResult.status === "fulfilled") setCategories(categoryResult.value);
    setLoading(false);
  }, [filters]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => AdminVendorService.subscribe(() => {
    AdminVendorService.invalidate();
    void load(true);
  }), [load]);

  const updateFilters = useCallback((changes: Partial<VendorFilters>) => {
    setFilters((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  }, []);
  const toggle = useCallback((id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.record_id)), [rows, selected]);
  const optimisticPatch = useCallback((ids: string[], patch: Partial<AdminVendorRecord>) => {
    const previous = rowsRef.current.filter((row) => ids.includes(row.record_id));
    setRows((current) => current.map((row) => ids.includes(row.record_id) ? { ...row, ...patch } : row));
    return () => setRows((current) => current.map((row) => previous.find((item) => item.record_id === row.record_id) ?? row));
  }, []);

  return {
    filters, updateFilters, rows, total, statistics, categories,
    loading, error, selected, selectedRows, toggle, health, optimisticPatch,
    clearSelected: () => setSelected(new Set()), refresh: () => load(true),
  };
}
