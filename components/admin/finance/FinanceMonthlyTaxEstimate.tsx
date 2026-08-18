import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService } from "@/services/adminFinanceService";
import type { MonthlyTaxEstimateRow } from "@/types/adminFinance";
import { FinanceNotice, formatMoney } from "./FinanceUI";

/**
 * Monthly Tax Estimate — a management/provisioning view, deliberately
 * separate from the Yearly Tax model. It never applies a surcharge (the
 * ₹1 crore threshold is annual, not monthly) and its total is never labeled
 * as final tax payable. See computeMonthlyTaxEstimate in adminFinanceService.
 */
export function FinanceMonthlyTaxEstimate({ financialYearStart }: { financialYearStart: string }) {
  const [rows, setRows] = useState<MonthlyTaxEstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await AdminFinanceService.loadMonthlyTaxEstimates(financialYearStart);
      setRows(result);
    } catch (cause) {
      setError(monthlyEstimateError(cause));
    } finally {
      setLoading(false);
    }
  }, [financialYearStart]);

  useEffect(() => {
    setRows([]);
    setSelectedMonth(null);
    void load();
  }, [load]);
  useEffect(() => AdminFinanceService.subscribe(() => void load()), [load]);

  const ytd = useMemo(() => rows.reduce((sum, row) => ({
    revenue: sum.revenue + row.revenue,
    expenses: sum.expenses + row.expenses,
    profit: sum.profit + row.profit,
    estimatedTax: sum.estimatedTax + row.estimatedTax,
  }), { revenue: 0, expenses: 0, profit: 0, estimatedTax: 0 }), [rows]);

  const selectedRow = rows.find((row) => row.monthStart === selectedMonth) ?? null;

  return <View style={styles.stack}>
    <View style={styles.header}>
      <View style={styles.flex}><Text style={styles.title}>Monthly tax estimate</Text><Text style={styles.subtitle}>A month-by-month view of how much tax the firm is setting aside, based on recorded profit. This is for tracking only — the official yearly figure lives in Yearly Tax.</Text></View>
    </View>

    {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}

    {loading && !rows.length ? <Text style={styles.loadingText}>Loading monthly totals…</Text> : <>
      <View style={styles.ytdGrid}>
        <YtdTile label="Received so far this year" value={ytd.revenue} />
        <YtdTile label="Spent so far this year" value={ytd.expenses} />
        <YtdTile label="Profit so far this year" value={ytd.profit} strong />
        <YtdTile label="Tax set aside so far" value={ytd.estimatedTax} strong tone="warning" />
      </View>

      <Text style={styles.tableHint}>Tap a month below to see its full breakdown.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.headerCell, styles.monthCell]}>Month</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Received</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Spent</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Profit</Text>
            <Text style={[styles.headerCell, styles.amountCell]}>Est. tax</Text>
          </View>
          {rows.map((row, index) => <Pressable key={row.monthStart} accessibilityRole="button" accessibilityState={{ selected: selectedMonth === row.monthStart }} onPress={() => setSelectedMonth(selectedMonth === row.monthStart ? null : row.monthStart)} style={({ pressed }) => [styles.tableRow, index > 0 && styles.rowBorder, selectedMonth === row.monthStart && styles.tableRowSelected, pressed && styles.pressed]}>
            <Text style={[styles.cell, styles.monthCell]}>{monthOnly(row.monthLabel)}</Text>
            <Text style={[styles.cell, styles.amountCell]}>{formatMoney(row.revenue, true)}</Text>
            <Text style={[styles.cell, styles.amountCell]}>{formatMoney(row.expenses, true)}</Text>
            <Text style={[styles.cell, styles.amountCell]}>{formatMoney(row.profit, true)}</Text>
            <Text style={[styles.cell, styles.amountCell, styles.cellStrong]}>{formatMoney(row.estimatedTax, true)}</Text>
          </Pressable>)}
        </View>
      </ScrollView>

      <View style={styles.fullYearRow}><Text style={styles.fullYearLabel}>Total if you add up all 12 months</Text><Text style={styles.fullYearValue}>{formatMoney(ytd.estimatedTax)}</Text></View>
      <Text style={styles.fullYearHint}>This is just the 12 monthly estimates added together — a rough running total, not your final tax bill. The Yearly Tax section may show a slightly different number (for example, once annual surcharge kicks in).</Text>

      {selectedRow ? <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{selectedRow.monthLabel} breakdown</Text>
        <DetailLine label="Received" value={selectedRow.revenue} />
        <DetailLine label="Spent" value={selectedRow.expenses} />
        <DetailLine label="Profit" value={selectedRow.profit} strong />
        <DetailLine label="Income tax (estimated)" value={selectedRow.incomeTax} />
        <DetailLine label="Cess (estimated)" value={selectedRow.cess} />
        <DetailLine label="Tax set aside this month" value={selectedRow.estimatedTax} strong />
      </View> : null}

      <FinanceNotice tone="warning">This month-by-month view is for tracking only. Your official, final tax number is calculated once a year in the Yearly Tax section.</FinanceNotice>
    </>}
  </View>;
}

function YtdTile({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "warning" }) {
  const color = tone === "warning" ? adminPalette.warning : adminPalette.text;
  return <View style={styles.ytdTile}><Text style={styles.ytdLabel}>{label}</Text><Text style={[styles.ytdValue, strong && styles.ytdValueStrong, { color }]}>{formatMoney(value)}</Text></View>;
}

function DetailLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <View style={styles.detailLine}><Text style={styles.detailLabel}>{label}</Text><Text style={[styles.detailValue, strong && styles.detailValueStrong]}>{formatMoney(value)}</Text></View>;
}

function monthOnly(monthLabel: string) {
  return monthLabel.split(" ")[0];
}

function monthlyEstimateError(cause: unknown) {
  const value = cause as { code?: string; message?: string } | null;
  const message = cause instanceof Error ? cause.message : value?.message ?? String(cause ?? "");
  const isMissingSchema = value?.code === "PGRST202" || value?.code === "42883" || value?.code === "42P01" || /relation .* does not exist|function .* does not exist|schema cache/i.test(message);
  return isMissingSchema
    ? "Monthly tax estimate setup is still pending in the database. No financial records were changed. " + message
    : message || "Unable to load monthly tax estimates. Check your connection and try again.";
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  header: { gap: 12 },
  title: { ...typeStyles.sectionTitle, color: adminPalette.text },
  subtitle: { ...typeStyles.metadata, color: adminPalette.textSecondary, marginTop: 4, maxWidth: 640 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  loadingText: { ...typeStyles.metadata, color: adminPalette.textSecondary, paddingVertical: 24, textAlign: "center" },
  ytdGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ytdTile: { flex: 1, minWidth: 140, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, padding: 12, gap: 4 },
  ytdLabel: { ...typeStyles.label, color: adminPalette.textSecondary },
  ytdValue: { ...typeStyles.cardTitle, color: adminPalette.text, fontVariant: ["tabular-nums"] },
  ytdValueStrong: { fontFamily: typeStyles.metric.fontFamily, fontSize: typeStyles.cardTitle.fontSize },
  tableHint: { ...typeStyles.caption, color: adminPalette.textMuted },
  table: { minWidth: 560, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 14, overflow: "hidden" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: adminPalette.surfaceSubtle, paddingVertical: 10, paddingHorizontal: 4 },
  headerCell: { ...typeStyles.caption, color: adminPalette.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 4, backgroundColor: adminPalette.surface },
  tableRowSelected: { backgroundColor: adminPalette.brandSubtle },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border },
  cell: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"] },
  cellStrong: { fontFamily: typeStyles.cardTitle.fontFamily },
  monthCell: { width: 120, paddingLeft: 10 },
  amountCell: { width: 110, textAlign: "right", paddingRight: 10 },
  fullYearRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: adminPalette.brandSubtle, borderRadius: 14, borderWidth: 1, borderColor: "#FBCFE8", paddingHorizontal: 16, paddingVertical: 14 },
  fullYearLabel: { ...typeStyles.cardTitle, color: adminPalette.text },
  fullYearValue: { ...typeStyles.metric, color: adminPalette.text, letterSpacing: -0.3 },
  fullYearHint: { ...typeStyles.caption, color: adminPalette.textMuted },
  detailCard: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, gap: 4 },
  detailTitle: { ...typeStyles.cardTitle, color: adminPalette.text, marginBottom: 6 },
  detailLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 30 },
  detailLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary },
  detailValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"] },
  detailValueStrong: { fontFamily: typeStyles.cardTitle.fontFamily },
});
