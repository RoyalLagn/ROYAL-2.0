import { useCallback, useEffect, useState } from "react";
import { CrmMarketingWorkspaceSessionService } from "@/services/crm/marketingWorkspaceSessionService";
import type { CrmMarketingWorkspaceVendorListItem, MarketingInterestStatus } from "@/types/crm/marketingWorkspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load vendors.";
}

// `enabled` gates the actual network call — the caller passes this once it
// has confirmed the workspace session is valid, so an invalid/garbage token
// doesn't fire a second, redundant RPC alongside the session's own
// authenticate() call (which already surfaces the real error to the user).
export function useMarketingWorkspaceVendors(token: string | null, enabled = true) {
  const [query, setQuery] = useState("");
  const [interestFilter, setInterestFilter] = useState<"all" | MarketingInterestStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [rows, setRows] = useState<CrmMarketingWorkspaceVendorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token || !enabled) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await CrmMarketingWorkspaceSessionService.listVendors(token, query, interestFilter, null, page, pageSize);
      setRows(result.rows);
      setTotal(result.total);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, enabled, query, interestFilter, page]);

  useEffect(() => { void load(); }, [load]);

  const updateQuery = useCallback((value: string) => { setQuery(value); setPage(1); }, []);
  const updateInterestFilter = useCallback((value: "all" | MarketingInterestStatus) => { setInterestFilter(value); setPage(1); }, []);

  return {
    query, setQuery: updateQuery, interestFilter, setInterestFilter: updateInterestFilter,
    page, setPage, pageSize, rows, total, loading, refreshing, error, setError,
    refresh: () => load(true),
  };
}
