import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Save } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import {
  AdminFinanceService,
  computePartnershipTax,
  financialYearLabel,
  financialYearOptions,
  financialYearStartFor,
} from "@/services/adminFinanceService";
import type { FinanceYearTaxData } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

/**
 * Finance -> Taxes. This is the ONLY tax model on this page: a single
 * financial-year partnership tax provision, computed by the one shared
 * computePartnershipTax function (services/adminFinanceService.ts). There is
 * no monthly tax calculation and no per-partner split here — see the module
 * comment on computePartnershipTax for the full formula.
 */
export function FinanceTaxProvision() {
  const yearOptions = useMemo(() => financialYearOptions(), []);
  const [financialYearStart, setFinancialYearStart] = useState(() => financialYearStartFor(new Date()));
  const [data, setData] = useState<FinanceYearTaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adjustmentInput, setAdjustmentInput] = useState("0");
  const [adjustmentNotes, setAdjustmentNotes] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const [paidInput, setPaidInput] = useState("0");
  const [savingPaid, setSavingPaid] = useState(false);
  const [paidMessage, setPaidMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await AdminFinanceService.loadYearTaxProvision(financialYearStart);
      setData(result);
      setAdjustmentInput(String(result.taxAdjustment));
      setAdjustmentNotes(result.taxAdjustmentNotes ?? "");
      setPaidInput(String(result.taxPaid));
    } catch (cause) {
      setError(taxProvisionError(cause));
    } finally {
      setLoading(false);
    }
  }, [financialYearStart]);

  useEffect(() => { void load(); }, [load]);

  const accountingProfit = data ? data.annualRevenue - data.annualExpenses : 0;
  const parsedAdjustment = Number(adjustmentInput);
  const taxAdjustment = Number.isFinite(parsedAdjustment) ? parsedAdjustment : 0;
  const taxableIncome = accountingProfit + taxAdjustment;
  const tax = useMemo(() => computePartnershipTax(taxableIncome), [taxableIncome]);
  const taxPaid = data?.taxPaid ?? 0;
  const taxOutstanding = Math.max(tax.estimatedTotalTax - taxPaid, 0);

  const saveAdjustment = async () => {
    if (!Number.isFinite(parsedAdjustment)) return setAdjustmentMessage({ text: "Enter a valid tax adjustment amount.", tone: "error" });
    setSavingAdjustment(true); setAdjustmentMessage(null);
    try {
      await AdminFinanceService.saveTaxAdjustment(financialYearStart, parsedAdjustment, adjustmentNotes);
      setAdjustmentMessage({ text: "Tax adjustment saved.", tone: "success" });
      await load();
    } catch (cause) {
      setAdjustmentMessage({ text: cause instanceof Error ? cause.message : "Unable to save tax adjustment.", tone: "error" });
    } finally {
      setSavingAdjustment(false);
    }
  };

  const savePaid = async () => {
    const parsed = Number(paidInput);
    if (!Number.isFinite(parsed) || parsed < 0) return setPaidMessage({ text: "Enter a tax paid amount of zero or greater.", tone: "error" });
    setSavingPaid(true); setPaidMessage(null);
    try {
      await AdminFinanceService.saveTaxPaid(financialYearStart, parsed);
      setPaidMessage({ text: "Tax paid updated.", tone: "success" });
      await load();
    } catch (cause) {
      setPaidMessage({ text: cause instanceof Error ? cause.message : "Unable to save tax paid.", tone: "error" });
    } finally {
      setSavingPaid(false);
    }
  };

  return <View style={styles.stack}>
    <View style={styles.header}>
      <View style={styles.flex}><Text style={styles.title}>Tax provision</Text><Text style={styles.subtitle}>Estimated partnership-firm income tax for the selected financial year.</Text></View>
      <View accessibilityRole="radiogroup" style={styles.yearChips}>
        {yearOptions.map((year) => <Pressable key={year} accessibilityRole="radio" accessibilityState={{ checked: financialYearStart === year }} onPress={() => setFinancialYearStart(year)} style={({ pressed }) => [styles.yearChip, financialYearStart === year && styles.yearChipSelected, pressed && styles.pressed]}>
          <Text style={[styles.yearChipText, financialYearStart === year && styles.yearChipTextSelected]}>FY {financialYearLabel(year)}</Text>
        </Pressable>)}
      </View>
    </View>

    {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}

    {loading && !data ? <Text style={styles.loadingText}>Loading financial year totals…</Text> : data ? <>
      <FinanceSection title="Financial summary" description="Annual Revenue and Annual Business Expenses come automatically from recorded Finance transactions for this financial year.">
        <View style={styles.summaryGrid}>
          <SummaryLine label="Annual revenue" value={data.annualRevenue} />
          <SummaryLine label="Annual expenses" value={data.annualExpenses} />
          <SummaryLine label="Accounting profit" value={accountingProfit} strong />
        </View>
        <View style={styles.adjustmentRow}>
          <FinanceField label="Tax adjustment" value={adjustmentInput} onChangeText={setAdjustmentInput} keyboardType="numbers-and-punctuation" placeholder="0" />
          <FinanceField label="Adjustment notes (optional)" value={adjustmentNotes} onChangeText={setAdjustmentNotes} placeholder="Basis supplied by CA, e.g. disallowed expenses" />
        </View>
        {adjustmentMessage ? <FinanceNotice tone={adjustmentMessage.tone}>{adjustmentMessage.text}</FinanceNotice> : null}
        <FinanceButton label={savingAdjustment ? "Saving…" : "Save tax adjustment"} icon={Save} onPress={() => void saveAdjustment()} disabled={savingAdjustment} />
        <View style={styles.taxableIncomeRow}><Text style={styles.taxableIncomeLabel}>Taxable income</Text><Text style={styles.taxableIncomeValue}>{formatMoney(taxableIncome)}</Text></View>
      </FinanceSection>

      <View style={styles.cards}>
        <TaxCard title="Income tax" rate="30%" amount={tax.incomeTax} />
        <TaxCard title="Surcharge" rate={tax.surchargeRate > 0 ? "12%" : "0%"} amount={tax.surcharge} hint={tax.surchargeRate === 0 ? "Applicable above ₹1 crore taxable income" : tax.marginalRelief > 0 ? `Marginal relief applied: ${formatMoney(tax.marginalRelief)}` : undefined} />
        <TaxCard title="Cess" rate="4%" amount={tax.cess} />
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.heroRow}><Text style={styles.heroLabel}>Total tax payable</Text><Text style={styles.heroValue}>{formatMoney(tax.estimatedTotalTax)}</Text></View>
        <View style={styles.divider} />
        <View style={styles.paidRow}>
          <View style={styles.flex}><FinanceField label="Tax paid" value={paidInput} onChangeText={setPaidInput} keyboardType="decimal-pad" placeholder="0.00" /></View>
          <FinanceButton label={savingPaid ? "Saving…" : "Save"} icon={Save} onPress={() => void savePaid()} disabled={savingPaid} variant="secondary" />
        </View>
        {paidMessage ? <FinanceNotice tone={paidMessage.tone}>{paidMessage.text}</FinanceNotice> : null}
        <View style={styles.finalLine}><Text style={styles.finalLineLabel}>Tax outstanding</Text><Text style={[styles.finalLineValue, { color: taxOutstanding > 0 ? adminPalette.warning : adminPalette.success }]}>{formatMoney(taxOutstanding)}</Text></View>
        <View style={styles.finalLine}><Text style={styles.finalLineLabel}>Profit after tax</Text><Text style={[styles.finalLineValue, { color: tax.estimatedProfitAfterTax >= 0 ? adminPalette.success : adminPalette.error }]}>{formatMoney(tax.estimatedProfitAfterTax)}</Text></View>
      </View>

      <FinanceNotice tone="warning">This is an estimated tax provision for planning only, not a filed return. Confirm applicable rates, surcharge, and marginal relief for FY {financialYearLabel(financialYearStart)} with your CA before relying on this figure.</FinanceNotice>
    </> : null}
  </View>;
}

function SummaryLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={[styles.summaryValue, strong && styles.summaryValueStrong]}>{formatMoney(value)}</Text></View>;
}

function TaxCard({ title, rate, amount, hint }: { title: string; rate: string; amount: number; hint?: string }) {
  return <View style={styles.card}>
    <View style={styles.cardHeader}><Text style={styles.cardTitle}>{title}</Text><View style={styles.rateBadge}><Text style={styles.rateBadgeText}>{rate}</Text></View></View>
    <Text style={styles.cardAmount}>{formatMoney(amount)}</Text>
    {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
  </View>;
}

function taxProvisionError(cause: unknown) {
  const value = cause as { code?: string; message?: string } | null;
  const message = cause instanceof Error ? cause.message : value?.message ?? String(cause ?? "");
  const isMissingSchema = value?.code === "PGRST202" || value?.code === "42883" || value?.code === "42P01" || /relation .* does not exist|function .* does not exist|schema cache/i.test(message);
  return isMissingSchema
    ? "Tax provision setup is still pending in the database. No financial records were changed. " + message
    : message || "Unable to load the financial year totals. Check your connection and try again.";
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  header: { gap: 12 },
  title: { ...typeStyles.sectionTitle, color: adminPalette.text },
  subtitle: { ...typeStyles.metadata, color: adminPalette.textSecondary, marginTop: 4, maxWidth: 640 },
  yearChips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  yearChip: { minHeight: 44, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  yearChipSelected: { backgroundColor: adminPalette.brand },
  yearChipText: { ...typeStyles.caption, color: adminPalette.textSecondary },
  yearChipTextSelected: { color: "#FFF" },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  loadingText: { ...typeStyles.metadata, color: adminPalette.textSecondary, paddingVertical: 24, textAlign: "center" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  summaryItem: { minWidth: 160, gap: 3 },
  summaryLabel: { ...typeStyles.label, color: adminPalette.textSecondary },
  summaryValue: { ...typeStyles.cardTitle, color: adminPalette.text, fontVariant: ["tabular-nums"] },
  summaryValueStrong: { fontFamily: typeStyles.metric.fontFamily },
  adjustmentRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  taxableIncomeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  taxableIncomeLabel: { ...typeStyles.label, color: adminPalette.textSecondary },
  taxableIncomeValue: { ...typeStyles.cardTitle, color: adminPalette.text },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { flex: 1, minWidth: 220, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, gap: 6 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  rateBadge: { backgroundColor: adminPalette.brandSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rateBadgeText: { ...typeStyles.caption, color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily },
  cardAmount: { ...typeStyles.metric, color: adminPalette.text, marginTop: 4, letterSpacing: -0.3 },
  cardHint: { ...typeStyles.caption, color: adminPalette.textMuted },
  summaryCard: { backgroundColor: adminPalette.brandSubtle, borderRadius: 20, borderWidth: 1, borderColor: "#FBCFE8", padding: 20, gap: 8 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { ...typeStyles.cardTitle, color: adminPalette.text },
  heroValue: { ...typeStyles.metric, color: adminPalette.text, letterSpacing: -0.3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#F3B8D6", marginVertical: 2 },
  paidRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  finalLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
  finalLineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary },
  finalLineValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"], fontFamily: typeStyles.cardTitle.fontFamily },
});
