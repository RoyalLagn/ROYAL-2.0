import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmTerritoryService } from "@/services/crm/territoryService";
import { slugifyCrmName } from "@/services/crm/slug";
import type { CrmTerritoryNode, TerritoryLevel } from "@/types/crm/territory";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load territory data.");
  }
  return "Unable to load territory data.";
}

export function useCrmTerritory(level: TerritoryLevel, parentId: string | null) {
  const [rows, setRows] = useState<CrmTerritoryNode[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false, force = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setRows(await CrmTerritoryService.list(level, parentId, force));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [level, parentId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => CrmTerritoryService.subscribe(() => void load(false, true)), [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
  }, [rows, query]);

  const create = useCallback(async (name: string) => {
    setSaving(true);
    setError(null);
    try {
      await CrmTerritoryService.create(level, parentId, {
        name,
        slug: slugifyCrmName(name),
        displayOrder: (rows[rows.length - 1]?.display_order ?? 0) + 10,
      });
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [level, parentId, rows, load]);

  const rename = useCallback(async (id: string, name: string) => {
    setSaving(true);
    setError(null);
    try {
      await CrmTerritoryService.rename(level, id, { name, slug: slugifyCrmName(name) });
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [level, load]);

  const toggleActive = useCallback(async (node: CrmTerritoryNode) => {
    setSaving(true);
    setError(null);
    try {
      await CrmTerritoryService.rename(level, node.id, { isActive: !node.is_active });
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [level, load]);

  const remove = useCallback(async (node: CrmTerritoryNode) => {
    setSaving(true);
    setError(null);
    try {
      await CrmTerritoryService.remove(level, node.id);
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [level, load]);

  const move = useCallback(async (index: number, direction: -1 | 1) => {
    const otherIndex = index + direction;
    if (!filtered[otherIndex] || query.trim()) return;
    const ordered = rows.map((row) => row.id);
    const currentId = ordered[index];
    const otherId = ordered[otherIndex];
    ordered[index] = otherId;
    ordered[otherIndex] = currentId;
    setSaving(true);
    try {
      await CrmTerritoryService.reorder(level, ordered);
      await load(false, true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [level, rows, filtered, query, load]);

  return {
    rows: filtered, totalCount: rows.length, query, setQuery,
    loading, refreshing, saving, error, setError,
    create, rename, remove, move, toggleActive,
    refresh: () => load(true, true),
  };
}
