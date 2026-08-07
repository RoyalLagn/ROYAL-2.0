import { useCallback, useEffect, useState } from "react";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import type { CrmMarketingWorkspace, CrmMarketingWorkspaceStats } from "@/types/crm/marketingWorkspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load marketing workspaces.";
}

export function useMarketingWorkspaces() {
  const [rows, setRows] = useState<CrmMarketingWorkspace[]>([]);
  const [stats, setStats] = useState<Record<string, CrmMarketingWorkspaceStats>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const workspaces = await CrmMarketingWorkspaceService.list();
      setRows(workspaces);
      const statPairs = await Promise.all(
        workspaces.map(async (workspace) => [workspace.id, await CrmMarketingWorkspaceService.stats(workspace.id)] as const),
      );
      setStats(Object.fromEntries(statPairs));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmMarketingWorkspaceService.subscribe(() => void load(true)), [load]);

  return { rows, stats, loading, refreshing, error, refresh: () => load(true) };
}
