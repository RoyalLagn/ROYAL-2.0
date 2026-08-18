import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Calculator, ChevronLeft, ChevronRight, Download, Landmark, LayoutDashboard, ReceiptText, RefreshCw, Scale, ShieldCheck } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminFinanceService } from "@/services/adminFinanceService";
import type { FinanceMonthData, FinanceTab } from "@/types/adminFinance";
import { adminLightTheme, adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { FinanceButton, FinanceLoading, FinanceNotice, FinanceSection } from "@/components/admin/finance/FinanceUI";
import { FinanceOverview } from "@/components/admin/finance/FinanceOverview";
import { FinanceRevenueDashboard } from "@/components/admin/finance/FinanceRevenueDashboard";
import { FinanceTransactions } from "@/components/admin/finance/FinanceTransactions";
import { FinanceBudgets } from "@/components/admin/finance/FinanceBudgets";
import { FinanceTaxes } from "@/components/admin/finance/FinanceStatements";
import { FinanceForecast } from "@/components/admin/finance/FinanceForecast";
import { FinanceReports } from "@/components/admin/finance/FinanceReports";
import { DateField } from "@/components/admin/crm/ui/DateField";

/*
THESIS: Finance is a traceable monthly command ledger, not a collage of vanity metrics.
OWN-WORLD: RoyalLagn's neutral admin canvas, ruled white statement surfaces, Inter typography, and bridal-pink actions.
STORY: Select a month, understand financial health, inspect its sources, make an authorized entry, and close the record.
FIRST VIEWPORT: Page heading and month control lead into a section rail beside a compact financial statement canvas.
FORM: Financial command ledger, assigned structure 7, seed 152faaa5.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
*/

const tabs: { key: FinanceTab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "revenue", label: "Revenue", icon: Landmark },
  { key: "expenses", label: "Expenses", icon: ReceiptText },
  { key: "taxes", label: "Taxes", icon: ShieldCheck },
  { key: "budgets", label: "Budgets", icon: Scale },
  { key: "forecast", label: "Forecast", icon: Calculator },
  { key: "reports", label: "Reports", icon: Download },
];

export default function AdminFinance() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const phone = width < 600;
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<FinanceMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try { setData(await AdminFinanceService.loadMonth(month)); setLastSyncedAt(new Date().toISOString()); }
    catch (cause) { setError(financeError(cause)); }
    finally { setLoading(false); setRefreshing(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => AdminFinanceService.subscribe(() => void load(true)), [load]);

  const periodLabel = useMemo(() => new Date(`${month}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }), [month]);
  const moveMonth = (offset: number) => { const next = new Date(`${month}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + offset); const value = next.toISOString().slice(0, 7); setMonth(`${value}-01`); };
  const chooseFinanceDate = (value: string) => { setMonth(`${value.slice(0, 7)}-01`); setError(null); };
  const content = data ? tab === "overview" ? <FinanceOverview data={data} /> : tab === "revenue" ? <FinanceRevenueDashboard data={data} onChanged={load} lastSyncedAt={lastSyncedAt} syncing={refreshing} onSync={() => void load(true)} /> : tab === "expenses" ? <FinanceTransactions data={data} direction="expense" onChanged={load} /> : tab === "budgets" ? <FinanceBudgets key={`budgets-${data.monthStart}-${data.budget?.id ?? "none"}`} data={data} onChanged={load} /> : tab === "taxes" ? <FinanceTaxes /> : tab === "forecast" ? <FinanceForecast data={data} onChanged={load} /> : <FinanceReports data={data} onChanged={load} /> : error && !loading ? <FinanceSection title="Finance setup pending" description="This workspace is not connected to its finance records yet."><Text style={styles.setupText}>Refresh after the finance database setup is completed. If this message remains, contact your platform administrator before recording financial activity elsewhere.</Text><View style={styles.setupActions}><FinanceButton label="Try again" onPress={() => void load(true)} /><FinanceButton label="Open Help & Support" variant="secondary" onPress={() => router.push("/AdminHelp")} /></View></FinanceSection> : null;

  return <SafeAreaView style={[styles.page, adminLightTheme]} edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={adminPalette.brand} />} contentContainerStyle={styles.scroll}>
      <ResponsiveContainer style={styles.container}>
        <AdminPageHeader title="Finance" subtitle="Actual revenue, expenses, budgets, profitability, tax provisions and founder planning" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh finance" accessibilityState={{ busy: refreshing }} onPress={() => void load(true)} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}><RefreshCw size={19} color={adminPalette.brand} /></Pressable>} />
        <View style={[styles.periodBar, phone && styles.periodBarPhone, { zIndex: 20 }]}>
          <View style={styles.periodNavigation}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><ChevronLeft size={19} color={adminPalette.text} /></Pressable>
            <View style={styles.periodCopy}><Text style={styles.periodLabel}>{periodLabel}</Text><Text style={styles.periodHint}>{data?.closure?.status === "closed" ? "Closed financial period" : "Open financial period"}</Text></View>
            {phone ? <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><ChevronRight size={19} color={adminPalette.text} /></Pressable> : null}
          </View>
          <View style={[styles.monthEntry, phone && styles.monthEntryPhone]}><DateField label="Finance month" value={month} displayValue={periodLabel} onChange={chooseFinanceDate} hideLabel /></View>
          {!phone ? <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><ChevronRight size={19} color={adminPalette.text} /></Pressable> : null}
        </View>
        {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}
        <View style={desktop ? styles.workspace : styles.mobileWorkspace}>
          {desktop ? <View accessibilityRole="tablist" style={styles.rail}>{tabs.map((item) => <FinanceTabButton key={item.key} item={item} active={tab === item.key} onPress={() => setTab(item.key)} />)}</View> : <ScrollView accessibilityRole="tablist" horizontal showsHorizontalScrollIndicator={false} style={styles.mobileTabsScroller} contentContainerStyle={styles.mobileTabs}>{tabs.map((item) => <FinanceTabButton key={item.key} item={item} active={tab === item.key} onPress={() => setTab(item.key)} compact />)}</ScrollView>}
          <View style={styles.main}>{loading && !data ? <FinanceLoading /> : content}</View>
        </View>
      </ResponsiveContainer>
    </ScrollView>
    <AdminFooter activeTab="finance" />
  </SafeAreaView>;
}

function FinanceTabButton({ item, active, onPress, compact }: { item: (typeof tabs)[number]; active: boolean; onPress: () => void; compact?: boolean }) { const Icon = item.icon; return <Pressable accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.tab, compact && styles.tabCompact, active && styles.tabActive, pressed && styles.pressed]}><Icon size={17} color={active ? adminPalette.brand : adminPalette.textSecondary} /><Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text></Pressable>; }
function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; }
function financeError(cause: unknown) { const message = cause instanceof Error ? cause.message : cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause ?? ""); return /finance_categories|schema cache|relation.*finance_/i.test(message) ? "Finance setup is still pending. No financial records were changed." : message || "Unable to load finance records. Check your connection and try again."; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: adminPalette.canvas }, scroll: { paddingBottom: 120 }, container: { maxWidth: 1500, alignSelf: "center" }, refresh: { width: 48, height: 48, borderRadius: 14, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, alignItems: "center", justifyContent: "center" }, pressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  periodBar: { minHeight: 76, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }, periodBarPhone: { flexDirection: "column", alignItems: "stretch" }, periodNavigation: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }, monthButton: { width: 48, height: 48, borderRadius: 13, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, periodCopy: { flex: 1, minWidth: 0 }, periodLabel: { ...typeStyles.cardTitle, color: adminPalette.text }, periodHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, monthEntry: { width: 220 }, monthEntryPhone: { width: "100%" },
  workspace: { flexDirection: "row", alignItems: "flex-start", gap: 16 }, mobileWorkspace: { gap: 12 }, rail: { width: 188, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 8, gap: 3 }, mobileTabsScroller: { flexGrow: 0, height: 50 }, mobileTabs: { gap: 7, paddingBottom: 2 }, tab: { minHeight: 48, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 }, tabCompact: { paddingHorizontal: 13, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border }, tabActive: { backgroundColor: adminPalette.brandSubtle, borderColor: "#FBCFE8" }, tabText: { ...typeStyles.tab, color: adminPalette.textSecondary }, tabTextActive: { color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily }, main: { flex: 1, minWidth: 0, gap: 14 }, setupText: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary, maxWidth: 680 }, setupActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
