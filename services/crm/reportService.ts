import { supabase } from "@/services/supabase";
import { crmError } from "@/services/crm/errors";
import type { CrmTerritoryNode } from "@/types/crm/territory";

export type CategoryBreakdownItem = { categoryId: string; name: string; count: number };
export type ExecutivePerformanceItem = {
  executiveId: string | null;
  name: string;
  total: number;
  registered: number;
  premium: number;
};
export type DailyRegistrationPoint = { date: string; count: number };
export type ConversionRates = {
  registrationConversion: number;
  premiumConversion: number;
  callConversion: number;
  meetingConversion: number;
};

async function count(table: string, apply: (query: any) => any = (query) => query) {
  const result = await apply(supabase.from(table).select("id", { count: "exact", head: true }));
  if (result.error) throw crmError(result.error);
  return result.count ?? 0;
}

export const CrmReportService = {
  async categoryBreakdown(): Promise<CategoryBreakdownItem[]> {
    const { data, error } = await supabase
      .from("crm_vendors")
      .select("category_id, crm_vendor_categories(name)");
    if (error) throw crmError(error);
    const tally = new Map<string, CategoryBreakdownItem>();
    for (const row of (data ?? []) as any[]) {
      if (!row.category_id) continue;
      const existing = tally.get(row.category_id);
      if (existing) existing.count += 1;
      else tally.set(row.category_id, { categoryId: row.category_id, name: row.crm_vendor_categories?.name ?? "Unknown", count: 1 });
    }
    return Array.from(tally.values()).sort((a, b) => b.count - a.count);
  },

  async districtPerformance(): Promise<CrmTerritoryNode[]> {
    const { data, error } = await supabase.rpc("admin_crm_list_territory", { target_level: "district", parent_filter: null });
    if (error) throw crmError(error);
    return ((data ?? []) as CrmTerritoryNode[]).filter((row) => row.vendor_count > 0).sort((a, b) => b.vendor_count - a.vendor_count);
  },

  async executivePerformance(): Promise<ExecutivePerformanceItem[]> {
    const [executivesResult, vendorsResult] = await Promise.all([
      supabase.from("crm_sales_executives").select("id, name").eq("is_active", true),
      supabase.from("crm_vendors").select("assigned_executive_id, status"),
    ]);
    if (executivesResult.error) throw crmError(executivesResult.error);
    if (vendorsResult.error) throw crmError(vendorsResult.error);
    const byExecutive = new Map<string, ExecutivePerformanceItem>();
    for (const executive of executivesResult.data ?? []) {
      byExecutive.set(executive.id, { executiveId: executive.id, name: executive.name, total: 0, registered: 0, premium: 0 });
    }
    let unassigned = { executiveId: null as string | null, name: "Unassigned", total: 0, registered: 0, premium: 0 };
    for (const vendor of (vendorsResult.data ?? []) as { assigned_executive_id: string | null; status: string }[]) {
      const bucket = vendor.assigned_executive_id ? byExecutive.get(vendor.assigned_executive_id) : undefined;
      const target = bucket ?? unassigned;
      target.total += 1;
      if (vendor.status === "registered_on_royallagn" || vendor.status === "subscription_pending" || vendor.status === "premium_customer") target.registered += 1;
      if (vendor.status === "premium_customer") target.premium += 1;
    }
    const rows = Array.from(byExecutive.values());
    if (unassigned.total > 0) rows.push(unassigned);
    return rows.sort((a, b) => b.total - a.total);
  },

  async dailyRegistrations(days: number): Promise<DailyRegistrationPoint[]> {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("crm_activities")
      .select("created_at")
      .eq("to_status", "registered_on_royallagn")
      .gte("created_at", since.toISOString());
    if (error) throw crmError(error);
    const tally = new Map<string, number>();
    for (let i = 0; i < days; i += 1) {
      const day = new Date(since);
      day.setDate(day.getDate() + i);
      tally.set(day.toISOString().slice(0, 10), 0);
    }
    for (const row of data ?? []) {
      const key = String(row.created_at).slice(0, 10);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return Array.from(tally.entries()).map(([date, count]) => ({ date, count }));
  },

  async conversionRates(): Promise<ConversionRates> {
    const [total, registered, premium, callsCompleted, callsTotal, meetingsCompleted, meetingsTotal] = await Promise.all([
      count("crm_vendors"),
      count("crm_vendors", (q) => q.in("status", ["registered_on_royallagn", "subscription_pending", "premium_customer"])),
      count("crm_vendors", (q) => q.eq("status", "premium_customer")),
      count("crm_followups", (q) => q.eq("type", "call").eq("status", "completed")),
      count("crm_followups", (q) => q.eq("type", "call")),
      count("crm_followups", (q) => q.eq("type", "meeting").eq("status", "completed")),
      count("crm_followups", (q) => q.eq("type", "meeting")),
    ]);
    const registeredBase = registered;
    return {
      registrationConversion: total ? Math.round((registered / total) * 100) : 0,
      premiumConversion: registeredBase ? Math.round((premium / registeredBase) * 100) : 0,
      callConversion: callsTotal ? Math.round((callsCompleted / callsTotal) * 100) : 0,
      meetingConversion: meetingsTotal ? Math.round((meetingsCompleted / meetingsTotal) * 100) : 0,
    };
  },

  async getTarget(): Promise<number> {
    const { data, error } = await supabase.from("crm_settings").select("monthly_vendor_target").eq("id", true).maybeSingle();
    if (error) throw crmError(error);
    return data?.monthly_vendor_target ?? 50;
  },

  async setTarget(value: number) {
    const { error } = await supabase.from("crm_settings").update({ monthly_vendor_target: Math.max(0, Math.round(value)) }).eq("id", true);
    if (error) throw crmError(error);
  },

  async registrationsThisMonth(): Promise<number> {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return count("crm_activities", (q) => q.eq("to_status", "registered_on_royallagn").gte("created_at", start.toISOString()));
  },
};
