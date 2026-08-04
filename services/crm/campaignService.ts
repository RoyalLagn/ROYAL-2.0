import { supabase } from "@/services/supabase";
import type { CrmCampaign, CrmCampaignInput } from "@/types/crm/campaign";

const CACHE_MS = 20_000;
let cache: { at: number; rows: CrmCampaign[] } | null = null;
let channelSequence = 0;

export const CrmCampaignService = {
  invalidate() {
    cache = null;
  },

  async list(force = false): Promise<CrmCampaign[]> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const { data, error } = await supabase
      .from("crm_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as CrmCampaign[];
    cache = { at: Date.now(), rows };
    return rows;
  },

  async create(input: CrmCampaignInput) {
    const { data, error } = await supabase.from("crm_campaigns").insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      status: input.status ?? "active",
    }).select().single();
    if (error) throw error;
    this.invalidate();
    return data as CrmCampaign;
  },

  async update(id: string, input: Partial<CrmCampaignInput>) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.description !== undefined) payload.description = input.description?.trim() || null;
    if (input.startDate !== undefined) payload.start_date = input.startDate || null;
    if (input.endDate !== undefined) payload.end_date = input.endDate || null;
    if (input.status !== undefined) payload.status = input.status;
    const { error } = await supabase.from("crm_campaigns").update(payload).eq("id", id);
    if (error) throw error;
    this.invalidate();
  },

  async remove(id: string) {
    const { error } = await supabase.from("crm_campaigns").delete().eq("id", id);
    if (error) throw error;
    this.invalidate();
  },

  subscribe(onChange: () => void) {
    channelSequence += 1;
    const channel = supabase.channel(`admin-crm-campaigns-${channelSequence}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "crm_campaigns" }, onChange);
    channel.subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
