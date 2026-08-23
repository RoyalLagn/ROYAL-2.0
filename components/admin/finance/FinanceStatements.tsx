import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CalendarRange, Check, ChevronDown, X } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import type { FinanceTaxRecord, FinanceYearTaxData, MonthlyTaxBreakdownRow } from "@/types/adminFinance";
import { AdminFinanceService, computePartnershipTax, financialYearLabel, financialYearOptions, financialYearStartFor } from "@/services/adminFinanceService";
import { FinanceTaxProvision } from "./FinanceTaxProvision";
import { FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

// Single source of truth for tax_type labels — reused by the Revenue
// dashboard's Tax Summary card so both screens describe the same
// finance_tax_records rows identically.
export const taxLabels: Record<FinanceTaxRecord["tax_type"], string> = { gst_collected: "GST collected", gst_input_credit: "GST input credit", gst_paid: "GST paid", income_tax_provision: "Income tax provision", income_tax_paid: "Income tax paid", other_provision: "Other tax provision" };

// Income tax for a partnership firm is determined from the full financial
// year's taxable income. This screen intentionally exposes one annual model,
// so a month can never be mistaken for a standalone income-tax calculation.
export function FinanceTaxes() {
  const { width } = useWindowDimensions();
  const phone = width < 600;
  const [financialYearStart, setFinancialYearStart] = useState(() => financialYearStartFor(new Date()));
  const yearOptions = useMemo(() => financialYearOptions(), []);
  return <View style={styles.stack}>
    <View style={styles.toolbar}><View><Text style={styles.taxTitle}>Yearly income tax</Text><Text style={styles.taxHint}>Calculated from the selected financial year’s recorded totals.</Text></View><FinancialYearSelect value={financialYearStart} options={yearOptions} onChange={setFinancialYearStart} fullWidth={phone} /></View>
    <FinanceTaxProvision financialYearStart={financialYearStart} />
    <FinanceMonthlyTaxBreakdown financialYearStart={financialYearStart} />
  </View>;
}

function FinanceMonthlyTaxBreakdown({ financialYearStart }: { financialYearStart: string }) {
  const [rows, setRows] = useState<MonthlyTaxBreakdownRow[]>([]);
  const [yearData, setYearData] = useState<FinanceYearTaxData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [breakdown, annual] = await Promise.all([
        AdminFinanceService.loadMonthlyTaxBreakdown(financialYearStart),
        AdminFinanceService.loadYearTaxProvision(financialYearStart),
      ]);
      setRows(breakdown); setYearData(annual); setUpdatedAt(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the monthly tax breakdown.");
    } finally { setLoading(false); }
  }, [financialYearStart]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => AdminFinanceService.subscribe(() => void load()), [load]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    taxableProfit: sum.taxableProfit + row.taxableProfit,
    incomeTax: sum.incomeTax + row.incomeTax,
    cess: sum.cess + row.cess,
    estimatedTax: sum.estimatedTax + row.estimatedTax,
  }), { taxableProfit: 0, incomeTax: 0, cess: 0, estimatedTax: 0 }), [rows]);
  const annualTax = yearData ? computePartnershipTax(yearData.annualRevenue - yearData.annualExpenses) : null;
  const reconciles = annualTax ? Math.abs(totals.estimatedTax - annualTax.estimatedTotalTax) < 0.01 : false;
  const selectedRow = rows.find((row) => row.monthStart === selectedMonth);

  return <FinanceSection title="Monthly Tax Breakdown" description="Monthly estimated tax from recorded taxable profit. This is reporting only, not a monthly tax payment or return." action={<View style={styles.liveStatus}><View style={styles.liveDot} /><Text style={styles.liveStatusText}>{updatedAt ? "Live and up to date" : "Loading live data"}</Text></View>}>
    {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}
    {loading ? <ActivityIndicator color={adminPalette.brand} style={styles.breakdownLoading} /> : <><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.taxTable}>
      <View style={[styles.taxTableRow, styles.taxTableHeader]}><TaxTableCell value="Month" header first /><TaxTableCell value="Taxable profit" header /><TaxTableCell value="30% tax" header /><TaxTableCell value="4% cess" header /><TaxTableCell value="Estimated tax" header last /></View>
      {rows.map((row) => <Pressable key={row.monthStart} accessibilityRole="button" accessibilityLabel={"View " + row.monthLabel + " tax estimate"} onPress={() => setSelectedMonth((current) => current === row.monthStart ? null : row.monthStart)} style={({ pressed }) => [styles.taxTableRow, selectedMonth === row.monthStart && styles.taxTableRowSelected, pressed && styles.taxTableRowPressed]}><TaxTableCell value={row.monthLabel} first /><TaxTableCell value={formatMoney(row.taxableProfit)} /><TaxTableCell value={formatMoney(row.incomeTax)} /><TaxTableCell value={formatMoney(row.cess)} /><TaxTableCell value={formatMoney(row.estimatedTax)} last /></Pressable>)}
      <View style={[styles.taxTableRow, styles.taxTableTotal]}><TaxTableCell value="Total" header first /><TaxTableCell value={formatMoney(totals.taxableProfit)} header /><TaxTableCell value={formatMoney(totals.incomeTax)} header /><TaxTableCell value={formatMoney(totals.cess)} header /><TaxTableCell value={formatMoney(totals.estimatedTax)} header last /></View>
    </View></ScrollView>
    {selectedRow ? <View style={styles.selectedMonth}><Text style={styles.selectedMonthTitle}>{selectedRow.monthLabel}</Text><Text style={styles.selectedMonthText}>Positive taxable profit: {formatMoney(selectedRow.taxableProfit)} · Estimated tax: {formatMoney(selectedRow.estimatedTax)}</Text></View> : null}
    {annualTax ? <Text style={styles.reconciliation}>{reconciles ? `Matches the FY ${financialYearLabel(financialYearStart)} yearly estimate: ${formatMoney(annualTax.estimatedTotalTax)}.` : `Monthly total: ${formatMoney(totals.estimatedTax)}. Yearly estimate: ${formatMoney(annualTax.estimatedTotalTax)}. They can differ when a month has a loss or annual surcharge/marginal relief applies.`}</Text> : null}
    <FinanceNotice tone="warning">Each month uses 30% of that month’s positive taxable profit, plus 4% cess on that tax. Surcharge remains an annual calculation in Yearly income tax.</FinanceNotice></>}
  </FinanceSection>;
}

function TaxTableCell({ value, header = false, first = false, last = false }: { value: string; header?: boolean; first?: boolean; last?: boolean }) { return <Text style={[styles.taxTableCell, first && styles.taxTableMonth, last && styles.taxTableLast, header && styles.taxTableCellStrong]} numberOfLines={1}>{value}</Text>; }

export function FinancialYearSelect({ value, options, onChange, fullWidth }: { value: string; options: string[]; onChange: (value: string) => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return <View style={[styles.yearField, fullWidth && styles.yearFieldFull]}>
    <Text style={styles.yearLabel}>Financial year</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Financial year, FY ${financialYearLabel(value)}`}
      accessibilityHint="Opens the financial year list"
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.yearButton, pressed && styles.pressed]}
    >
      <CalendarRange size={18} color={adminPalette.brand} />
      <Text style={styles.yearButtonText}>FY {financialYearLabel(value)}</Text>
      <ChevronDown size={17} color={adminPalette.textSecondary} />
    </Pressable>

    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable accessibilityLabel="Close financial year list" style={styles.backdrop} onPress={close}>
        <Pressable accessibilityRole="menu" style={styles.menu} onPress={(event) => event.stopPropagation()}>
          <View style={styles.menuHeader}>
            <View style={styles.menuHeaderCopy}>
              <Text style={styles.menuTitle}>Choose financial year</Text>
              <Text style={styles.menuHint}>April to March</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close financial year list" onPress={close} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><X size={19} color={adminPalette.text} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.optionList} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = option === value;
              return <Pressable
                key={option}
                accessibilityRole="menuitem"
                accessibilityLabel={`FY ${financialYearLabel(option)}`}
                accessibilityState={{ selected }}
                onPress={() => { onChange(option); close(); }}
                style={({ pressed }) => [styles.yearOption, selected && styles.yearOptionSelected, pressed && styles.pressed]}
              >
                <View style={styles.optionCopy}><Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>FY {financialYearLabel(option)}</Text><Text style={styles.optionHint}>1 Apr {option.slice(0, 4)} – 31 Mar {Number(option.slice(0, 4)) + 1}</Text></View>
                {selected ? <Check size={19} color={adminPalette.brand} /> : null}
              </Pressable>;
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  taxTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  taxHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  breakdownLoading: { marginVertical: 24 },
  taxTable: { minWidth: 780, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 14, overflow: "hidden" },
  taxTableRow: { minHeight: 46, flexDirection: "row", backgroundColor: adminPalette.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border },
  taxTableRowSelected: { backgroundColor: adminPalette.brandSubtle },
  taxTableRowPressed: { opacity: 0.84 },
  taxTableHeader: { backgroundColor: adminPalette.surfaceSubtle },
  taxTableTotal: { backgroundColor: adminPalette.brandSubtle, borderBottomWidth: 0 },
  taxTableCell: { width: 150, paddingHorizontal: 12, alignSelf: "center", ...typeStyles.caption, color: adminPalette.text, textAlign: "right", fontVariant: ["tabular-nums"] },
  taxTableMonth: { width: 180, textAlign: "left" },
  taxTableLast: { width: 170 },
  taxTableCellStrong: { fontFamily: typeStyles.cardTitle.fontFamily },
  reconciliation: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 10 },
  selectedMonth: { marginTop: 12, backgroundColor: adminPalette.brandSubtle, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  selectedMonthTitle: { ...typeStyles.label, color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily },
  selectedMonthText: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  liveStatus: { minHeight: 28, paddingHorizontal: 9, borderRadius: 999, backgroundColor: adminPalette.successSubtle, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: adminPalette.success },
  liveStatusText: { ...typeStyles.caption, color: adminPalette.success, fontFamily: typeStyles.button.fontFamily },
  provisionTotal: { marginTop: 14, borderRadius: 14, backgroundColor: adminPalette.brandSubtle, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  provisionTotalLabel: { ...typeStyles.bodyCompact, color: adminPalette.text, fontFamily: typeStyles.cardTitle.fontFamily },
  provisionTotalHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  provisionTotalValue: { ...typeStyles.metric, color: adminPalette.brand },
  yearField: { minWidth: 210 },
  yearFieldFull: { width: "100%" },
  yearLabel: { ...typeStyles.label, color: adminPalette.textSecondary, marginBottom: 6 },
  yearButton: { minHeight: 48, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: adminPalette.border, backgroundColor: adminPalette.surface, flexDirection: "row", alignItems: "center", gap: 9 },
  yearButtonText: { ...typeStyles.bodyCompact, color: adminPalette.text, flex: 1, fontFamily: typeStyles.cardTitle.fontFamily },
  backdrop: { flex: 1, backgroundColor: "rgba(17, 24, 39, 0.38)", alignItems: "center", justifyContent: "center", padding: 18 },
  menu: { width: "100%", maxWidth: 420, maxHeight: "80%", backgroundColor: adminPalette.surface, borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuHeader: { minHeight: 68, paddingLeft: 18, paddingRight: 10, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border },
  menuHeaderCopy: { flex: 1 },
  menuTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  menuHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  closeButton: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionList: { padding: 8 },
  yearOption: { minHeight: 58, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  yearOptionSelected: { backgroundColor: adminPalette.brandSubtle },
  optionCopy: { flex: 1 },
  optionTitle: { ...typeStyles.bodyCompact, color: adminPalette.text, fontFamily: typeStyles.cardTitle.fontFamily },
  optionTitleSelected: { color: adminPalette.brand },
  optionHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
