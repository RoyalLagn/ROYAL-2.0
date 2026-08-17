import { Platform, Share } from "react-native";
import { supabase } from "@/services/supabase";
import type {
  FinanceBudget,
  FinanceBudgetItem,
  FinanceCategory,
  FinanceCloudinaryUsage,
  FinanceClosure,
  FinanceMonthData,
  FinanceRevenueSourceRow,
  FinanceRevenueTrendPoint,
  FinanceScenario,
  FinanceScenarioInput,
  FinanceSummary,
  FinanceTaxRecord,
  FinanceTaxTypeTotal,
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

function isMissingRpc(error: unknown, functionName: string) {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === "PGRST202" || value?.code === "42883" || Boolean(value?.message?.includes(functionName));
}

/**
 * The single source of truth for Revenue, Overview, Profit & Loss, and
 * Reports. Every screen that shows a financial total must derive it from
 * this function (or from taxTotalsByType/revenueBySource below, which never
 * compute a competing "total tax" figure) rather than recomputing its own
 * numbers.
 *
 * Formulas (documented per finance requirements — see also FinanceSummary):
 *   Gross Revenue  = sum of recorded revenue transactions, refunds negative
 *                    (signedTransactionAmount). This is the gross amount
 *                    actually charged/received; it is NOT tax-adjusted
 *                    because RoyalLagn's payment records do not decompose a
 *                    tax component out of a transaction's amount.
 *   Gateway Fees   = sum of gateway_fee across non-refund revenue rows,
 *                    using whatever is stored (0 for historical rows where
 *                    the real fee was never captured — see
 *                    gatewayFeeCoverage to know how many rows that affects).
 *   Net Revenue    = Gross Revenue − Gateway Fees. This does NOT subtract
 *                    estimatedTax: the only aggregate tax figure this app
 *                    computes (below) is not decomposed from Gross Revenue,
 *                    so netting it here would double-count or misstate the
 *                    result.
 *   Total Expenses = sum of recorded expense transactions.
 *   Net Profit     = (Net Revenue − Total Expenses) − Estimated Tax
 *                    Provision, where the tax provision comes from
 *                    finance_tax_records rows marked is_estimate. This
 *                    matches the existing Overview/P&L "net profit after
 *                    estimated tax" definition already used elsewhere in
 *                    this feature.
 *   Profit Margin  = (Net Profit / Net Revenue) * 100, or null when Net
 *                    Revenue <= 0 (division-by-zero guard; a margin is not
 *                    meaningful against zero or negative revenue).
 */
export function summarizeFinance(data: Pick<FinanceMonthData, "transactions" | "budget" | "budgetItems" | "taxes">): FinanceSummary {
  const recorded = data.transactions.filter((item) => item.status === "recorded");
  const revenue = recorded.filter((item) => item.direction === "revenue");
  const expenses = recorded.filter((item) => item.direction === "expense");
  const grossRevenue = revenue.reduce((sum, item) => sum + signedTransactionAmount(item), 0);
  const feeEligible = revenue.filter((item) => item.source !== "refund");
  const gatewayFees = feeEligible.reduce((sum, item) => sum + item.gateway_fee, 0);
  const gatewayFeeCoverage = { capturedCount: feeEligible.filter((item) => item.gateway_fee_captured).length, totalCount: feeEligible.length };
  const netRevenue = grossRevenue - gatewayFees;
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const estimatedTax = data.taxes.filter((item) => item.is_estimate).reduce((sum, item) => sum + item.amount, 0);
  const profitBeforeTax = netRevenue - expenseTotal;
  const netProfit = profitBeforeTax - estimatedTax;
  const budget = data.budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const revenueTarget = data.budget?.revenue_target ?? 0;
  return {
    grossRevenue,
    gatewayFees,
    gatewayFeeCoverage,
    netRevenue,
    expenses: expenseTotal,
    profitBeforeTax,
    estimatedTax,
    netProfit,
    profitMargin: netRevenue > 0 ? (netProfit / netRevenue) * 100 : null,
    budget,
    budgetRemaining: budget - expenseTotal,
    revenueTarget,
    revenueTargetGap: netRevenue - revenueTarget,
  };
}

export function signedTransactionAmount(item: Pick<FinanceTransaction, "amount" | "source">) {
  return item.source === "refund" ? -item.amount : item.amount;
}

/**
 * Per-tax_type totals for the Revenue dashboard's informational breakdown —
 * a plain sum within each already-existing tax_type, never a cross-type
 * combination. This is NOT the app's "total tax" figure (that remains
 * summarizeFinance().estimatedTax, reused as-is by Revenue/Overview/P&L);
 * it only mirrors, per category, what the Taxes tab already lists.
 */
export function taxTotalsByType(taxes: FinanceTaxRecord[]): FinanceTaxTypeTotal[] {
  const totals = new Map<FinanceTaxRecord["tax_type"], { amount: number; count: number }>();
  taxes.forEach((record) => {
    const current = totals.get(record.tax_type) ?? { amount: 0, count: 0 };
    current.amount += record.amount;
    current.count += 1;
    totals.set(record.tax_type, current);
  });
  return Array.from(totals.entries()).map(([type, value]) => ({ type, amount: value.amount, recordCount: value.count }));
}

/** Revenue by existing category ("Subscription Revenue", "Add-on Revenue", "Other Revenue" — no invented sources.) */
export function revenueBySource(data: Pick<FinanceMonthData, "transactions" | "categories">): FinanceRevenueSourceRow[] {
  const categories = data.categories.filter((item) => item.direction === "revenue");
  const totals = new Map<string, { amount: number; count: number }>();
  data.transactions.filter((item) => item.direction === "revenue" && item.status === "recorded").forEach((item) => {
    const current = totals.get(item.category_id) ?? { amount: 0, count: 0 };
    current.amount += signedTransactionAmount(item);
    current.count += 1;
    totals.set(item.category_id, current);
  });
  return categories
    .map((category) => ({ categoryId: category.id, name: category.name, amount: totals.get(category.id)?.amount ?? 0, transactionCount: totals.get(category.id)?.count ?? 0 }))
    .filter((row) => row.transactionCount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export const AdminFinanceService = {
  async loadMonth(monthStart: string): Promise<FinanceMonthData> {
    const bounds = monthBounds(monthStart);
    const [categoriesResult, transactions, budgetResult, taxesResult, usageResult, scenariosResult, closureResult] = await Promise.all([
      supabase.from("finance_categories").select("id,name,group_name,direction,is_system,is_active").eq("is_active", true).order("direction").order("group_name").order("name"),
      allRows<Record<string, unknown>>((from, to) => supabase.from("finance_transactions").select("id,occurred_on,direction,category_id,amount,tax_amount,gateway_fee,gateway_fee_captured,source,source_payment_id,payment_method,counterparty,reference_number,is_recurring,status,notes,created_at,finance_categories(name,group_name)").gte("occurred_on", bounds.start).lt("occurred_on", bounds.end).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(from, to)),
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

  /**
   * Real server-side aggregate query (admin_finance_revenue_trend RPC) for
   * the Revenue trend chart — avoids pulling row-level payment data into the
   * client just to sum it (per performance requirements). bucket "day" for
   * short ranges, "month" for ranges spanning many months.
   */
  async loadRevenueTrend(periodStart: string, periodEnd: string, bucket: "day" | "month" = "day"): Promise<FinanceRevenueTrendPoint[]> {
    const { data, error } = await supabase.rpc("admin_finance_revenue_trend", { period_start: periodStart, period_end: periodEnd, bucket });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      bucketStart: String(row.bucket_start),
      gross: Number(row.gross ?? 0),
      gatewayFee: Number(row.gateway_fee ?? 0),
      net: Number(row.net ?? 0),
      transactionCount: Number(row.transaction_count ?? 0),
    }));
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
    if (!error) return;
    if (!isMissingRpc(error, "admin_save_finance_budget")) throw error;

    // Compatibility path for databases that have the Finance tables but have
    // not received the atomic budget RPC migration yet.
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { data: existingBudget, error: lookupError } = await supabase
      .from("finance_budgets")
      .select("id")
      .eq("month_start", monthStart)
      .maybeSingle();
    if (lookupError) throw lookupError;
    const budgetRequest = existingBudget
      ? supabase.from("finance_budgets").update({ revenue_target: revenueTarget, updated_by: userId }).eq("id", existingBudget.id)
      : supabase.from("finance_budgets").insert({ month_start: monthStart, name: `${monthStart.slice(0, 7)} operating budget`, revenue_target: revenueTarget, status: "open", updated_by: userId, created_by: userId });
    const { data: budget, error: budgetError } = await budgetRequest
      .select("id")
      .single();
    if (budgetError) throw budgetError;

    const { data: existing, error: existingError } = await supabase
      .from("finance_budget_items")
      .select("id,category_id")
      .eq("budget_id", budget.id);
    if (existingError) throw existingError;

    if (items.length) {
      const { error: itemsError } = await supabase.from("finance_budget_items").upsert(
        items.map((item) => ({ budget_id: budget.id, category_id: item.category_id, amount: item.amount })),
        { onConflict: "budget_id,category_id" },
      );
      if (itemsError) throw itemsError;
    }

    const retainedCategoryIds = new Set(items.map((item) => item.category_id));
    const obsoleteIds = (existing ?? []).filter((item) => !retainedCategoryIds.has(item.category_id)).map((item) => item.id);
    if (obsoleteIds.length) {
      const { error: deleteError } = await supabase.from("finance_budget_items").delete().in("id", obsoleteIds);
      if (deleteError) throw deleteError;
    }
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
