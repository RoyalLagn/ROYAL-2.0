import { useCallback, useEffect, useState } from "react";
import { CrmMarketingWorkspaceService } from "@/services/crm/marketingWorkspaceService";
import type {
  CrmMarketingWorkspace,
  CrmMarketingWorkspaceCreateInput,
  CrmMarketingWorkspaceStats,
  MarketingWorkspaceStatus,
} from "@/types/crm/marketingWorkspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load this workspace.";
}

export function useMarketingWorkspaceDetail(workspaceId: string | null) {
  const [workspace, setWorkspace] = useState<CrmMarketingWorkspace | null>(null);
  const [stats, setStats] = useState<CrmMarketingWorkspaceStats | null>(null);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [workspaceResult, statsResult, categoryResult] = await Promise.all([
        CrmMarketingWorkspaceService.get(workspaceId),
        CrmMarketingWorkspaceService.stats(workspaceId),
        CrmMarketingWorkspaceService.getCategoryIds(workspaceId),
      ]);
      setWorkspace(workspaceResult);
      setStats(statsResult);
      setCategoryIds(categoryResult);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!workspaceId) return;
    return CrmMarketingWorkspaceService.subscribe(() => void load());
  }, [workspaceId, load]);

  const update = useCallback(async (changes: Partial<CrmMarketingWorkspaceCreateInput>) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      setWorkspace(await CrmMarketingWorkspaceService.update(workspaceId, changes));
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [workspaceId]);

  const setStatus = useCallback(async (status: MarketingWorkspaceStatus) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      setWorkspace(await CrmMarketingWorkspaceService.setStatus(workspaceId, status));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [workspaceId]);

  const regenerateToken = useCallback(async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      setWorkspace(await CrmMarketingWorkspaceService.regenerateToken(workspaceId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [workspaceId]);

  const saveCategories = useCallback(async (ids: string[]) => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await CrmMarketingWorkspaceService.setCategories(workspaceId, ids);
      setCategoryIds(ids);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [workspaceId]);

  const unassignVendor = useCallback(async (vendorId: string) => {
    if (!workspaceId) return;
    try {
      await CrmMarketingWorkspaceService.unassignVendor(workspaceId, vendorId);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [workspaceId, load]);

  return {
    workspace, stats, categoryIds, loading, saving, error, setError,
    update, setStatus, regenerateToken, saveCategories, unassignVendor,
    refresh: load,
  };
}
