import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BadgeIndianRupee, CreditCard, FileText, Percent, PiggyBank, Save, ShieldCheck, TrendingUp, Wallet, type LucideIcon } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import {
  AdminFinanceService,
  computePartnershipTax,
  financialYearLabel,
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
export function FinanceTaxProvision({ financialYearStart }: { financialYearStart: string }) {
  const [data, setData] = useState<FinanceYearTaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paidInput, setPaidInput] = useState("0");
  const [savingPaid, setSavingPaid] = useState(false);
  const [paidMessage, setPaidMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await AdminFinanceService.loadYearTaxProvision(financialYearStart);
      setData(result);
      setPaidInput(String(result.taxPaid));
    } catch (cause) {
      setError(taxProvisionError(cause));
    } finally {
      setLoading(false);
    }
  }, [financialYearStart]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  // Keep the annual provision current when a verified payment, recorded
  // expense, or tax adjustment changes in another admin session.
  useEffect(() => AdminFinanceService.subscribe(() => void load()), [load]);

  const accountingProfit = data ? data.annualRevenue - data.annualExpenses : 0;
  const taxableIncome = accountingProfit;
  const tax = useMemo(() => computePartnershipTax(taxableIncome), [taxableIncome]);
  const taxPaid = data?.taxPaid ?? 0;
  const taxOutstanding = Math.max(tax.estimatedTotalTax - taxPaid, 0);

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
      <View style={styles.flex}><Text style={styles.title}>Tax provision</Text><Text style={styles.subtitle}>An annual planning estimate that updates from your recorded revenue and expenses.</Text></View>
      <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>Live ledger data</Text></View>
    </View>

    {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}

    {loading && !data ? <Text style={styles.loadingText}>Loading financial year totals…</Text> : data ? <>
      <View style={styles.summaryGrid}>
        <SummaryLine label="Money received" value={data.annualRevenue} hint="Recorded revenue" icon={Wallet} tone="purple" />
        <SummaryLine label="Money spent" value={data.annualExpenses} hint="Recorded expenses" icon={CreditCard} tone="blue" />
        <SummaryLine label="Profit before tax" value={accountingProfit} hint="Revenue − expenses" icon={TrendingUp} tone="green" />
        <SummaryLine label="Taxable income" value={taxableIncome} hint="Income after expenses" icon={FileText} tone="pink" />
      </View>

      <FinanceSection title="Tax summary" description="The yearly estimate uses the firm’s actual taxable income for the selected financial year.">
        <View style={styles.cards}>
          <TaxCard title="Income tax" rate="30%" amount={tax.incomeTax} hint="30% of taxable income" icon={Percent} tone="pink" />
          <TaxCard title="Surcharge" rate={tax.surchargeRate > 0 ? "12%" : "0%"} amount={tax.surcharge} hint={tax.surchargeRate === 0 ? "Applies above ₹1 crore" : tax.marginalRelief > 0 ? `Marginal relief: ${formatMoney(tax.marginalRelief)}` : "Extra charge on high income"} icon={TrendingUp} tone="amber" />
          <TaxCard title="Cess" rate="4%" amount={tax.cess} hint="4% of tax + surcharge" icon={ShieldCheck} tone="green" />
          <TaxCard title="Total tax payable" rate="Estimated" amount={tax.estimatedTotalTax} hint="For this financial year" icon={PiggyBank} tone="pink" featured />
        </View>
      </FinanceSection>

      <View style={styles.summaryCard}>
        <View style={styles.summaryCardHeading}><View style={styles.summaryIcon}><BadgeIndianRupee size={20} color={adminPalette.brand} /></View><View style={styles.flex}><Text style={styles.heroLabel}>Tax payment status</Text><Text style={styles.summaryCardHint}>Record any amount already paid against this annual estimate.</Text></View></View>
        <View style={styles.paidRow}>
          <View style={styles.flex}><FinanceField label="Tax paid" value={paidInput} onChangeText={setPaidInput} keyboardType="decimal-pad" placeholder="0.00" /></View>
          <FinanceButton label={savingPaid ? "Saving…" : "Save"} icon={Save} onPress={() => void savePaid()} disabled={savingPaid} variant="secondary" />
        </View>
        {paidMessage ? <FinanceNotice tone={paidMessage.tone}>{paidMessage.text}</FinanceNotice> : null}
        <View style={styles.finalLine}><Text style={styles.finalLineLabel}>Tax outstanding</Text><Text style={[styles.finalLineValue, { color: taxOutstanding > 0 ? adminPalette.warning : adminPalette.success }]}>{formatMoney(taxOutstanding)}</Text></View>
        <View style={styles.finalLine}><Text style={styles.finalLineLabel}>Profit after tax</Text><Text style={[styles.finalLineValue, { color: tax.estimatedProfitAfterTax >= 0 ? adminPalette.success : adminPalette.error }]}>{formatMoney(tax.estimatedProfitAfterTax)}</Text></View>
      </View>

      <FinanceNotice tone="warning">This is an estimate for planning purposes only — it is not a filed tax return. Please confirm the exact rates, surcharge, and any relief for FY {financialYearLabel(financialYearStart)} with your CA before relying on this number.</FinanceNotice>
    </> : null}
  </View>;
}

function SummaryLine({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: LucideIcon; tone: "purple" | "blue" | "green" | "pink" }) {
  const iconStyle = tone === "purple" ? styles.iconPurple : tone === "blue" ? styles.iconBlue : tone === "green" ? styles.iconGreen : styles.iconPink;
  return <View style={styles.summaryItem}><View style={[styles.summaryIcon, iconStyle]}><Icon size={20} color={tone === "blue" ? "#2563EB" : tone === "green" ? adminPalette.success : tone === "purple" ? "#7C3AED" : adminPalette.brand} /></View><View style={styles.flex}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{formatMoney(value)}</Text><Text style={styles.summaryHint}>{hint}</Text></View></View>;
}

function TaxCard({ title, rate, amount, hint, icon: Icon, tone, featured }: { title: string; rate: string; amount: number; hint?: string; icon: LucideIcon; tone: "pink" | "amber" | "green"; featured?: boolean }) {
  const iconStyle = tone === "amber" ? styles.iconAmber : tone === "green" ? styles.iconGreen : styles.iconPink;
  return <View style={[styles.card, featured && styles.cardFeatured]}>
    <View style={styles.cardHeader}><View style={[styles.taxIcon, iconStyle]}><Icon size={19} color={tone === "amber" ? adminPalette.warning : tone === "green" ? adminPalette.success : adminPalette.brand} /></View><View style={styles.rateBadge}><Text style={styles.rateBadgeText}>{rate}</Text></View></View>
    <Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardAmount}>{formatMoney(amount)}</Text>
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
  loadingText: { ...typeStyles.metadata, color: adminPalette.textSecondary, paddingVertical: 24, textAlign: "center" },
  livePill: { minHeight: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: adminPalette.successSubtle, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: adminPalette.success },
  liveText: { ...typeStyles.caption, color: adminPalette.success, fontFamily: typeStyles.button.fontFamily },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  summaryItem: { flex: 1, minWidth: 210, minHeight: 118, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 15, flexDirection: "row", gap: 12, alignItems: "center" },
  summaryIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconPurple: { backgroundColor: "#F1E9FF" },
  iconBlue: { backgroundColor: "#EAF2FF" },
  iconGreen: { backgroundColor: adminPalette.successSubtle },
  iconPink: { backgroundColor: adminPalette.brandSubtle },
  iconAmber: { backgroundColor: adminPalette.warningSubtle },
  summaryLabel: { ...typeStyles.label, color: adminPalette.textSecondary },
  summaryValue: { ...typeStyles.cardTitle, color: adminPalette.text, fontVariant: ["tabular-nums"], marginTop: 2 },
  summaryHint: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 2 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { flex: 1, minWidth: 210, minHeight: 166, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, gap: 5 },
  cardFeatured: { backgroundColor: "#FFF9FC", borderColor: "#F8B4D1" },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  taxIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  rateBadge: { backgroundColor: adminPalette.brandSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  rateBadgeText: { ...typeStyles.caption, color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily },
  cardAmount: { ...typeStyles.metric, color: adminPalette.text, marginTop: 4, letterSpacing: -0.3 },
  cardHint: { ...typeStyles.caption, color: adminPalette.textMuted },
  summaryCard: { backgroundColor: "#FFF9FC", borderRadius: 18, borderWidth: 1, borderColor: "#FBCFE8", padding: 18, gap: 12 },
  summaryCardHeading: { flexDirection: "row", gap: 12, alignItems: "center" },
  summaryCardHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroLabel: { ...typeStyles.cardTitle, color: adminPalette.text },
  heroValue: { ...typeStyles.metric, color: adminPalette.text, letterSpacing: -0.3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: "#F3B8D6", marginVertical: 2 },
  paidRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  finalLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 32 },
  finalLineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary },
  finalLineValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"], fontFamily: typeStyles.cardTitle.fontFamily },
});
