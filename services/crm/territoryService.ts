import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type { CrmTerritoryInput, CrmTerritoryNode, TerritoryLevel } from "@/types/crm/territory";
import { territoryParentColumn, territoryTable } from "@/types/crm/territory";

const listCache = new Map<string, { at: number; rows: CrmTerritoryNode[] }>();
const CACHE_MS = 20_000;
let channelSequence = 0;

const cacheKey = (level: TerritoryLevel, parentId: string | null) => `${level}:${parentId ?? "root"}`;

export const CrmTerritoryService = {
  invalidate() {
    listCache.clear();
  },

  async list(level: TerritoryLevel, parentId: string | null = null, force = false): Promise<CrmTerritoryNode[]> {
    const key = cacheKey(level, parentId);
    const cached = listCache.get(key);
    if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.rows;
    const { data, error } = await supabase.rpc("admin_crm_list_territory", {
      target_level: level,
      parent_filter: parentId,
    });
    if (error) throw crmError(error);
    const rows = (data ?? []) as CrmTerritoryNode[];
    listCache.set(key, { at: Date.now(), rows });
    return rows;
  },

  async create(level: TerritoryLevel, parentId: string | null, input: CrmTerritoryInput) {
    const table = territoryTable[level];
    const payload: Record<string, unknown> = {
      name: input.name.trim(),
      slug: input.slug.trim(),
      display_order: input.displayOrder ?? 0,
      is_active: input.isActive ?? true,
    };
    if (level !== "state") {
      payload[territoryParentColumn[level as Exclude<TerritoryLevel, "state">]] = parentId;
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw crmError(error);
    this.invalidate();
    return data;
  },

  async rename(level: TerritoryLevel, id: string, input: Partial<CrmTerritoryInput>) {
    const table = territoryTable[level];
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.slug !== undefined) payload.slug = input.slug.trim();
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    if (error) throw crmError(error);
    this.invalidate();
  },

  async reorder(level: TerritoryLevel, orderedIds: string[]) {
    const table = territoryTable[level];
    await Promise.all(orderedIds.map((id, index) =>
      supabase.from(table).update({ display_order: index }).eq("id", id)));
    this.invalidate();
  },

  async remove(level: TerritoryLevel, id: string) {
    const table = territoryTable[level];
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw crmError(error);
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-territory-${channelSequence}`);
    for (const table of ["crm_states", "crm_districts", "crm_talukas", "crm_clusters"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
