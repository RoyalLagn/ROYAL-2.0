import React, { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Download, LockKeyhole, RotateCcw } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, summarizeFinance } from "@/services/adminFinanceService";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { FinanceMonthData } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

const checks = [
  ["revenue_recorded", "All revenue recorded"], ["expenses_recorded", "All expenses recorded"], ["fees_recorded", "Payment gateway fees recorded"], ["cloudinary_recorded", "Cloudinary cost reviewed"], ["marketing_recorded", "Marketing expenses recorded"], ["refunds_recorded", "Refunds and adjustments reviewed"], ["tax_reviewed", "Estimated tax provision reviewed"],
] as const;

export function FinanceReports({ data, onChanged }: { data: FinanceMonthData; onChanged: () => Promise<void> }) {
  const { identity } = useAdminAuth();
  const canReopen = identity?.profile.role === "super_admin";
  const [checklist, setChecklist] = useState<Record<string, boolean>>(data.closure?.checklist ?? {});
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const summary = summarizeFinance(data);
  const closed = data.closure?.status === "closed";
  const allChecked = checks.every(([key]) => checklist[key]);
  const close = () => Alert.alert("Close this finance month?", "Closing protects its ledger from accidental changes. Verify the report before continuing.", [{ text: "Cancel", style: "cancel" }, { text: "Close month", onPress: () => void run(async () => { await AdminFinanceService.closeMonth(data.monthStart, checklist); setMessage({ text: "Finance month closed and protected.", tone: "success" }); }) }]);
  const reopen = () => {
    if (reason.trim().length < 8) return setMessage({ text: "Enter a correction reason of at least 8 characters.", tone: "error" });
    Alert.alert("Reopen this month?", "Only use this for an authorized correction. The reason will remain in the monthly record.", [{ text: "Cancel", style: "cancel" }, { text: "Reopen", style: "destructive", onPress: () => void run(async () => { await AdminFinanceService.reopenMonth(data.monthStart, reason); setReason(""); setMessage({ text: "Finance month reopened for correction.", tone: "success" }); }) }]);
  };
  const run = async (operation: () => Promise<void>) => { setWorking(true); setMessage(null); try { await operation(); await onChanged(); } catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "The finance action could not be completed.", tone: "error" }); } finally { setWorking(false); } };

  return <View style={styles.stack}>
    {message ? <FinanceNotice tone={message.tone}>{message.text}</FinanceNotice> : null}
    <FinanceSection title="Monthly financial report" description="A portable summary based on the selected month’s actual ledger and saved provisions." action={<FinanceButton label="Export CSV" icon={Download} variant="secondary" onPress={() => void AdminFinanceService.exportCsv(data).catch((cause) => setMessage({ text: cause instanceof Error ? cause.message : "Unable to export the report.", tone: "error" }))} />}>
      <View style={styles.report}><ReportLine label="Net revenue" value={summary.netRevenue} /><ReportLine label="Expenses" value={summary.expenses} /><ReportLine label="Profit before tax" value={summary.profitBeforeTax} strong /><ReportLine label="Estimated tax provision" value={summary.estimatedTax} /><ReportLine label="Net profit" value={summary.netProfit} strong /></View>
      <Text style={styles.reportMeta}>{data.transactions.length} ledger records · {data.taxes.length} tax records · {data.budgetItems.length} budget categories</Text>
    </FinanceSection>

    <FinanceSection title="Monthly closing" description="Complete the operating checks, review the report, and then lock the month against accidental changes.">
      {closed ? <>
        <FinanceNotice tone="success">Closed {data.closure?.closed_at ? new Date(data.closure.closed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "successfully"}. The saved snapshot remains available for audit.</FinanceNotice>
        {canReopen ? <><FinanceField label="Authorized correction reason" value={reason} onChangeText={setReason} multiline placeholder="Explain why this closed month must be corrected" /><FinanceButton label={working ? "Reopening…" : "Reopen for correction"} icon={RotateCcw} variant="danger" onPress={reopen} disabled={working} /></> : <FinanceNotice tone="info">Only a super administrator can reopen a closed finance month. Contact one with the correction reason.</FinanceNotice>}
      </> : <>
        <View>{checks.map(([key, label], index) => <View key={key} style={[styles.check, index > 0 && styles.rowBorder]}><View style={styles.flex}><Text style={styles.checkTitle}>{label}</Text><Text style={styles.checkHint}>Confirm this against the ledger and source records.</Text></View><Switch accessibilityLabel={label} value={!!checklist[key]} onValueChange={(value) => setChecklist((current) => ({ ...current, [key]: value }))} trackColor={{ false: adminPalette.border, true: "#86EFAC" }} thumbColor={checklist[key] ? adminPalette.success : "#FFF"} /></View>)}</View>
        <FinanceButton label={working ? "Closing month…" : "Close finance month"} icon={LockKeyhole} onPress={close} disabled={!allChecked || working} accessibilityHint={allChecked ? "Locks this month against changes" : "Complete all checks first"} />
      </>}
    </FinanceSection>
  </View>;
}

function ReportLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) { return <View style={[styles.line, strong && styles.strongLine]}><Text style={[styles.lineLabel, strong && styles.strongText]}>{label}</Text><Text style={[styles.lineValue, strong && styles.strongText, value < 0 && { color: adminPalette.error }]}>{formatMoney(value)}</Text></View>; }

const styles = StyleSheet.create({ stack: { gap: 14 }, report: { backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }, line: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, strongLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, lineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary }, lineValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"] }, strongText: { fontFamily: typeStyles.cardTitle.fontFamily, color: adminPalette.text }, reportMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, textAlign: "right" }, check: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, flex: { flex: 1, minWidth: 0 }, checkTitle: { ...typeStyles.label, color: adminPalette.text }, checkHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 } });
