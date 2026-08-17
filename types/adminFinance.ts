export type FinanceDirection = "revenue" | "expense";
export type FinanceTab = "overview" | "revenue" | "expenses" | "budgets" | "profit-loss" | "taxes" | "forecast" | "reports";

export type FinanceCategory = {
  id: string;
  name: string;
  group_name: string;
  direction: FinanceDirection;
  is_system: boolean;
  is_active: boolean;
};

export type FinanceTransaction = {
  id: string;
  occurred_on: string;
  direction: FinanceDirection;
  category_id: string;
  amount: number;
  tax_amount: number;
  gateway_fee: number;
  /** True when gateway_fee reflects a real captured Razorpay fee (post-2026-08-17 verified payments). False means the value is a historical 0 placeholder, not a real fee. */
  gateway_fee_captured: boolean;
  source: "manual" | "subscription_payment" | "refund" | "adjustment";
  source_payment_id: string | null;
  payment_method: string | null;
  counterparty: string | null;
  reference_number: string | null;
  is_recurring: boolean;
  status: "recorded" | "void";
  notes: string | null;
  created_at: string;
  finance_categories?: Pick<FinanceCategory, "name" | "group_name"> | null;
};

export type FinanceBudget = {
  id: string;
  month_start: string;
  name: string;
  revenue_target: number;
  status: "open" | "closed";
  notes: string | null;
};

export type FinanceBudgetItem = {
  id: string;
  budget_id: string;
  category_id: string;
  amount: number;
};

export type FinanceTaxRecord = {
  id: string;
  period_start: string;
  period_end: string;
  tax_type: "gst_collected" | "gst_input_credit" | "gst_paid" | "income_tax_provision" | "income_tax_paid" | "other_provision";
  amount: number;
  is_estimate: boolean;
  notes: string | null;
};

export type FinanceCloudinaryUsage = {
  id: string;
  month_start: string;
  storage_percent: number | null;
  bandwidth_percent: number | null;
  transformations_percent: number | null;
  estimated_cost: number;
  actual_cost: number;
  notes: string | null;
};

export type FinanceScenario = {
  id: string;
  name: string;
  total_vendors: number;
  free_percent: number;
  premium_percent: number;
  elite_percent: number;
  premium_price: number;
  elite_price: number;
  monthly_fixed_expenses: number;
};

export type FinanceClosure = {
  id: string;
  month_start: string;
  status: "closed" | "reopened";
  checklist: Record<string, boolean>;
  snapshot: Record<string, number | boolean | string>;
  closed_at: string | null;
  correction_reason: string | null;
};

export type FinanceMonthData = {
  monthStart: string;
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  budget: FinanceBudget | null;
  budgetItems: FinanceBudgetItem[];
  taxes: FinanceTaxRecord[];
  cloudinaryUsage: FinanceCloudinaryUsage | null;
  scenarios: FinanceScenario[];
  closure: FinanceClosure | null;
};

export type FinanceSummary = {
  grossRevenue: number;
  gatewayFees: number;
  /** How many revenue transactions actually have a captured Razorpay fee vs. how many are counted (source != refund). */
  gatewayFeeCoverage: { capturedCount: number; totalCount: number };
  netRevenue: number;
  expenses: number;
  profitBeforeTax: number;
  estimatedTax: number;
  netProfit: number;
  /** (netProfit / netRevenue) * 100. Null when netRevenue <= 0 (division guard; margin is not meaningful). */
  profitMargin: number | null;
  budget: number;
  budgetRemaining: number;
  revenueTarget: number;
  revenueTargetGap: number;
};

/**
 * A plain sum of finance_tax_records within ONE existing tax_type — never a
 * cross-type combination or invented formula. The app's one and only
 * aggregate "total tax" figure remains FinanceSummary.estimatedTax (the same
 * "Estimated tax provision" already shown on Overview and Profit & Loss);
 * this type is for the per-category informational breakdown only.
 */
export type FinanceTaxTypeTotal = {
  type: FinanceTaxRecord["tax_type"];
  amount: number;
  recordCount: number;
};

export type FinanceRevenueSourceRow = {
  categoryId: string;
  name: string;
  amount: number;
  transactionCount: number;
};

export type FinanceRevenueTrendPoint = {
  bucketStart: string;
  gross: number;
  gatewayFee: number;
  net: number;
  transactionCount: number;
};

export type FinanceTransactionInput = {
  id?: string;
  occurred_on: string;
  direction: FinanceDirection;
  category_id: string;
  amount: number;
  tax_amount?: number;
  gateway_fee?: number;
  payment_method?: string | null;
  counterparty?: string | null;
  reference_number?: string | null;
  is_recurring?: boolean;
  notes?: string | null;
};

export type FinanceScenarioInput = Omit<FinanceScenario, "id"> & { id?: string };
