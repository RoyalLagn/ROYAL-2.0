import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { CirclePlus, Save, Trash2 } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, computeForecastTaxEstimate } from "@/services/adminFinanceService";
import type { FinanceMonthData, FinanceScenario, FinanceScenarioInput, ForecastTaxEstimate } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

type Draft = Record<keyof Omit<FinanceScenarioInput, "id">, string> & { id?: string };

const blank: Draft = { name: "", total_vendors: "", free_percent: "", premium_percent: "", elite_percent: "", premium_price: "", elite_price: "", monthly_fixed_expenses: "" };

const fieldPlaceholders: Record<keyof Omit<FinanceScenarioInput, "id" | "name">, string> = {
  total_vendors: "e.g. 1000",
  free_percent: "e.g. 50",
  premium_percent: "e.g. 30",
  elite_percent: "e.g. 20",
  premium_price: "e.g. 499",
  elite_price: "e.g. 999",
  monthly_fixed_expenses: "e.g. 15000",
};

export function FinanceForecast({ data, onChanged }: { data: FinanceMonthData; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calculated = useMemo(() => calculate(draft), [draft]);
  const edit = (item: FinanceScenario) => setDraft({ id: item.id, name: item.name, total_vendors: String(item.total_vendors), free_percent: String(item.free_percent), premium_percent: String(item.premium_percent), elite_percent: String(item.elite_percent), premium_price: String(item.premium_price), elite_price: String(item.elite_price), monthly_fixed_expenses: String(item.monthly_fixed_expenses) });
  const save = async () => {
    if (!draft.name.trim()) return setError("Name this planning scenario.");
    if (!calculated.valid) return setError(calculated.error);
    setSaving(true); setError(null);
    try { await AdminFinanceService.saveScenario({ id: draft.id, name: draft.name, total_vendors: Number(draft.total_vendors), free_percent: Number(draft.free_percent), premium_percent: Number(draft.premium_percent), elite_percent: Number(draft.elite_percent), premium_price: Number(draft.premium_price), elite_price: Number(draft.elite_price), monthly_fixed_expenses: Number(draft.monthly_fixed_expenses) }); setDraft(blank); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the scenario."); }
    finally { setSaving(false); }
  };
  const remove = (item: FinanceScenario) => Alert.alert("Delete scenario?", `${item.name} will be removed from finance planning.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void AdminFinanceService.deleteScenario(item.id).then(onChanged).catch((cause) => Alert.alert("Unable to delete scenario", cause instanceof Error ? cause.message : "Please try again.")) }]);

  return <View style={styles.stack}>
    <FinanceNotice tone="info">Forecasts are planning assumptions. They never alter actual revenue, expenses, or profit reports.</FinanceNotice>
    <FinanceSection title={draft.id ? "Edit scenario" : "Scenario planning"} description="Model a future mix of free, Premium, and Elite vendors without treating it as earned revenue.">
      {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}
      <FinanceField label="Scenario name" value={draft.name} onChangeText={(value) => setDraft((current) => ({ ...current, name: value }))} placeholder="Growth plan A" />
      <View style={styles.grid}><ScenarioField label="Total vendors" field="total_vendors" draft={draft} setDraft={setDraft} /><ScenarioField label="Free %" field="free_percent" draft={draft} setDraft={setDraft} /><ScenarioField label="Premium %" field="premium_percent" draft={draft} setDraft={setDraft} /><ScenarioField label="Elite %" field="elite_percent" draft={draft} setDraft={setDraft} /></View>
      <View style={styles.grid}><ScenarioField label="Premium monthly price" field="premium_price" draft={draft} setDraft={setDraft} /><ScenarioField label="Elite monthly price" field="elite_price" draft={draft} setDraft={setDraft} /><ScenarioField label="Monthly fixed expenses" field="monthly_fixed_expenses" draft={draft} setDraft={setDraft} /></View>
      <View style={styles.results}><Result label="Expected monthly revenue" value={formatMoney(calculated.monthlyRevenue)} /><Result label="Expected annual revenue" value={formatMoney(calculated.annualRevenue)} /><Result label="Paying vendors to break even" value={calculated.breakEven == null ? "—" : String(calculated.breakEven)} /></View>
      <View style={styles.actions}><FinanceButton label={saving ? "Saving…" : "Save scenario"} icon={Save} onPress={() => void save()} disabled={saving} />{draft.id ? <FinanceButton label="New scenario" icon={CirclePlus} variant="secondary" onPress={() => { setDraft(blank); setError(null); }} /> : null}</View>
    </FinanceSection>
    {calculated.valid ? <ForecastTaxSection annualRevenue={calculated.annualRevenue} annualExpenses={calculated.annualExpenses} tax={calculated.tax} /> : null}
    <FinanceSection title="Saved scenarios" description="Compare assumptions without mixing them into actual financial reporting.">
      {!data.scenarios.length ? <Text style={styles.empty}>No saved scenarios yet.</Text> : <View>{data.scenarios.map((item, index) => { const result = calculate({ ...blank, ...Object.fromEntries(Object.entries(item).map(([key, value]) => [key, String(value)])), id: item.id } as Draft); return <View key={item.id} style={[styles.scenario, index > 0 && styles.rowBorder]}><View style={styles.flex}><Text style={styles.scenarioTitle}>{item.name}</Text><Text style={styles.scenarioMeta}>{item.total_vendors.toLocaleString("en-IN")} vendors · {item.premium_percent}% Premium · {item.elite_percent}% Elite</Text></View><View style={styles.right}><Text style={styles.scenarioRevenue}>{formatMoney(result.monthlyRevenue)}</Text><Text style={styles.scenarioMeta}>expected monthly</Text></View><FinanceButton label="Edit" variant="secondary" onPress={() => edit(item)} /><FinanceButton label="Delete" icon={Trash2} variant="danger" onPress={() => remove(item)} /></View>; })}</View>}
    </FinanceSection>
  </View>;
}

/**
 * Estimated financial result + estimated tax, purely display/prediction —
 * derived live from the scenario draft above via computeForecastTaxEstimate.
 * Never persisted, never touches actual Finance data.
 */
function ForecastTaxSection({ annualRevenue, annualExpenses, tax }: { annualRevenue: number; annualExpenses: number; tax: ForecastTaxEstimate }) {
  return <FinanceSection title="Estimated financial result" description="A prediction based on the scenario above — not a record of actual revenue, expenses, or tax.">
    <View style={styles.results}>
      <Result label="Expected annual revenue" value={formatMoney(annualRevenue)} />
      <Result label="Estimated annual expenses" value={formatMoney(annualExpenses)} />
      <Result label="Estimated profit before tax" value={formatMoney(tax.profitBeforeTax)} />
    </View>

    <View style={styles.taxCards}>
      <ForecastTaxCard title="Income tax" rate={`${(tax.incomeTaxRate * 100).toFixed(0)}%`} amount={tax.incomeTax} />
      <ForecastTaxCard title="Surcharge" rate={tax.surchargeRate > 0 ? "12%" : "0%"} amount={tax.surcharge} hint={tax.surchargeRate === 0 ? "Applicable above ₹1 crore estimated profit" : tax.marginalRelief > 0 ? `Marginal relief applied: ${formatMoney(tax.marginalRelief)}` : undefined} />
      <ForecastTaxCard title="Cess" rate={`${(tax.cessRate * 100).toFixed(0)}%`} amount={tax.cess} />
    </View>

    <View style={styles.forecastSummary}>
      <View style={styles.heroRow}><Text style={styles.heroLabel}>Total estimated tax</Text><Text style={styles.heroValue}>{formatMoney(tax.totalEstimatedTax)}</Text></View>
      <View style={styles.divider} />
      <View style={styles.heroRow}><Text style={styles.heroLabel}>Estimated profit after tax</Text><Text style={[styles.heroValue, { color: tax.profitAfterTax >= 0 ? adminPalette.success : adminPalette.error }]}>{formatMoney(tax.profitAfterTax)}</Text></View>
      <View style={styles.finalLine}><Text style={styles.finalLineLabel}>Effective estimated tax rate</Text><Text style={styles.finalLineValue}>{tax.effectiveTaxRate == null ? "—" : `${tax.effectiveTaxRate.toFixed(2)}%`}</Text></View>
    </View>

    <FinanceNotice tone="warning">This is a prediction only — it never alters actual revenue, expenses, tax records, or reports. Confirm applicable rates and surcharge rules with your CA before relying on it.</FinanceNotice>
  </FinanceSection>;
}

function ForecastTaxCard({ title, rate, amount, hint }: { title: string; rate: string; amount: number; hint?: string }) {
  return <View style={styles.taxCard}>
    <View style={styles.taxCardHeader}><Text style={styles.taxCardTitle}>{title}</Text><View style={styles.rateBadge}><Text style={styles.rateBadgeText}>{rate}</Text></View></View>
    <Text style={styles.taxCardAmount}>{formatMoney(amount)}</Text>
    {hint ? <Text style={styles.taxCardHint}>{hint}</Text> : null}
  </View>;
}

function ScenarioField({ label, field, draft, setDraft }: { label: string; field: keyof Omit<FinanceScenarioInput, "id" | "name">; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) { return <FinanceField label={label} value={draft[field]} onChangeText={(value) => setDraft((current) => ({ ...current, [field]: value }))} keyboardType="decimal-pad" placeholder={fieldPlaceholders[field]} />; }
function Result({ label, value }: { label: string; value: string }) { return <View style={styles.result}><Text style={styles.resultLabel}>{label}</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.resultValue}>{value}</Text></View>; }
function calculate(draft: Draft) {
  const total = Number(draft.total_vendors), free = Number(draft.free_percent), premium = Number(draft.premium_percent), elite = Number(draft.elite_percent), premiumPrice = Number(draft.premium_price), elitePrice = Number(draft.elite_price), expenses = Number(draft.monthly_fixed_expenses);
  const values = [total, free, premium, elite, premiumPrice, elitePrice, expenses];
  const invalid = (error: string) => ({ valid: false as const, error, monthlyRevenue: 0, annualRevenue: 0, annualExpenses: 0, breakEven: null as number | null, tax: computeForecastTaxEstimate(0, 0) });
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) return invalid("All planning values must be zero or greater.");
  if (Math.abs(free + premium + elite - 100) > 0.001) return invalid("Free, Premium, and Elite percentages must total exactly 100%.");
  const monthlyRevenue = total * (premium / 100) * premiumPrice + total * (elite / 100) * elitePrice;
  const payingShare = (premium + elite) / 100;
  const averagePayingRevenue = payingShare > 0 ? ((premium / 100) * premiumPrice + (elite / 100) * elitePrice) / payingShare : 0;
  const annualRevenue = monthlyRevenue * 12;
  const annualExpenses = expenses * 12;
  // Forecast tax estimate: display/prediction only, computed by the SAME
  // engine as Yearly Tax (computeForecastTaxEstimate -> computePartnershipTax).
  // No Tax Adjustment concept here — taxable profit is simply Expected Annual
  // Revenue minus Estimated Annual Expenses, per the scenario-planning model.
  const tax = computeForecastTaxEstimate(annualRevenue, annualExpenses);
  return { valid: true as const, error: "", monthlyRevenue, annualRevenue, annualExpenses, breakEven: averagePayingRevenue > 0 ? Math.ceil(expenses / averagePayingRevenue) : null, tax };
}

const styles = StyleSheet.create({
  stack: { gap: 14 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, results: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 2 }, result: { flex: 1, minWidth: 180, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, padding: 14 }, resultLabel: { ...typeStyles.caption, color: adminPalette.textSecondary }, resultValue: { ...typeStyles.cardTitle, color: adminPalette.text, marginTop: 5 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, empty: { ...typeStyles.metadata, color: adminPalette.textSecondary, textAlign: "center", padding: 28 }, scenario: { minHeight: 76, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9, paddingVertical: 10 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, flex: { flex: 1, minWidth: 180 }, right: { minWidth: 140, alignItems: "flex-end" }, scenarioTitle: { ...typeStyles.label, color: adminPalette.text }, scenarioMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, scenarioRevenue: { ...typeStyles.cardTitle, color: adminPalette.success },
  taxCards: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  taxCard: { flex: 1, minWidth: 200, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, gap: 6 },
  taxCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  taxCardTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  rateBadge: { backgroundColor: adminPalette.brandSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rateBadgeText: { ...typeStyles.caption, color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily },
  taxCardAmount: { ...typeStyles.metric, color: adminPalette.text, marginTop: 4, letterSpacing: -0.3 },
  taxCardHint: { ...typeStyles.caption, color: adminPalette.textMuted },
  forecastSummary: { backgroundColor: adminPalette.brandSubtle, borderRadius: 20, borderWidth: 1, borderColor: "#FBCFE8", padding: 20, gap: 8 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { ...typeStyles.cardTitle, color: adminPalette.text },
  heroValue: { ...typeStyles.metric, color: adminPalette.text, letterSpacing: -0.3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#F3B8D6", marginVertical: 2 },
  finalLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
  finalLineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary },
  finalLineValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"], fontFamily: typeStyles.cardTitle.fontFamily },
});
