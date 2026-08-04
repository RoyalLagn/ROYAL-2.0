import { supabase } from "@/services/supabase";
import type { CrmSalesExecutive, CrmSalesExecutiveInput } from "@/types/crm/executive";

const CACHE_MS = 20_000;
let cache: { at: number; rows: CrmSalesExecutive[] } | null = null;
let channelSequence = 0;

export const CrmExecutiveService = {
  invalidate() {
    cache = null;
  },

  async list(force = false): Promise<CrmSalesExecutive[]> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const { data, error } = await supabase
      .from("crm_sales_executives")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as CrmSalesExecutive[];
    cache = { at: Date.now(), rows };
    return rows;
  },

  async create(input: CrmSalesExecutiveInput) {
    const { data, error } = await supabase.from("crm_sales_executives").insert({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      is_active: input.isActive ?? true,
    }).select().single();
    if (error) throw error;
    this.invalidate();
    return data as CrmSalesExecutive;
  },

  async update(id: string, input: Partial<CrmSalesExecutiveInput>) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
    if (input.email !== undefined) payload.email = input.email?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;
    const { error } = await supabase.from("crm_sales_executives").update(payload).eq("id", id);
    if (error) throw error;
    this.invalidate();
  },

  async remove(id: string) {
    const { error } = await supabase.from("crm_sales_executives").delete().eq("id", id);
    if (error) throw error;
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-executives-${channelSequence}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "crm_sales_executives" }, onChange);
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
