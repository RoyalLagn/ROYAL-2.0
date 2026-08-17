import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Save } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, signedTransactionAmount, summarizeFinance } from "@/services/adminFinanceService";
import type { FinanceMonthData, FinanceTaxRecord } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

// Single source of truth for tax_type labels — reused by the Revenue
// dashboard's Tax Summary card so both screens describe the same
// finance_tax_records rows identically.
export const taxLabels: Record<FinanceTaxRecord["tax_type"], string> = { gst_collected: "GST collected", gst_input_credit: "GST input credit", gst_paid: "GST paid", income_tax_provision: "Income tax provision", income_tax_paid: "Income tax paid", other_provision: "Other tax provision" };

export function FinanceProfitLoss({ data }: { data: FinanceMonthData }) {
  const summary = useMemo(() => summarizeFinance(data), [data]);
  const categoryTotals = (direction: "revenue" | "expense") => {
    const totals = new Map<string, number>();
    data.transactions.filter((item) => item.direction === direction && item.status === "recorded").forEach((item) => { const name = item.finance_categories?.name ?? "Other"; totals.set(name, (totals.get(name) ?? 0) + (direction === "revenue" ? signedTransactionAmount(item) - item.gateway_fee : item.amount)); });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  };
  return <FinanceSection title="Profit & loss statement" description="Automatically generated from recorded transactions and tax provisions for the selected month.">
    <StatementGroup title="Revenue" rows={categoryTotals("revenue")} totalLabel="Net revenue" total={summary.netRevenue} />
    <StatementGroup title="Expenses" rows={categoryTotals("expense")} totalLabel="Total expenses" total={summary.expenses} />
    <View style={styles.result}><StatementLine label="Profit before tax" value={summary.profitBeforeTax} strong /><StatementLine label="Estimated tax provision" value={summary.estimatedTax} tone="warning" /><StatementLine label="Net profit" value={summary.netProfit} strong tone={summary.netProfit >= 0 ? "positive" : "negative"} /></View>
    <FinanceNotice tone="warning">Tax provisions are planning estimates. Your accountant or CA must confirm actual GST and income-tax treatment.</FinanceNotice>
  </FinanceSection>;
}

export function FinanceTaxes({ data, onChanged }: { data: FinanceMonthData; onChanged: () => Promise<void> }) {
  const [type, setType] = useState<FinanceTaxRecord["tax_type"]>("income_tax_provision");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const closed = data.closure?.status === "closed";
  const end = new Date(`${data.monthStart}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const save = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return setMessage({ text: "Enter a tax amount of zero or greater.", tone: "error" });
    setSaving(true); setMessage(null);
    try { await AdminFinanceService.saveTaxRecord({ period_start: data.monthStart, period_end: end.toISOString().slice(0, 10), tax_type: type, amount: parsed, is_estimate: type.includes("provision"), notes }); setAmount(""); setNotes(""); setMessage({ text: "Tax record saved.", tone: "success" }); await onChanged(); }
    catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Unable to save tax record.", tone: "error" }); }
    finally { setSaving(false); }
  };
  return <View style={styles.stack}>
    {message ? <FinanceNotice tone={message.tone}>{message.text}</FinanceNotice> : null}
    <FinanceNotice tone="warning">This section supports planning and record-keeping. It does not calculate or declare legally payable tax.</FinanceNotice>
    <FinanceSection title="Tax records" description="Record estimated provisions, GST values, and tax payments confirmed through your accounting workflow.">
      <View accessibilityRole="radiogroup" style={styles.chips}>{(Object.keys(taxLabels) as FinanceTaxRecord["tax_type"][]).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: type === item }} onPress={() => setType(item)} style={({ pressed }) => [styles.chip, type === item && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, type === item && styles.chipTextSelected]}>{taxLabels[item]}</Text></Pressable>)}</View>
      <View style={styles.fields}><FinanceField label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!closed} placeholder="0.00" /><FinanceField label="Period end" value={end.toISOString().slice(0, 10)} editable={false} /></View>
      <FinanceField label="Notes" value={notes} onChangeText={setNotes} editable={!closed} multiline placeholder="Basis supplied by accountant or internal estimate" />
      <FinanceButton label={saving ? "Saving…" : "Save tax record"} icon={Save} onPress={() => void save()} disabled={closed || saving} />
      <View style={styles.taxList}>{data.taxes.map((record, index) => <View key={record.id} style={[styles.taxRow, index > 0 && styles.rowBorder]}><View style={styles.flex}><Text style={styles.rowTitle}>{taxLabels[record.tax_type]}</Text><Text style={styles.rowMeta}>{record.is_estimate ? "Estimated provision" : "Recorded actual"}{record.notes ? ` · ${record.notes}` : ""}</Text></View><Text style={styles.rowAmount}>{formatMoney(record.amount)}</Text></View>)}</View>
    </FinanceSection>
  </View>;
}

function StatementGroup({ title, rows, totalLabel, total }: { title: string; rows: [string, number][]; totalLabel: string; total: number }) { return <View style={styles.statement}><Text style={styles.statementTitle}>{title}</Text>{rows.length ? rows.map(([label, value]) => <StatementLine key={label} label={label} value={value} />) : <Text style={styles.noRows}>No recorded {title.toLowerCase()}.</Text>}<StatementLine label={totalLabel} value={total} strong /></View>; }
function StatementLine({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "positive" | "negative" | "warning" }) { const color = tone === "positive" ? adminPalette.success : tone === "negative" ? adminPalette.error : tone === "warning" ? adminPalette.warning : adminPalette.text; return <View style={[styles.line, strong && styles.strongLine]}><Text style={[styles.lineLabel, strong && styles.strongText]}>{label}</Text><Text style={[styles.lineValue, strong && styles.strongText, { color }]}>{formatMoney(value)}</Text></View>; }

const styles = StyleSheet.create({ stack: { gap: 14 }, flex: { flex: 1, minWidth: 0 }, statement: { gap: 2 }, statementTitle: { ...typeStyles.label, color: adminPalette.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }, line: { minHeight: 39, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, strongLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border, marginTop: 5, paddingTop: 5 }, lineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary }, lineValue: { ...typeStyles.bodyCompact, fontVariant: ["tabular-nums"] }, strongText: { fontFamily: typeStyles.cardTitle.fontFamily, color: adminPalette.text }, noRows: { ...typeStyles.metadata, color: adminPalette.textMuted, paddingVertical: 8 }, result: { backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { minHeight: 48, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" }, chipSelected: { backgroundColor: adminPalette.brand }, chipText: { ...typeStyles.caption, color: adminPalette.textSecondary }, chipTextSelected: { color: "#FFF" }, pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] }, fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, taxList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, taxRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, rowTitle: { ...typeStyles.label, color: adminPalette.text }, rowMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, rowAmount: { ...typeStyles.cardTitle, color: adminPalette.text } });
