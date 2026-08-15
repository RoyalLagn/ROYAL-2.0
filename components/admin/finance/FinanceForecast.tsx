import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { CirclePlus, Save, Trash2 } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService } from "@/services/adminFinanceService";
import type { FinanceMonthData, FinanceScenario, FinanceScenarioInput } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

type Draft = Record<keyof Omit<FinanceScenarioInput, "id">, string> & { id?: string };

const blank: Draft = { name: "", total_vendors: "1000", free_percent: "50", premium_percent: "30", elite_percent: "20", premium_price: "499", elite_price: "999", monthly_fixed_expenses: "0" };

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
      <View style={styles.results}><Result label="Expected monthly revenue" value={formatMoney(calculated.monthlyRevenue)} /><Result label="Expected annual revenue" value={formatMoney(calculated.monthlyRevenue * 12)} /><Result label="Paying vendors to break even" value={calculated.breakEven == null ? "—" : String(calculated.breakEven)} /></View>
      <View style={styles.actions}><FinanceButton label={saving ? "Saving…" : "Save scenario"} icon={Save} onPress={() => void save()} disabled={saving} />{draft.id ? <FinanceButton label="New scenario" icon={CirclePlus} variant="secondary" onPress={() => { setDraft(blank); setError(null); }} /> : null}</View>
    </FinanceSection>
    <FinanceSection title="Saved scenarios" description="Compare assumptions without mixing them into actual financial reporting.">
      {!data.scenarios.length ? <Text style={styles.empty}>No saved scenarios yet.</Text> : <View>{data.scenarios.map((item, index) => { const result = calculate({ ...blank, ...Object.fromEntries(Object.entries(item).map(([key, value]) => [key, String(value)])), id: item.id } as Draft); return <View key={item.id} style={[styles.scenario, index > 0 && styles.rowBorder]}><View style={styles.flex}><Text style={styles.scenarioTitle}>{item.name}</Text><Text style={styles.scenarioMeta}>{item.total_vendors.toLocaleString("en-IN")} vendors · {item.premium_percent}% Premium · {item.elite_percent}% Elite</Text></View><View style={styles.right}><Text style={styles.scenarioRevenue}>{formatMoney(result.monthlyRevenue)}</Text><Text style={styles.scenarioMeta}>expected monthly</Text></View><FinanceButton label="Edit" variant="secondary" onPress={() => edit(item)} /><FinanceButton label="Delete" icon={Trash2} variant="danger" onPress={() => remove(item)} /></View>; })}</View>}
    </FinanceSection>
  </View>;
}

function ScenarioField({ label, field, draft, setDraft }: { label: string; field: keyof Omit<FinanceScenarioInput, "id" | "name">; draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) { return <FinanceField label={label} value={draft[field]} onChangeText={(value) => setDraft((current) => ({ ...current, [field]: value }))} keyboardType="decimal-pad" placeholder="0" />; }
function Result({ label, value }: { label: string; value: string }) { return <View style={styles.result}><Text style={styles.resultLabel}>{label}</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.resultValue}>{value}</Text></View>; }
function calculate(draft: Draft) {
  const total = Number(draft.total_vendors), free = Number(draft.free_percent), premium = Number(draft.premium_percent), elite = Number(draft.elite_percent), premiumPrice = Number(draft.premium_price), elitePrice = Number(draft.elite_price), expenses = Number(draft.monthly_fixed_expenses);
  const values = [total, free, premium, elite, premiumPrice, elitePrice, expenses];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) return { valid: false, error: "All planning values must be zero or greater.", monthlyRevenue: 0, breakEven: null as number | null };
  if (Math.abs(free + premium + elite - 100) > 0.001) return { valid: false, error: "Free, Premium, and Elite percentages must total exactly 100%.", monthlyRevenue: 0, breakEven: null as number | null };
  const monthlyRevenue = total * (premium / 100) * premiumPrice + total * (elite / 100) * elitePrice;
  const payingShare = (premium + elite) / 100;
  const averagePayingRevenue = payingShare > 0 ? ((premium / 100) * premiumPrice + (elite / 100) * elitePrice) / payingShare : 0;
  return { valid: true, error: "", monthlyRevenue, breakEven: averagePayingRevenue > 0 ? Math.ceil(expenses / averagePayingRevenue) : null };
}

const styles = StyleSheet.create({ stack: { gap: 14 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, results: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 2 }, result: { flex: 1, minWidth: 180, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, padding: 14 }, resultLabel: { ...typeStyles.caption, color: adminPalette.textSecondary }, resultValue: { ...typeStyles.cardTitle, color: adminPalette.text, marginTop: 5 }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, empty: { ...typeStyles.metadata, color: adminPalette.textSecondary, textAlign: "center", padding: 28 }, scenario: { minHeight: 76, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9, paddingVertical: 10 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, flex: { flex: 1, minWidth: 180 }, right: { minWidth: 140, alignItems: "flex-end" }, scenarioTitle: { ...typeStyles.label, color: adminPalette.text }, scenarioMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, scenarioRevenue: { ...typeStyles.cardTitle, color: adminPalette.success } });
