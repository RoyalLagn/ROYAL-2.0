import { useCallback, useEffect, useState } from "react";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import type { CrmWorkspaceVendor } from "@/types/crm/workspace";
import type { CrmVendorStatus } from "@/types/crm/vendor";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load vendors.");
  }
  return "Unable to load vendors.";
}

export function useWorkspaceVendors(token: string | null) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CrmVendorStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [rows, setRows] = useState<CrmWorkspaceVendor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await CrmWorkspaceSessionService.listVendors(token, query, status, page, pageSize);
      setRows(result.rows);
      setTotal(result.total);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, query, status, page]);

  useEffect(() => { void load(); }, [load]);

  const updateQuery = useCallback((value: string) => { setQuery(value); setPage(1); }, []);
  const updateStatus = useCallback((value: "all" | CrmVendorStatus) => { setStatus(value); setPage(1); }, []);

  return {
    query, setQuery: updateQuery, status, setStatus: updateStatus, page, setPage, pageSize,
    rows, total, loading, refreshing, error, setError,
    refresh: () => load(true),
  };
}
