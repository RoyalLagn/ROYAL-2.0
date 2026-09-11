export type ClipFinanceScenario = {
  id: string;
  name: string;
  total_vendors: number;
  free_percent: number;
  premium_percent: number;
  elite_percent: number;
  monthly_clip_viewers: number;
  monthly_operating_expenses: number;
  income_tax_percent: number;
  bandwidth_network: "volume" | "asia";
  on_season_months: number;
  off_season_percent: number;
};

export type ClipPlanPolicy = {
  slug: string;
  name: string;
  price: number;
  max_image_upload_mb: number;
  stored_image_target_mb: number;
  max_clip_upload_mb: number | null;
  stored_clip_target_mb: number | null;
  clip_delivery_target_mb: number | null;
};

export type ClipFinanceScenarioInput = Omit<ClipFinanceScenario, "id"> & { id?: string };

export type ClipFinanceMonthlyInputs = {
  totalVendors: number;
  monthlyClipViewers: number;
  freePercent: number;
  premiumPercent: number;
  elitePercent: number;
  monthlyOperatingExpenses: number;
  incomeTaxPercent: number;
  bandwidthNetwork: "volume" | "asia";
  onSeasonMonths: number;
  offSeasonPercent: number;
};

export type ClipFinanceMonthlyResults = {
  grossRevenue: number;
  storageCost: number;
  streamingCost: number;
  directOperationalCost: number;
  grossProfit: number;
  operatingExpenses: number;
  profitBeforeTax: number;
  incomeTax: number;
  netRevenue: number;
};

export type ClipFinanceMonthlySnapshot = {
  month_start: string;
  inputs: ClipFinanceMonthlyInputs;
  results: ClipFinanceMonthlyResults;
  updated_at: string;
};

export type ClipFinanceMonthlySnapshotInput = Omit<ClipFinanceMonthlySnapshot, "updated_at">;
