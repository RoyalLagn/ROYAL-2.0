import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CalendarRange, Check, ChevronDown, X } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import type { FinanceTaxRecord } from "@/types/adminFinance";
import { financialYearLabel, financialYearOptions, financialYearStartFor } from "@/services/adminFinanceService";
import { FinanceTaxProvision } from "./FinanceTaxProvision";
import { FinanceMonthlyTaxEstimate } from "./FinanceMonthlyTaxEstimate";

// Single source of truth for tax_type labels — reused by the Revenue
// dashboard's Tax Summary card so both screens describe the same
// finance_tax_records rows identically.
export const taxLabels: Record<FinanceTaxRecord["tax_type"], string> = { gst_collected: "GST collected", gst_input_credit: "GST input credit", gst_paid: "GST paid", income_tax_provision: "Income tax provision", income_tax_paid: "Income tax paid", other_provision: "Other tax provision" };

// The Taxes tab holds two clearly separate views: the authoritative Yearly
// Tax model, and a Monthly Tax Estimate management/provisioning view that
// never feeds back into it (see FinanceMonthlyTaxEstimate). No monthly GST /
// income-tax-provision / income-tax-paid / other-provision inputs live here
// any more. finance_tax_records and taxLabels above remain in place because
// the Revenue tab's "Tax summary" card and the monthly Overview "Estimated
// tax provision" figure still read that table — this tab simply no longer
// writes or displays it.
export function FinanceTaxes() {
  const { width } = useWindowDimensions();
  const phone = width < 600;
  const [view, setView] = useState<"yearly" | "monthly">("yearly");
  const [financialYearStart, setFinancialYearStart] = useState(() => financialYearStartFor(new Date()));
  const yearOptions = useMemo(() => financialYearOptions(), []);
  return <View style={styles.stack}>
    <View style={styles.toolbar}>
      <View accessibilityRole="tablist" style={[styles.viewSwitch, phone && styles.viewSwitchPhone]}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "yearly" }} onPress={() => setView("yearly")} style={({ pressed }) => [styles.viewTab, phone && styles.viewTabPhone, view === "yearly" && styles.viewTabActive, pressed && styles.pressed]}><Text style={[styles.viewTabText, view === "yearly" && styles.viewTabTextActive]}>Yearly Tax</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "monthly" }} onPress={() => setView("monthly")} style={({ pressed }) => [styles.viewTab, phone && styles.viewTabPhone, view === "monthly" && styles.viewTabActive, pressed && styles.pressed]}><Text style={[styles.viewTabText, view === "monthly" && styles.viewTabTextActive]}>Monthly Tax Estimate</Text></Pressable>
      </View>
      <FinancialYearSelect value={financialYearStart} options={yearOptions} onChange={setFinancialYearStart} fullWidth={phone} />
    </View>
    {view === "yearly" ? <FinanceTaxProvision financialYearStart={financialYearStart} /> : <FinanceMonthlyTaxEstimate financialYearStart={financialYearStart} />}
  </View>;
}

function FinancialYearSelect({ value, options, onChange, fullWidth }: { value: string; options: string[]; onChange: (value: string) => void; fullWidth?: boolean }) {
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
  viewSwitch: { flexDirection: "row", gap: 6, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, padding: 4, alignSelf: "flex-start" },
  viewSwitchPhone: { alignSelf: "stretch" },
  viewTab: { minHeight: 48, borderRadius: 11, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  viewTabPhone: { flex: 1, paddingHorizontal: 10 },
  viewTabActive: { backgroundColor: adminPalette.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  viewTabText: { ...typeStyles.tab, color: adminPalette.textSecondary },
  viewTabTextActive: { color: adminPalette.brand },
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
