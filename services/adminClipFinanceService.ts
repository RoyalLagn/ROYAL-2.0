import { supabase } from "@/services/supabase";
import type {
  ClipFinanceMonthlyInputs,
  ClipFinanceMonthlyResults,
  ClipFinanceMonthlySnapshot,
  ClipFinanceMonthlySnapshotInput,
  ClipFinanceScenario,
  ClipFinanceScenarioInput,
  ClipPlanPolicy,
} from "@/types/adminClipFinance";

const SCENARIO_FIELDS = "id,name,total_vendors,free_percent,premium_percent,elite_percent,monthly_clip_viewers,monthly_operating_expenses,income_tax_percent,bandwidth_network,on_season_months,off_season_percent";

function numericScenario(row: Record<string, unknown>): ClipFinanceScenario {
  return {
    id: String(row.id), name: String(row.name), total_vendors: Number(row.total_vendors),
    free_percent: Number(row.free_percent), premium_percent: Number(row.premium_percent), elite_percent: Number(row.elite_percent),
    monthly_clip_viewers: Number(row.monthly_clip_viewers), monthly_operating_expenses: Number(row.monthly_operating_expenses),
    income_tax_percent: Number(row.income_tax_percent),
    bandwidth_network: row.bandwidth_network === "asia" ? "asia" : "volume",
    on_season_months: Number(row.on_season_months), off_season_percent: Number(row.off_season_percent),
  };
}

function monthlySnapshot(row: Record<string, unknown>): ClipFinanceMonthlySnapshot {
  return {
    month_start: String(row.month_start),
    inputs: row.input_snapshot as ClipFinanceMonthlyInputs,
    results: row.result_snapshot as ClipFinanceMonthlyResults,
    updated_at: String(row.updated_at),
  };
}

export const AdminClipFinanceService = {
  async loadPlans(): Promise<ClipPlanPolicy[]> {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("slug,name,price,max_image_upload_mb,stored_image_target_mb,max_clip_upload_mb,stored_clip_target_mb,clip_delivery_target_mb")
      .in("slug", ["free", "premium", "elite"])
      .order("display_order");
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, price: Number(row.price ?? 0) })) as ClipPlanPolicy[];
  },

  async loadScenarios(): Promise<ClipFinanceScenario[]> {
    const { data, error } = await supabase.from("admin_clip_finance_scenarios").select(SCENARIO_FIELDS).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => numericScenario(row as Record<string, unknown>));
  },

  async saveScenario(input: ClipFinanceScenarioInput) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error("Sign in again to save this scenario.");
    const payload = { ...input, name: input.name.trim(), updated_by: userId };
    const request = input.id
      ? supabase.from("admin_clip_finance_scenarios").update(payload).eq("id", input.id)
      : supabase.from("admin_clip_finance_scenarios").insert({ ...payload, created_by: userId });
    const { error } = await request;
    if (error) throw error;
  },

  async loadYearSnapshots(yearStart: string, currentMonth: string): Promise<ClipFinanceMonthlySnapshot[]> {
    const { data, error } = await supabase
      .from("admin_clip_finance_monthly_results")
      .select("month_start,input_snapshot,result_snapshot,updated_at")
      .gte("month_start", yearStart)
      .lte("month_start", currentMonth)
      .order("month_start", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => monthlySnapshot(row as Record<string, unknown>));
  },

  async saveMonthlySnapshot(input: ClipFinanceMonthlySnapshotInput): Promise<ClipFinanceMonthlySnapshot> {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error("Sign in again to save this month's results.");
    const { data, error } = await supabase
      .from("admin_clip_finance_monthly_results")
      .upsert({
        month_start: input.month_start,
        input_snapshot: input.inputs,
        result_snapshot: input.results,
        updated_by: userId,
      }, { onConflict: "month_start" })
      .select("month_start,input_snapshot,result_snapshot,updated_at")
      .single();
    if (error) throw error;
    return monthlySnapshot(data as Record<string, unknown>);
  },
};
