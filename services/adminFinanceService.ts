import { Platform, Share } from "react-native";
import { supabase } from "@/services/supabase";
import type {
  FinanceBudget,
  FinanceBudgetItem,
  FinanceCategory,
  FinanceCloudinaryUsage,
  FinanceClosure,
  FinanceMonthData,
  FinanceScenario,
  FinanceScenarioInput,
  FinanceSummary,
  FinanceTaxRecord,
  FinanceTransaction,
  FinanceTransactionInput,
} from "@/types/adminFinance";

const PAGE_SIZE = 1000;

function monthBounds(monthStart: string) {
  if (!/^\d{4}-\d{2}-01$/.test(monthStart)) throw new Error("Choose a valid finance month.");
  const start = new Date(`${monthStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("Choose a valid finance month.");
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: monthStart, end: end.toISOString().slice(0, 10) };
}

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function numeric<T extends Record<string, unknown>>(row: T, fields: string[]) {
  const result = { ...row } as Record<string, unknown>;
  fields.forEach((field) => { result[field] = Number(result[field] ?? 0); });
  return result;
}

export function summarizeFinance(data: Pick<FinanceMonthData, "transactions" | "budget" | "budgetItems" | "taxes">): FinanceSummary {
  const recorded = data.transactions.filter((item) => item.status === "recorded");
  const revenue = recorded.filter((item) => item.direction === "revenue");
  const expenses = recorded.filter((item) => item.direction === "expense");
  const grossRevenue = revenue.reduce((sum, item) => sum + signedTransactionAmount(item), 0);
  const gatewayFees = revenue.reduce((sum, item) => sum + (item.source === "refund" ? 0 : item.gateway_fee), 0);
  const netRevenue = grossRevenue - gatewayFees;
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const estimatedTax = data.taxes.filter((item) => item.is_estimate).reduce((sum, item) => sum + item.amount, 0);
  const profitBeforeTax = netRevenue - expenseTotal;
  const budget = data.budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const revenueTarget = data.budget?.revenue_target ?? 0;
  return {
    grossRevenue,
    gatewayFees,
    netRevenue,
    expenses: expenseTotal,
    profitBeforeTax,
    estimatedTax,
    netProfit: profitBeforeTax - estimatedTax,
    budget,
    budgetRemaining: budget - expenseTotal,
    revenueTarget,
    revenueTargetGap: netRevenue - revenueTarget,
  };
}

export function signedTransactionAmount(item: Pick<FinanceTransaction, "amount" | "source">) {
  return item.source === "refund" ? -item.amount : item.amount;
}

export const AdminFinanceService = {
  async loadMonth(monthStart: string): Promise<FinanceMonthData> {
    const bounds = monthBounds(monthStart);
    const [categoriesResult, transactions, budgetResult, taxesResult, usageResult, scenariosResult, closureResult] = await Promise.all([
      supabase.from("finance_categories").select("id,name,group_name,direction,is_system,is_active").eq("is_active", true).order("direction").order("group_name").order("name"),
      allRows<Record<string, unknown>>((from, to) => supabase.from("finance_transactions").select("id,occurred_on,direction,category_id,amount,tax_amount,gateway_fee,source,source_payment_id,source_event_key,payment_method,counterparty,reference_number,is_recurring,status,notes,created_at,finance_categories(name,group_name)").gte("occurred_on", bounds.start).lt("occurred_on", bounds.end).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(from, to)),
      supabase.from("finance_budgets").select("id,month_start,name,revenue_target,status,notes").eq("month_start", bounds.start).maybeSingle(),
      supabase.from("finance_tax_records").select("id,period_start,period_end,tax_type,amount,is_estimate,notes").lt("period_start", bounds.end).gte("period_end", bounds.start).order("tax_type"),
      supabase.from("finance_cloudinary_usage").select("id,month_start,storage_percent,bandwidth_percent,transformations_percent,estimated_cost,actual_cost,notes").eq("month_start", bounds.start).maybeSingle(),
      supabase.from("finance_scenarios").select("id,name,total_vendors,free_percent,premium_percent,elite_percent,premium_price,elite_price,monthly_fixed_expenses").order("updated_at", { ascending: false }),
      supabase.from("finance_monthly_closures").select("id,month_start,status,checklist,snapshot,closed_at,correction_reason").eq("month_start", bounds.start).maybeSingle(),
    ]);
    for (const result of [categoriesResult, budgetResult, taxesResult, usageResult, scenariosResult, closureResult]) {
      if (result.error) throw result.error;
    }
    const budget = budgetResult.data ? numeric(budgetResult.data, ["revenue_target"]) as FinanceBudget : null;
    let budgetItems: FinanceBudgetItem[] = [];
    if (budget) {
      const { data, error } = await supabase.from("finance_budget_items").select("id,budget_id,category_id,amount").eq("budget_id", budget.id);
      if (error) throw error;
      budgetItems = (data ?? []).map((row) => numeric(row, ["amount"]) as FinanceBudgetItem);
    }
    return {
      monthStart: bounds.start,
      categories: (categoriesResult.data ?? []) as FinanceCategory[],
      transactions: transactions.map((row) => numeric(row, ["amount", "tax_amount", "gateway_fee"]) as FinanceTransaction),
      budget,
      budgetItems,
      taxes: (taxesResult.data ?? []).map((row) => numeric(row, ["amount"]) as FinanceTaxRecord),
      cloudinaryUsage: usageResult.data ? numeric(usageResult.data, ["storage_percent", "bandwidth_percent", "transformations_percent", "estimated_cost", "actual_cost"]) as FinanceCloudinaryUsage : null,
      scenarios: (scenariosResult.data ?? []).map((row) => numeric(row, ["total_vendors", "free_percent", "premium_percent", "elite_percent", "premium_price", "elite_price", "monthly_fixed_expenses"]) as FinanceScenario),
      closure: closureResult.data as FinanceClosure | null,
    };
  },

  async saveTransaction(input: FinanceTransactionInput) {
    const payload = {
      occurred_on: input.occurred_on,
      direction: input.direction,
      category_id: input.category_id,
      amount: input.amount,
      tax_amount: input.tax_amount ?? 0,
      gateway_fee: input.gateway_fee ?? 0,
      source: "manual",
      payment_method: input.payment_method || null,
      counterparty: input.counterparty?.trim() || null,
      reference_number: input.reference_number?.trim() || null,
      is_recurring: input.is_recurring ?? false,
      notes: input.notes?.trim() || null,
      updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    };
    const request = input.id
      ? supabase.from("finance_transactions").update(payload).eq("id", input.id).eq("source", "manual")
      : supabase.from("finance_transactions").insert({ ...payload, created_by: payload.updated_by });
    const { error } = await request;
    if (error) throw error;
  },

  async deleteTransaction(id: string) {
    const { error } = await supabase.from("finance_transactions").delete().eq("id", id).eq("source", "manual");
    if (error) throw error;
  },

  async saveBudget(monthStart: string, revenueTarget: number, items: { category_id: string; amount: number }[]) {
    const { error } = await supabase.rpc("admin_save_finance_budget", { target_month: monthStart, target_revenue: revenueTarget, budget_items: items });
    if (error) throw error;
  },

  async saveTaxRecord(input: Omit<FinanceTaxRecord, "id"> & { id?: string }) {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const payload = { period_start: input.period_start, period_end: input.period_end, tax_type: input.tax_type, amount: input.amount, is_estimate: input.is_estimate, notes: input.notes?.trim() || null, updated_by: userId };
    const request = input.id ? supabase.from("finance_tax_records").update(payload).eq("id", input.id) : supabase.from("finance_tax_records").insert({ ...payload, created_by: userId });
    const { error } = await request;
    if (error) throw error;
  },

  async saveCloudinaryUsage(input: Omit<FinanceCloudinaryUsage, "id"> & { id?: string }) {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const payload = { month_start: input.month_start, storage_percent: input.storage_percent, bandwidth_percent: input.bandwidth_percent, transformations_percent: input.transformations_percent, estimated_cost: input.estimated_cost, actual_cost: input.actual_cost, notes: input.notes?.trim() || null, updated_by: userId };
    const request = input.id
      ? supabase.from("finance_cloudinary_usage").update(payload).eq("id", input.id)
      : supabase.from("finance_cloudinary_usage").insert({ ...payload, created_by: userId });
    const { error } = await request;
    if (error) throw error;
  },

  async saveScenario(input: FinanceScenarioInput) {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const payload = { name: input.name.trim(), total_vendors: input.total_vendors, free_percent: input.free_percent, premium_percent: input.premium_percent, elite_percent: input.elite_percent, premium_price: input.premium_price, elite_price: input.elite_price, monthly_fixed_expenses: input.monthly_fixed_expenses, updated_by: userId };
    const request = input.id ? supabase.from("finance_scenarios").update(payload).eq("id", input.id) : supabase.from("finance_scenarios").insert({ ...payload, created_by: userId });
    const { error } = await request;
    if (error) throw error;
  },

  async deleteScenario(id: string) {
    const { error } = await supabase.from("finance_scenarios").delete().eq("id", id);
    if (error) throw error;
  },

  async closeMonth(monthStart: string, checklist: Record<string, boolean>) {
    const { error } = await supabase.rpc("admin_close_finance_month", { target_month: monthStart, completed_checklist: checklist });
    if (error) throw error;
  },

  async reopenMonth(monthStart: string, reason: string) {
    const { error } = await supabase.rpc("admin_reopen_finance_month", { target_month: monthStart, reason });
    if (error) throw error;
  },

  subscribe(onChange: () => void) {
    const channel = supabase.channel(`admin-finance-${Date.now()}`);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onChange, 100);
    };
    ["finance_transactions", "finance_budgets", "finance_budget_items", "finance_tax_records", "finance_cloudinary_usage", "finance_scenarios", "finance_monthly_closures"].forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    });
    channel.subscribe();
    return () => { if (refreshTimer) clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
  },

  async exportCsv(data: FinanceMonthData) {
    const summary = summarizeFinance(data);
    const rows: (string | number)[][] = [
      ["RoyalLagn Finance Report", data.monthStart],
      ["Net revenue", summary.netRevenue], ["Expenses", summary.expenses], ["Profit before tax", summary.profitBeforeTax], ["Estimated tax provision", summary.estimatedTax], ["Net profit", summary.netProfit],
      [], ["Date", "Type", "Category", "Counterparty", "Amount", "Tax", "Gateway fee", "Source", "Reference", "Status"],
      ...data.transactions.map((item) => [item.occurred_on, item.direction, item.finance_categories?.name ?? "", item.counterparty ?? "", signedTransactionAmount(item), item.tax_amount, item.gateway_fee, item.source, item.reference_number ?? "", item.status]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const fileName = `royallagn-finance-${data.monthStart.slice(0, 7)}.csv`;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ title: fileName, message: csv });
  },
};
