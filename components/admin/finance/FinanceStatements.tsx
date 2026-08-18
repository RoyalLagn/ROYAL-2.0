import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import type { FinanceTaxRecord } from "@/types/adminFinance";
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
  const [view, setView] = useState<"yearly" | "monthly">("yearly");
  return <View style={styles.stack}>
    <View accessibilityRole="tablist" style={styles.viewSwitch}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "yearly" }} onPress={() => setView("yearly")} style={({ pressed }) => [styles.viewTab, view === "yearly" && styles.viewTabActive, pressed && styles.pressed]}><Text style={[styles.viewTabText, view === "yearly" && styles.viewTabTextActive]}>Yearly Tax</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: view === "monthly" }} onPress={() => setView("monthly")} style={({ pressed }) => [styles.viewTab, view === "monthly" && styles.viewTabActive, pressed && styles.pressed]}><Text style={[styles.viewTabText, view === "monthly" && styles.viewTabTextActive]}>Monthly Tax Estimate</Text></Pressable>
    </View>
    {view === "yearly" ? <FinanceTaxProvision /> : <FinanceMonthlyTaxEstimate />}
  </View>;
}

const styles = StyleSheet.create({ stack: { gap: 14 }, viewSwitch: { flexDirection: "row", gap: 6, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, padding: 4, alignSelf: "flex-start" }, viewTab: { minHeight: 42, borderRadius: 11, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }, viewTabActive: { backgroundColor: adminPalette.surface, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }, viewTabText: { ...typeStyles.tab, color: adminPalette.textSecondary }, viewTabTextActive: { color: adminPalette.brand }, pressed: { opacity: 0.85 } });
