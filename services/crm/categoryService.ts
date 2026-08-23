import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type { CrmVendorCategory, CrmVendorCategoryInput } from "@/types/crm/category";

const CACHE_MS = 20_000;
let cache: { at: number; rows: CrmVendorCategory[] } | null = null;
let channelSequence = 0;

export const CrmCategoryService = {
  invalidate() {
    cache = null;
  },

  async list(force = false): Promise<CrmVendorCategory[]> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const { data, error } = await supabase
      .from("crm_vendor_categories")
      .select("*")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw crmError(error);
    const rows = (data ?? []) as CrmVendorCategory[];
    cache = { at: Date.now(), rows };
    return rows;
  },

  async create(input: CrmVendorCategoryInput) {
    const { data, error } = await supabase.from("crm_vendor_categories").insert({
      name: input.name.trim(),
      slug: input.slug.trim(),
      display_order: input.displayOrder ?? 0,
      is_active: input.isActive ?? true,
    }).select().single();
    if (error) throw crmError(error);
    this.invalidate();
    return data as CrmVendorCategory;
  },

  async rename(id: string, input: Partial<CrmVendorCategoryInput>) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.slug !== undefined) payload.slug = input.slug.trim();
    if (input.displayOrder !== undefined) payload.display_order = input.displayOrder;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    const { error } = await supabase.from("crm_vendor_categories").update(payload).eq("id", id);
    if (error) throw crmError(error);
    this.invalidate();
  },

  async reorder(orderedIds: string[]) {
    const results = await Promise.all(orderedIds.map((id, index) =>
      supabase.from("crm_vendor_categories").update({ display_order: index }).eq("id", id)));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw crmError(failed.error);
    this.invalidate();
  },

  async remove(id: string) {
    const { error } = await supabase.from("crm_vendor_categories").delete().eq("id", id);
    if (error) throw crmError(error);
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-categories-${channelSequence}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "crm_vendor_categories" }, onChange);
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
