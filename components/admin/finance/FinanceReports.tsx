import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Download, Landmark, ReceiptText, WalletCards } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, summarizeFinance } from "@/services/adminFinanceService";
import type { FinanceMonthData } from "@/types/adminFinance";
import { FinanceButton, FinanceMetric, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

/**
 * Reports use the month selected in Finance's calendar. The figures are based
 * on recorded ledger rows, and subscription payments remain traceable through
 * their immutable source field.
 */
export function FinanceReports({ data }: { data: FinanceMonthData }) {
  const [message, setMessage] = useState<string | null>(null);
  const summary = summarizeFinance(data);
  const subscription = useMemo(() => {
    const rows = data.transactions.filter((item) => item.status === "recorded" && item.direction === "revenue" && item.source === "subscription_payment");
    const gross = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const fees = rows.reduce((sum, item) => sum + Number(item.gateway_fee || 0), 0);
    return { rows, gross, fees };
  }, [data.transactions]);

  const exportReport = async () => {
    setMessage(null);
    try {
      await AdminFinanceService.exportExcel(data);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to export the finance report.");
    }
  };

  return <View style={styles.stack}>
    {message ? <FinanceNotice tone="error">{message}</FinanceNotice> : null}
    <FinanceSection
      title="Finance report"
      description="The calendar above chooses this report period. Download the selected month with its summary and source records."
      action={<FinanceButton label="Download Excel" icon={Download} variant="secondary" onPress={() => void exportReport()} accessibilityHint="Downloads the selected finance report as an Excel workbook" />}
    >
      <View style={styles.metrics}>
        <FinanceMetric label="Subscription revenue" value={formatMoney(subscription.gross, true)} hint={`${subscription.rows.length} verified payment${subscription.rows.length === 1 ? "" : "s"}`} icon={WalletCards} />
        <FinanceMetric label="Gateway fees" value={formatMoney(subscription.fees, true)} hint="Captured on subscription payments" tone="warning" />
        <FinanceMetric label="Net revenue" value={formatMoney(summary.netRevenue, true)} hint="All recorded revenue after fees" tone="positive" icon={Landmark} />
        <FinanceMetric label="Recorded expenses" value={formatMoney(summary.expenses, true)} hint="Selected month expenses" icon={ReceiptText} />
      </View>
    </FinanceSection>

    <FinanceSection title="Profit summary" description="Actual ledger amounts with the selected month’s estimated tax provision.">
      <View style={styles.statement}>
        <ReportLine label="Gross revenue" value={summary.grossRevenue} />
        <ReportLine label="Gateway fees" value={summary.gatewayFees} />
        <ReportLine label="Net revenue" value={summary.netRevenue} strong />
        <ReportLine label="Recorded expenses" value={summary.expenses} />
        <ReportLine label="Profit before tax" value={summary.profitBeforeTax} strong />
        <ReportLine label="Estimated tax provision" value={summary.estimatedTax} />
        <ReportLine label="Net profit" value={summary.netProfit} strong />
      </View>
      <Text style={styles.meta}>{data.transactions.filter((item) => item.status === "recorded").length} recorded ledger entries · {data.taxes.length} tax records · {data.budgetItems.length} budget categories</Text>
    </FinanceSection>
  </View>;
}

function ReportLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return <View style={[styles.line, strong && styles.strongLine]}>
    <Text style={[styles.lineLabel, strong && styles.strongText]}>{label}</Text>
    <Text style={[styles.lineValue, strong && styles.strongText, value < 0 && { color: adminPalette.error }]}>{formatMoney(value)}</Text>
  </View>;
}

const styles = {
  stack: { gap: 14 },
  metrics: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 12 },
  statement: { backgroundColor: adminPalette.surfaceSubtle, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  line: { minHeight: 42, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 12 },
  strongLine: { borderTopWidth: 1, borderTopColor: adminPalette.border },
  lineLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary },
  lineValue: { ...typeStyles.bodyCompact, color: adminPalette.text },
  strongText: { fontFamily: typeStyles.cardTitle.fontFamily, color: adminPalette.text },
  meta: { ...typeStyles.caption, color: adminPalette.textSecondary, textAlign: "right" as const },
};
