import { Platform, Share } from "react-native";
import { supabase } from "@/services/supabase";
import type {
  FinanceBudget,
  FinanceBudgetItem,
  FinanceCategory,
  FinanceCloudinaryUsage,
  FinanceDirection,
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
  FinanceYearTaxData,
  ForecastTaxEstimate,
  MonthlyTaxEstimateRow,
  PartnershipTaxResult,
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

/** Rounds to whole paise (2 decimals) to keep repeated percentage math from drifting on floating point. */
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Indian financial year (April 1 - March 31) helpers. RoyalLagn's tax
 * provision is computed per financial year, never per calendar month — see
 * computePartnershipTax below.
 */
export function financialYearStartFor(date: Date | string) {
  const value = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : date;
  const year = value.getUTCFullYear();
  const isBeforeApril = value.getUTCMonth() < 3; // 0-indexed: Jan=0 .. Mar=2
  const startYear = isBeforeApril ? year - 1 : year;
  return `${startYear}-04-01`;
}

export function financialYearBounds(financialYearStart: string) {
  if (!/^\d{4}-04-01$/.test(financialYearStart)) throw new Error("Choose a valid financial year.");
  const startYear = Number(financialYearStart.slice(0, 4));
  return { start: financialYearStart, end: `${startYear + 1}-04-01`, endInclusive: `${startYear + 1}-03-31` };
}

export function financialYearLabel(financialYearStart: string) {
  const startYear = Number(financialYearStart.slice(0, 4));
  return `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Selectable financial years for the Tax Provision dashboard: a few completed years through one year ahead for planning. */
export function financialYearOptions(referenceDate: Date = new Date()) {
  const current = Number(financialYearStartFor(referenceDate).slice(0, 4));
  return Array.from({ length: 6 }, (_, index) => `${current + 1 - (5 - index)}-04-01`);
}

const PARTNERSHIP_INCOME_TAX_RATE = 0.3;
const PARTNERSHIP_SURCHARGE_THRESHOLD = 10_000_000; // ₹1 crore
const PARTNERSHIP_SURCHARGE_RATE = 0.12;
const PARTNERSHIP_CESS_RATE = 0.04;

/**
 * Single source of truth for the partnership-firm yearly tax provision.
 * Every screen showing this figure (currently only the Taxes tab's Tax
 * Provision dashboard) must call this function rather than recomputing it.
 *
 * This is an ESTIMATED TAX PROVISION for planning only, not a filing
 * calculation — rates below reflect the long-standing partnership-firm
 * rules (flat 30% income tax; 12% surcharge above ₹1 crore taxable income,
 * capped by marginal relief; 4% Health & Education Cess on tax + surcharge)
 * and must be reconfirmed against the official rules for the selected
 * financial year by the firm's CA before being relied on.
 *
 * Marginal relief: above ₹1 crore, the increase in (income tax + surcharge)
 * over the flat tax on exactly ₹1 crore cannot exceed the amount of income
 * that exceeds ₹1 crore. When the normal 12% surcharge would breach that
 * cap, surcharge is reduced by the excess (never below ₹0) so total
 * tax + surcharge lands exactly on the cap.
 */
export function computePartnershipTax(taxableIncome: number): PartnershipTaxResult {
  const income = Number.isFinite(taxableIncome) ? Math.max(taxableIncome, 0) : 0;
  const incomeTax = roundMoney(income * PARTNERSHIP_INCOME_TAX_RATE);

  let surchargeRate = 0;
  let surcharge = 0;
  let marginalRelief = 0;
  if (income > PARTNERSHIP_SURCHARGE_THRESHOLD) {
    surchargeRate = PARTNERSHIP_SURCHARGE_RATE;
    const normalSurcharge = roundMoney(incomeTax * surchargeRate);
    const taxAtThreshold = roundMoney(PARTNERSHIP_SURCHARGE_THRESHOLD * PARTNERSHIP_INCOME_TAX_RATE);
    const excessOverThreshold = income - PARTNERSHIP_SURCHARGE_THRESHOLD;
    const marginalReliefCap = taxAtThreshold + excessOverThreshold;
    const normalTotal = incomeTax + normalSurcharge;
    if (normalTotal > marginalReliefCap) {
      marginalRelief = roundMoney(normalTotal - marginalReliefCap);
      surcharge = Math.max(roundMoney(normalSurcharge - marginalRelief), 0);
    } else {
      surcharge = normalSurcharge;
    }
  }

  const cess = roundMoney((incomeTax + surcharge) * PARTNERSHIP_CESS_RATE);
  const estimatedTotalTax = roundMoney(incomeTax + surcharge + cess);
  const estimatedProfitAfterTax = roundMoney(income - estimatedTotalTax);

  return {
    taxableIncome: income,
    incomeTaxRate: PARTNERSHIP_INCOME_TAX_RATE,
    incomeTax,
    surchargeRate,
    surcharge,
    marginalRelief,
    cessRate: PARTNERSHIP_CESS_RATE,
    cess,
    estimatedTotalTax,
    estimatedProfitAfterTax,
  };
}

/**
 * Forecast's tax estimate — display/prediction only, NEVER persisted and
 * NEVER written to any actual Finance table. Reuses computePartnershipTax
 * (the exact same engine Yearly Tax uses — same 30% income tax, same 12%
 * surcharge above ₹1 crore with marginal relief, same 4% cess) so Forecast
 * can never drift into a second, conflicting tax formula. The only
 * difference from Yearly Tax is the input: scenario assumptions
 * (Expected Annual Revenue − Estimated Annual Expenses) instead of actual
 * Finance data, and no Tax Adjustment concept (Forecast has none).
 *
 * Tax is never calculated on a loss: when profitBeforeTax <= 0, every tax
 * figure is ₹0 and profitAfterTax is simply the loss/zero profit itself —
 * NOT computePartnershipTax's own zero-clamped result, which would hide a
 * real projected loss behind a ₹0 "profit after tax".
 */
export function computeForecastTaxEstimate(annualRevenue: number, annualExpenses: number): ForecastTaxEstimate {
  const revenue = Number.isFinite(annualRevenue) ? annualRevenue : 0;
  const expenses = Number.isFinite(annualExpenses) ? annualExpenses : 0;
  const profitBeforeTax = roundMoney(revenue - expenses);

  if (profitBeforeTax <= 0) {
    return {
      annualRevenue: revenue,
      annualExpenses: expenses,
      profitBeforeTax,
      incomeTaxRate: PARTNERSHIP_INCOME_TAX_RATE,
      incomeTax: 0,
      surchargeRate: 0,
      surcharge: 0,
      marginalRelief: 0,
      cessRate: PARTNERSHIP_CESS_RATE,
      cess: 0,
      totalEstimatedTax: 0,
      profitAfterTax: profitBeforeTax,
      effectiveTaxRate: null,
    };
  }

  const tax = computePartnershipTax(profitBeforeTax);
  const profitAfterTax = roundMoney(profitBeforeTax - tax.estimatedTotalTax);
  return {
    annualRevenue: revenue,
    annualExpenses: expenses,
    profitBeforeTax,
    incomeTaxRate: tax.incomeTaxRate,
    incomeTax: tax.incomeTax,
    surchargeRate: tax.surchargeRate,
    surcharge: tax.surcharge,
    marginalRelief: tax.marginalRelief,
    cessRate: tax.cessRate,
    cess: tax.cess,
    totalEstimatedTax: tax.estimatedTotalTax,
    profitAfterTax,
    effectiveTaxRate: (tax.estimatedTotalTax / profitBeforeTax) * 100,
  };
}

/** The 12 month-start dates (April - March) of a financial year, in order. */
export function financialYearMonths(financialYearStart: string) {
  const startYear = Number(financialYearStart.slice(0, 4));
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = 3 + index; // April = month index 3 (0-based)
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}-01`;
  });
}

/**
 * Monthly Tax Estimate — a management/provisioning estimate only, kept
 * deliberately separate from computePartnershipTax. It reuses the same
 * income-tax and cess RATES (30% / 4%) for consistency, but never applies a
 * surcharge: the ₹1 crore surcharge threshold is an annual concept and must
 * not be allocated to, or triggered by, a single month's profit. The Yearly
 * Tax model (computePartnershipTax) remains the sole authoritative annual
 * calculation; this function's output must never be summed and presented as
 * a final tax figure.
 */
export function computeMonthlyTaxEstimate(profit: number) {
  const monthlyProfit = Number.isFinite(profit) ? Math.max(profit, 0) : 0;
  const incomeTax = roundMoney(monthlyProfit * PARTNERSHIP_INCOME_TAX_RATE);
  const cess = roundMoney(incomeTax * PARTNERSHIP_CESS_RATE);
  const estimatedTax = roundMoney(incomeTax + cess);
  return { incomeTax, cess, estimatedTax };
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
 * The single source of truth for Revenue, Overview, and Reports. Every
 * screen that shows a financial total must derive it from
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

  /**
   * Resolves a custom "Other / Custom" expense/revenue category typed by the
   * admin to a real finance_categories.id — reusing the existing category
   * table exactly as designed (its `name` column is free text; only
   * `finance_categories_name_valid` bounds it to 2-80 trimmed characters,
   * and `finance_categories_direction_name_idx` already enforces one row
   * per direction+name). No new table or migration. Categories created this
   * way get `is_system: false`, which is how the UI later recognizes a
   * transaction's category as "custom" (to reopen it as Other / Custom
   * instead of listing it as a fixed chip) versus one of the original
   * seeded categories (`is_system: true`).
   *
   * Case-insensitive find-or-create: typing the same name twice (e.g.
   * "Travel" on two different expenses) reuses one category row, so it
   * naturally groups/reports as a single category everywhere the app
   * already groups by category_id/name — no reporting changes needed.
   */
  async getOrCreateCategory(direction: FinanceDirection, name: string): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter a category name.");
    const { data: existing, error: lookupError } = await supabase
      .from("finance_categories")
      .select("id")
      .eq("direction", direction)
      .ilike("name", trimmed)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing.id;

    // finance_categories has no created_by/updated_by columns (unlike most
    // other finance_* tables) — nothing to attribute here.
    const { data: created, error: insertError } = await supabase
      .from("finance_categories")
      .insert({ name: trimmed, group_name: "Custom", direction, is_system: false, is_active: true })
      .select("id")
      .single();
    if (insertError) {
      // Race: another save created the same category between our lookup and insert — reuse it instead of failing.
      if ((insertError as { code?: string }).code === "23505") {
        const { data: retry, error: retryError } = await supabase
          .from("finance_categories").select("id").eq("direction", direction).ilike("name", trimmed).maybeSingle();
        if (retryError) throw retryError;
        if (retry) return retry.id;
      }
      throw insertError;
    }
    return created.id;
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

  /**
   * Loads everything the yearly Tax Provision dashboard needs for one
   * financial year: Annual Revenue / Annual Business Expenses from the
   * admin_finance_year_summary RPC (same formulas as the monthly summary,
   * never re-typed by hand), the optional CA Tax Adjustment, and Tax Paid
   * (reused from existing income_tax_paid finance_tax_records rows).
   */
  async loadYearTaxProvision(financialYearStart: string): Promise<FinanceYearTaxData> {
    const [summaryResult, adjustmentResult] = await Promise.all([
      supabase.rpc("admin_finance_year_summary", { target_year_start: financialYearStart }),
      supabase.from("finance_annual_tax_adjustments").select("financial_year_start,adjustment,tax_paid,notes").eq("financial_year_start", financialYearStart).maybeSingle(),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (adjustmentResult.error) throw adjustmentResult.error;
    const summary = (summaryResult.data ?? {}) as Record<string, unknown>;
    return {
      financialYearStart: String(summary.financial_year_start ?? financialYearStart),
      financialYearEnd: String(summary.financial_year_end ?? ""),
      annualRevenue: Number(summary.revenue ?? 0),
      annualExpenses: Number(summary.expenses ?? 0),
      taxAdjustment: Number(adjustmentResult.data?.adjustment ?? 0),
      taxAdjustmentNotes: (adjustmentResult.data?.notes as string | null) ?? null,
      taxPaid: Number(adjustmentResult.data?.tax_paid ?? 0),
    };
  },

  async saveTaxAdjustment(financialYearStart: string, adjustment: number, notes?: string) {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("finance_annual_tax_adjustments").upsert(
      { financial_year_start: financialYearStart, adjustment, notes: notes?.trim() || null, updated_by: userId, created_by: userId },
      { onConflict: "financial_year_start" },
    );
    if (error) throw error;
  },

  /**
   * Monthly Tax Estimate rows for the 12 months of a financial year
   * (April - March). Sources Revenue/Expenses from admin_finance_month_summary
   * — the exact same RPC and formulas already used for monthly Finance
   * closing — so this view can never drift from what the monthly Finance
   * screens already show. No monthly tax record is read or written; the
   * estimate is computed purely client-side from Revenue/Expenses via
   * computeMonthlyTaxEstimate.
   */
  async loadMonthlyTaxEstimates(financialYearStart: string): Promise<MonthlyTaxEstimateRow[]> {
    const months = financialYearMonths(financialYearStart);
    const results = await Promise.all(months.map((monthStart) => supabase.rpc("admin_finance_month_summary", { target_month: monthStart })));
    return results.map((result, index) => {
      if (result.error) throw result.error;
      const summary = (result.data ?? {}) as Record<string, unknown>;
      const monthStart = months[index];
      const revenue = Number(summary.revenue ?? 0);
      const expenses = Number(summary.expenses ?? 0);
      const profit = revenue - expenses;
      const { incomeTax, cess, estimatedTax } = computeMonthlyTaxEstimate(profit);
      const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
      return { monthStart, monthLabel, revenue, expenses, profit, incomeTax, cess, estimatedTax };
    });
  },

  /** Persists the actual tax paid for a financial year, kept separate from the computed Total Tax Payable — never overwrites the estimate. */
  async saveTaxPaid(financialYearStart: string, taxPaid: number) {
    if (!Number.isFinite(taxPaid) || taxPaid < 0) throw new Error("Enter a tax paid amount of zero or greater.");
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("finance_annual_tax_adjustments").upsert(
      { financial_year_start: financialYearStart, tax_paid: taxPaid, updated_by: userId, created_by: userId },
      { onConflict: "financial_year_start", ignoreDuplicates: false },
    );
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
