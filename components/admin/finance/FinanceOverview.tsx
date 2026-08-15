import React, { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { summarizeFinance } from "@/services/adminFinanceService";
import type { FinanceMonthData } from "@/types/adminFinance";
import { FinanceEmpty, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

export function FinanceOverview({ data }: { data: FinanceMonthData }) {
  const { width } = useWindowDimensions();
  const summary = useMemo(() => summarizeFinance(data), [data]);
  const expenseCategories = data.categories.filter((item) => item.direction === "expense");
  const actualByCategory = new Map<string, number>();
  data.transactions.filter((item) => item.direction === "expense" && item.status === "recorded").forEach((item) => actualByCategory.set(item.category_id, (actualByCategory.get(item.category_id) ?? 0) + item.amount));
  const budgetRows = data.budgetItems.map((item) => ({ category: expenseCategories.find((category) => category.id === item.category_id), budget: item.amount, actual: actualByCategory.get(item.category_id) ?? 0 })).filter((item) => item.category);
  const overBudget = budgetRows.filter((item) => item.actual > item.budget);
  const usage = data.cloudinaryUsage;
  const cloudinaryPeak = usage ? Math.max(usage.storage_percent ?? 0, usage.bandwidth_percent ?? 0, usage.transformations_percent ?? 0) : 0;
  const periodLabel = new Date(`${data.monthStart}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  return <View style={styles.stack}>
    {data.closure?.status === "closed" ? <FinanceNotice tone="success">{periodLabel} is closed and protected from accidental transaction changes.</FinanceNotice> : null}
    {summary.revenueTarget > 0 && summary.revenueTargetGap < 0 ? <FinanceNotice tone="warning">Verified revenue is {formatMoney(Math.abs(summary.revenueTargetGap), true)} below this month&apos;s target.</FinanceNotice> : null}
    {overBudget.length ? <FinanceNotice tone="error">{overBudget.length} budget {overBudget.length === 1 ? "category is" : "categories are"} over the approved amount.</FinanceNotice> : null}
    {cloudinaryPeak >= 80 ? <FinanceNotice tone="warning">Cloudinary usage has reached {cloudinaryPeak.toFixed(0)}% in at least one tracked resource.</FinanceNotice> : null}

    <FinanceSection title="Financial health" description="A compact statement based on verified receipts, recorded operating costs, and clearly labeled tax estimates.">
      <View style={styles.healthLead}><Text style={styles.healthLabel}>Net profit after estimated tax</Text><Text adjustsFontSizeToFit numberOfLines={1} style={[styles.healthValue, { color: summary.netProfit >= 0 ? adminPalette.success : adminPalette.error }]}>{formatMoney(summary.netProfit)}</Text><Text style={styles.healthHint}>{summary.netProfit >= 0 ? "Positive result for the selected month" : "Recorded costs and estimated tax exceed net revenue"}</Text></View>
      <View style={styles.statement}>
        <HealthLine label="Verified net revenue" value={summary.netRevenue} hint={`${formatMoney(summary.gatewayFees, true)} gateway fees deducted`} />
        <HealthLine label="Recorded expenses" value={summary.expenses} hint={`${data.transactions.filter((item) => item.direction === "expense" && item.status === "recorded").length} expense records`} />
        <HealthLine label="Profit before tax" value={summary.profitBeforeTax} strong />
        <HealthLine label="Estimated tax provision" value={summary.estimatedTax} tone="warning" hint="Planning estimate—not confirmed tax payable" />
      </View>
    </FinanceSection>

    <View style={width >= 1040 ? styles.columns : styles.stack}>
      <View style={styles.column}>
        <FinanceSection title="Budget control" description="Approved category limits compared with recorded expenses.">
          {!data.budget ? <FinanceEmpty title="No budget for this month" message="Create a category budget to start tracking available spend." /> : <>
            <View style={styles.budgetHeadline}><View><Text style={styles.budgetLabel}>Budget remaining</Text><Text style={[styles.budgetValue, { color: summary.budgetRemaining >= 0 ? adminPalette.success : adminPalette.error }]}>{formatMoney(summary.budgetRemaining)}</Text></View><Text style={styles.budgetMeta}>{formatMoney(summary.expenses)} of {formatMoney(summary.budget)}</Text></View>
            <View style={styles.table}>{budgetRows.slice(0, 6).map((row, index) => { const difference = row.budget - row.actual; return <View key={row.category!.id} style={[styles.row, index > 0 && styles.rowBorder]}><View style={styles.flex}><Text style={styles.rowTitle}>{row.category!.name}</Text><Text style={styles.rowMeta}>{formatMoney(row.actual)} actual</Text></View><Text style={[styles.difference, { color: difference >= 0 ? adminPalette.success : adminPalette.error }]}>{difference >= 0 ? `${formatMoney(difference)} left` : `${formatMoney(Math.abs(difference))} over`}</Text></View>; })}</View>
          </>}
        </FinanceSection>
      </View>

      <View style={styles.column}>
        <FinanceSection title="Cloudinary cost control" description="Manually recorded usage and invoice totals for Clips media infrastructure.">
          {!usage ? <FinanceEmpty title="No Cloudinary usage recorded" message="Add this month’s usage and actual cost from the Cloudinary dashboard or invoice." /> : <>
            <View style={styles.usageGrid}><Usage label="Storage" value={usage.storage_percent} /><Usage label="Bandwidth" value={usage.bandwidth_percent} /><Usage label="Transformations" value={usage.transformations_percent} /></View>
            <View style={styles.costRow}><View><Text style={styles.budgetLabel}>Estimated cost</Text><Text style={styles.costValue}>{formatMoney(usage.estimated_cost)}</Text></View><View style={styles.costRight}><Text style={styles.budgetLabel}>Actual cost</Text><Text style={styles.costValue}>{formatMoney(usage.actual_cost)}</Text></View></View>
          </>}
        </FinanceSection>
      </View>
    </View>
  </View>;
}

function HealthLine({ label, value, hint, strong, tone }: { label: string; value: number; hint?: string; strong?: boolean; tone?: "warning" }) {
  return <View style={[styles.healthRow, strong && styles.healthRowStrong]}><View style={styles.flex}><Text style={[styles.healthRowLabel, strong && styles.healthRowLabelStrong]}>{label}</Text>{hint ? <Text style={styles.healthRowHint}>{hint}</Text> : null}</View><Text style={[styles.healthRowValue, strong && styles.healthRowLabelStrong, tone === "warning" && { color: adminPalette.warning }]}>{formatMoney(value)}</Text></View>;
}

function Usage({ label, value }: { label: string; value: number | null }) {
  const safe = Math.min(100, Math.max(0, value ?? 0));
  const tone = safe >= 80 ? adminPalette.warning : adminPalette.brand;
  return <View style={styles.usage}><View style={styles.usageTop}><Text style={styles.rowTitle}>{label}</Text><Text style={[styles.usageValue, { color: tone }]}>{value == null ? "—" : `${safe.toFixed(0)}%`}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${safe}%`, backgroundColor: tone }]} /></View></View>;
}

const styles = StyleSheet.create({
  stack: { gap: 14 }, columns: { flexDirection: "row", alignItems: "flex-start", gap: 14 }, column: { flex: 1, minWidth: 0 }, healthLead: { paddingVertical: 8 }, healthLabel: { ...typeStyles.label, color: adminPalette.textSecondary }, healthValue: { ...typeStyles.metric, color: adminPalette.text, fontSize: 30, lineHeight: 36, marginTop: 5 }, healthHint: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 3 }, statement: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, healthRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 }, healthRowStrong: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, healthRowLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary }, healthRowLabelStrong: { fontFamily: typeStyles.cardTitle.fontFamily, color: adminPalette.text }, healthRowHint: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 2 }, healthRowValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"], textAlign: "right" },
  budgetHeadline: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }, budgetLabel: { ...typeStyles.label, color: adminPalette.textSecondary }, budgetValue: { ...typeStyles.metric, marginTop: 3 }, budgetMeta: { ...typeStyles.metadata, color: adminPalette.textSecondary, textAlign: "right" },
  table: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, flex: { flex: 1, minWidth: 0 }, rowTitle: { ...typeStyles.label, color: adminPalette.text }, rowMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, difference: { ...typeStyles.label, textAlign: "right" },
  usageGrid: { gap: 14 }, usage: { gap: 7 }, usageTop: { flexDirection: "row", justifyContent: "space-between" }, usageValue: { ...typeStyles.label }, track: { height: 7, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, overflow: "hidden" }, fill: { height: "100%", borderRadius: 999 }, costRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border, paddingTop: 14 }, costRight: { alignItems: "flex-end" }, costValue: { ...typeStyles.cardTitle, color: adminPalette.text, marginTop: 3 },
});
