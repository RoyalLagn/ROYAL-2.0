import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { ArrowDownUp, CirclePlus, CreditCard, Landmark, Pencil, Percent, ReceiptText, RefreshCw, Search, Trash2, TrendingUp, Wallet, X } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, computePartnershipTax, financialYearStartFor, signedTransactionAmount, summarizeFinance } from "@/services/adminFinanceService";
import type { FinanceMonthData, FinanceRevenueTrendPoint, FinanceTransaction, FinanceYearTaxData } from "@/types/adminFinance";
import { FinanceButton, FinanceEmpty, FinanceField, FinanceMetric, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";
import AdminChart from "@/components/admin/revenue/AdminChart";

const PAGE_SIZE = 15;

type Draft = { id?: string; occurred_on: string; category_id: string; amount: string; counterparty: string; reference_number: string; payment_method: string; notes: string; is_recurring: boolean };
type StatusFilter = "all" | "verified" | "manual" | "void";
type SortKey = "date" | "amount";
type TrendRangeKey = "today" | "last7" | "thisMonth" | "lastMonth" | "thisYear" | "custom";

const trendRanges: { key: TrendRangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
  { key: "custom", label: "Custom" },
];

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "manual", label: "Manual" },
  { key: "void", label: "Void" },
];

export function FinanceRevenueDashboard({ data, allMonths, lastSyncedAt, syncing, onSync, onViewTaxes }: { data: FinanceMonthData; allMonths: boolean; lastSyncedAt: string | null; syncing: boolean; onSync: () => void; onViewTaxes: () => void }) {
  const summary = useMemo(() => summarizeFinance(data), [data]);
  const [yearTaxData, setYearTaxData] = useState<FinanceYearTaxData | null>(null);
  const financialYearStart = useMemo(() => financialYearStartFor(data.monthStart), [data.monthStart]);
  useEffect(() => { let cancelled = false; AdminFinanceService.loadYearTaxProvision(financialYearStart).then((result) => { if (!cancelled) setYearTaxData(result); }).catch(() => { if (!cancelled) setYearTaxData(null); }); return () => { cancelled = true; }; }, [financialYearStart]);
  const yearlyTax = yearTaxData ? computePartnershipTax(yearTaxData.annualRevenue - yearTaxData.annualExpenses) : null;
  const displayedRevenue = allMonths ? yearTaxData?.annualRevenue ?? 0 : summary.grossRevenue;
  const displayedExpenses = allMonths ? yearTaxData?.annualExpenses ?? 0 : summary.expenses;
  const periodProfitBeforeTax = displayedRevenue - displayedExpenses;
  const hasPeriodActivity = displayedRevenue !== 0 || displayedExpenses !== 0;
  const displayedTax = hasPeriodActivity ? yearlyTax?.estimatedTotalTax ?? 0 : 0;

  return <View style={styles.stack}>
    <View style={styles.lastSynced}><RefreshCw size={16} color={adminPalette.brand} /><Text style={styles.syncValue}>{syncing ? "Syncing…" : lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Last synced: not yet available"}</Text></View>
    <View style={styles.kpiGrid}>
      <FinanceMetric label="Gross Revenue" value={formatMoney(displayedRevenue)} hint={allMonths ? "Full financial year revenue" : "Total successful payments"} icon={Landmark} />
      <FinanceMetric label="Total Expenses" value={formatMoney(displayedExpenses)} hint={allMonths ? "Full financial year expenses" : "Operating expenses"} icon={CreditCard} />
      <FinanceMetric label="Profit Before Tax" value={formatMoney(periodProfitBeforeTax)} hint="Gross Revenue − Expenses" icon={TrendingUp} />
      <View style={styles.taxMetric}><View style={styles.taxMetricTop}><Text style={styles.taxMetricLabel}>Estimated Tax</Text><View style={styles.taxMetricIcon}><Percent size={18} color={adminPalette.brand} /></View></View><Text style={styles.taxMetricValue}>{yearTaxData ? formatMoney(displayedTax) : "—"}</Text><Text style={styles.taxMetricHint}>Yearly tax provision</Text><Pressable accessibilityRole="button" onPress={onViewTaxes} style={({ pressed }) => [styles.taxLink, pressed && styles.pressed]}><Text style={styles.taxLinkText}>View tax details →</Text></Pressable></View>
      <FinanceMetric label="Profit After Tax" value={yearTaxData ? formatMoney(hasPeriodActivity ? periodProfitBeforeTax - displayedTax : 0) : "—"} hint="Profit available after tax" icon={TrendingUp} tone="positive" />
    </View>

    <FinanceSection title="Performance summary" description="Key operating metrics for the selected financial period.">
      <View style={styles.kpiGrid}>
        <FinanceMetric label="Total Transactions" value={String(summary.successfulTransactionCount)} hint="Successful revenue transactions" icon={ReceiptText} />
        <FinanceMetric label="Average Revenue" value={formatMoney(summary.successfulTransactionCount ? summary.grossRevenue / summary.successfulTransactionCount : 0)} hint="Revenue per successful transaction" icon={Wallet} />
        <FinanceMetric label="Operating Margin" value={summary.grossRevenue > 0 ? `${((periodProfitBeforeTax / summary.grossRevenue) * 100).toFixed(1)}%` : "0%"} hint="Profit before tax ÷ gross revenue" icon={Percent} />
      </View>
    </FinanceSection>

    <RevenueTrend monthStart={data.monthStart} />

  </View>;
}


function RevenueTrend({ monthStart }: { monthStart: string }) {
  const [range, setRange] = useState<TrendRangeKey>("thisMonth");
  const [customStart, setCustomStart] = useState(monthStart);
  const [customEnd, setCustomEnd] = useState(monthStart);
  const [points, setPoints] = useState<FinanceRevenueTrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bounds = useMemo(() => computeTrendRange(range, customStart, customEnd), [range, customStart, customEnd]);

  useEffect(() => {
    let cancelled = false;
    if (!bounds) { setPoints(null); setLoading(false); return; }
    setLoading(true); setError(null);
    AdminFinanceService.loadRevenueTrend(bounds.start, bounds.end, bounds.bucket)
      .then((result) => { if (!cancelled) setPoints(result); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load the revenue trend."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bounds]);

  const labels = (points ?? []).map((point) => formatBucketLabel(point.bucketStart, bounds?.bucket ?? "day"));
  const hasData = (points ?? []).some((point) => point.transactionCount > 0);

  return <FinanceSection title="Revenue trend" description="Daily revenue for short periods, monthly totals for longer ones — computed server-side from the recorded ledger.">
    <View style={styles.chips}>{trendRanges.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: range === item.key }} onPress={() => setRange(item.key)} style={({ pressed }) => [styles.chip, range === item.key && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, range === item.key && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>
    {range === "custom" ? <View style={styles.fields}>
      <FinanceField label="Start date" value={customStart} onChangeText={setCustomStart} placeholder="YYYY-MM-DD" />
      <FinanceField label="End date" value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DD" />
    </View> : null}
    {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : range === "custom" && !bounds ? <FinanceNotice tone="warning">Enter a valid start and end date (YYYY-MM-DD, end on or after start).</FinanceNotice> : loading ? <View style={styles.trendLoading}><Text style={styles.trendLoadingText}>Loading trend…</Text></View> : !hasData ? <FinanceEmpty title="No revenue in this range" message="No verified or manually recorded revenue was found for the selected period." /> : <AdminChart type="line" labels={labels} currency datasets={[
      { label: "Gross revenue", data: (points ?? []).map((point) => point.gross) },
      { label: "Net revenue", data: (points ?? []).map((point) => point.net) },
    ]} />}
  </FinanceSection>;
}

export function RevenueLedger({ data, rows, closed, onChanged }: { data: FinanceMonthData; rows: FinanceTransaction[]; closed: boolean; onChanged: () => Promise<void> }) {
  const phone = useWindowDimensions().width < 700;
  const categories = data.categories.filter((item) => item.direction === "revenue");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (categoryFilter !== "all" && item.category_id !== categoryFilter) return false;
      if (statusFilter === "verified" && !(item.source === "subscription_payment" && item.status === "recorded")) return false;
      if (statusFilter === "manual" && item.source !== "manual") return false;
      if (statusFilter === "void" && item.status !== "void") return false;
      if (needle) {
        const haystack = `${item.counterparty ?? ""} ${item.reference_number ?? ""} ${item.finance_categories?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "amount") return (signedTransactionAmount(a) - signedTransactionAmount(b)) * direction;
      return (a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at)) * direction;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, categoryFilter, statusFilter, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => { if (sortKey === key) setSortDirection((current) => current === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection("desc"); } };

  const openNew = () => setEditor({ occurred_on: data.monthStart, category_id: categories[0]?.id ?? "", amount: "", counterparty: "", reference_number: "", payment_method: "Business bank account", notes: "", is_recurring: false });
  const openExisting = (item: FinanceTransaction) => { if (item.source !== "manual") return; setEditor({ id: item.id, occurred_on: item.occurred_on, category_id: item.category_id, amount: String(item.amount), counterparty: item.counterparty ?? "", reference_number: item.reference_number ?? "", payment_method: item.payment_method ?? "", notes: item.notes ?? "", is_recurring: item.is_recurring }); };
  const save = async () => {
    if (!editor) return;
    const amount = Number(editor.amount);
    if (!editor.category_id) return setError("Choose a revenue type.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editor.occurred_on)) return setError("Use date format YYYY-MM-DD.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter an amount greater than zero.");
    setSaving(true); setError(null);
    try { await AdminFinanceService.saveTransaction({ ...editor, direction: "revenue", amount }); setEditor(null); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save revenue record."); }
    finally { setSaving(false); }
  };
  const remove = (item: FinanceTransaction) => Alert.alert("Delete revenue record?", "This removes the manual ledger record. Verified payment records cannot be deleted here.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => void AdminFinanceService.deleteTransaction(item.id).then(onChanged).catch((cause) => Alert.alert("Unable to delete record", cause instanceof Error ? cause.message : "Please try again.")) },
  ]);

  return <FinanceSection title="Revenue ledger" description="Verified subscription receipts and manually recorded revenue, with search, filtering, sorting, and pagination." action={<FinanceButton label="Add revenue" icon={CirclePlus} onPress={openNew} disabled={closed} />}>
    {closed ? <FinanceNotice tone="success">This month is closed. Reopen it from Reports before making authorized corrections.</FinanceNotice> : null}

    <View style={styles.searchRow}><Search size={16} color={adminPalette.textMuted} /><TextInput accessibilityLabel="Search revenue ledger" value={search} onChangeText={setSearch} placeholder="Search customer, reference, or type…" placeholderTextColor={adminPalette.textMuted} style={styles.searchInput} /></View>
    <View style={styles.chips}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: categoryFilter === "all" }} onPress={() => setCategoryFilter("all")} style={({ pressed }) => [styles.chip, categoryFilter === "all" && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, categoryFilter === "all" && styles.chipTextSelected]}>All types</Text></Pressable>
      {categories.map((category) => <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ checked: categoryFilter === category.id }} onPress={() => setCategoryFilter(category.id)} style={({ pressed }) => [styles.chip, categoryFilter === category.id && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, categoryFilter === category.id && styles.chipTextSelected]}>{category.name}</Text></Pressable>)}
    </View>
    <View style={styles.chips}>{statusFilters.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ checked: statusFilter === item.key }} onPress={() => setStatusFilter(item.key)} style={({ pressed }) => [styles.chip, statusFilter === item.key && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, statusFilter === item.key && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>
    <View style={styles.sortRow}>
      <Pressable accessibilityRole="button" onPress={() => toggleSort("date")} style={styles.sortButton}><Text style={[styles.sortText, sortKey === "date" && styles.sortTextActive]}>Date</Text>{sortKey === "date" ? <ArrowDownUp size={13} color={adminPalette.brand} /> : null}</Pressable>
      <Pressable accessibilityRole="button" onPress={() => toggleSort("amount")} style={styles.sortButton}><Text style={[styles.sortText, sortKey === "amount" && styles.sortTextActive]}>Amount</Text>{sortKey === "amount" ? <ArrowDownUp size={13} color={adminPalette.brand} /> : null}</Pressable>
      <Text style={styles.resultCount}>{sorted.length} record{sorted.length === 1 ? "" : "s"}</Text>
    </View>

    {!sorted.length ? <FinanceEmpty title="No matching revenue records" message="Adjust the search or filters to see more results." /> : <View style={styles.list}>
      {pageRows.map((item, index) => {
        const category = item.finance_categories?.name || categories.find((c) => c.id === item.category_id)?.name || "Uncategorized";
        const editable = item.source === "manual" && !closed;
        const statusLabel = item.status === "void" ? "Void" : item.source === "subscription_payment" ? "Verified" : item.source === "refund" ? "Refund" : "Manual";
        const gross = signedTransactionAmount(item);
        const feeKnown = item.source === "manual" ? true : item.gateway_fee_captured;
        const taxKnown = item.source === "manual";
        const net = feeKnown ? gross - item.gateway_fee - (taxKnown ? item.tax_amount : 0) : null;
        return <View key={item.id} style={[styles.row, phone && styles.rowPhone, index > 0 && styles.rowBorder, item.status === "void" && styles.voidRow]}>
          <View style={styles.dateBlock}><Text style={styles.dateDay}>{new Date(`${item.occurred_on}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" })}</Text><Text style={styles.dateMonth}>{new Date(`${item.occurred_on}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</Text></View>
          <View style={styles.flex}>
            <View style={styles.titleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item.counterparty || category}</Text><Text style={[styles.statusBadge, statusLabel === "Verified" && styles.statusVerified]}>{statusLabel}</Text></View>
            <Text style={styles.meta}>{category}{item.reference_number ? ` · Txn ${item.reference_number}` : ""}</Text>
            <Text style={styles.meta}>Tax: {taxKnown ? formatMoney(item.tax_amount) : "Not recorded"} · Fee: {feeKnown ? formatMoney(item.gateway_fee) : "Unavailable"} · Net: {net == null ? "—" : formatMoney(net)}</Text>
          </View>
          <View style={[styles.amountBlock, phone && styles.amountBlockPhone]}><Text style={[styles.amount, { color: item.source === "refund" ? adminPalette.error : adminPalette.success }]}>{formatMoney(gross)}</Text></View>
          {editable ? <View style={[styles.actions, phone && styles.actionsPhone]}><Pressable accessibilityRole="button" accessibilityLabel="Edit revenue record" onPress={() => openExisting(item)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Pencil size={16} color={adminPalette.brand} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete revenue record" onPress={() => remove(item)} style={({ pressed }) => [styles.iconButton, styles.deleteButton, pressed && styles.pressed]}><Trash2 size={16} color={adminPalette.error} /></Pressable></View> : null}
        </View>;
      })}
    </View>}

    {sorted.length > PAGE_SIZE ? <View style={styles.pagination}>
      <FinanceButton label="Previous" variant="secondary" onPress={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} />
      <Text style={styles.pageLabel}>Page {currentPage + 1} of {pageCount}</Text>
      <FinanceButton label="Next" variant="secondary" onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={currentPage >= pageCount - 1} />
    </View> : null}

    <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => !saving && setEditor(null)}>
      <View style={styles.backdrop}><Pressable accessibilityLabel="Close editor" style={StyleSheet.absoluteFill} onPress={() => !saving && setEditor(null)} /><View accessibilityViewIsModal style={styles.modal}>
        <View style={styles.modalHeader}><View style={styles.flex}><Text style={styles.modalTitle}>{editor?.id ? "Edit revenue" : "Add revenue"}</Text><Text style={styles.modalHint}>Record the actual transaction amount. Do not enter forecasts here.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => !saving && setEditor(null)} style={styles.close}><X size={19} color={adminPalette.textSecondary} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}
          <View><Text style={styles.label}>Revenue type</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categories.map((category) => <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ checked: editor?.category_id === category.id }} onPress={() => setEditor((current) => current ? { ...current, category_id: category.id } : current)} style={({ pressed }) => [styles.chip, editor?.category_id === category.id && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, editor?.category_id === category.id && styles.chipTextSelected]}>{category.name}</Text></Pressable>)}</ScrollView></View>
          <View style={styles.fields}><FinanceField label="Date" value={editor?.occurred_on ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, occurred_on: value } : current)} placeholder="YYYY-MM-DD" /><FinanceField label="Amount" value={editor?.amount ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, amount: value } : current)} keyboardType="decimal-pad" placeholder="0.00" /></View>
          <View style={styles.fields}><FinanceField label="Customer / source" value={editor?.counterparty ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, counterparty: value } : current)} placeholder="Customer or source" /><FinanceField label="Reference number" value={editor?.reference_number ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, reference_number: value } : current)} placeholder="Optional reference" /></View>
          <FinanceField label="Payment method" value={editor?.payment_method ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, payment_method: value } : current)} placeholder="Business bank account" />
          <FinanceField label="Notes" value={editor?.notes ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, notes: value } : current)} placeholder="What was this transaction for?" multiline />
          <View style={styles.toggle}><View style={styles.flex}><Text style={styles.toggleTitle}>Recurring transaction</Text><Text style={styles.toggleHint}>Marks the record for review next month; it does not create future revenue automatically.</Text></View><Switch value={editor?.is_recurring ?? false} onValueChange={(value) => setEditor((current) => current ? { ...current, is_recurring: value } : current)} trackColor={{ false: adminPalette.border, true: "#F9A8D4" }} thumbColor={editor?.is_recurring ? adminPalette.brand : "#FFF"} /></View>
          <FinanceButton label={saving ? "Saving…" : "Save revenue"} onPress={() => void save()} disabled={saving} />
        </ScrollView>
      </View></View>
    </Modal>
  </FinanceSection>;
}

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function addDaysIso(iso: string, days: number) { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return isoDate(date); }
function startOfCalendarMonthIso(iso: string) { const date = new Date(`${iso}T00:00:00Z`); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`; }
function daysBetween(startIso: string, endIso: string) { return Math.round((new Date(`${endIso}T00:00:00Z`).getTime() - new Date(`${startIso}T00:00:00Z`).getTime()) / 86400000); }

function computeTrendRange(range: TrendRangeKey, customStart: string, customEnd: string): { start: string; end: string; bucket: "day" | "month" } | null {
  const today = isoDate(new Date());
  let start: string; let end: string;
  if (range === "today") { start = today; end = addDaysIso(today, 1); }
  else if (range === "last7") { start = addDaysIso(today, -6); end = addDaysIso(today, 1); }
  else if (range === "thisMonth") { start = startOfCalendarMonthIso(today); end = addDaysIso(today, 1); }
  else if (range === "lastMonth") { end = startOfCalendarMonthIso(today); start = startOfCalendarMonthIso(addDaysIso(end, -1)); }
  else if (range === "thisYear") { start = `${today.slice(0, 4)}-01-01`; end = addDaysIso(today, 1); }
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) return null;
    if (customEnd < customStart) return null;
    start = customStart; end = addDaysIso(customEnd, 1);
  }
  const bucket: "day" | "month" = daysBetween(start, end) <= 45 ? "day" : "month";
  return { start, end, bucket };
}

function formatBucketLabel(bucketStart: string, bucket: "day" | "month") {
  const date = new Date(`${bucketStart}T00:00:00Z`);
  return bucket === "day" ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }) : date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

const styles = StyleSheet.create({
  stack: { gap: 14 }, flex: { flex: 1, minWidth: 0 }, columns: { flexDirection: "row", alignItems: "flex-start", gap: 14 }, column: { flex: 1, minWidth: 0 },
  syncBar: { minHeight: 68, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  syncLabel: { ...typeStyles.label, color: adminPalette.textSecondary }, syncValue: { ...typeStyles.bodyCompact, color: adminPalette.text, marginTop: 2 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  lastSynced: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: adminPalette.border, backgroundColor: adminPalette.surface, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  taxMetric: { flex: 1, minWidth: 190, minHeight: 126, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16 },
  taxMetricTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, taxMetricLabel: { ...typeStyles.label, color: adminPalette.text }, taxMetricIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" }, taxMetricValue: { ...typeStyles.metric, color: adminPalette.text, marginTop: 8, fontVariant: ["tabular-nums"] }, taxMetricHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 4 },
  taxLink: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 12, backgroundColor: adminPalette.brandSubtle },
  viewAllLink: { minHeight: 40, justifyContent: "center", paddingHorizontal: 8 },
  taxLinkText: { ...typeStyles.button, color: adminPalette.brand },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { minHeight: 44, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, chipSelected: { backgroundColor: adminPalette.brand }, chipText: { ...typeStyles.caption, color: adminPalette.textSecondary }, chipTextSelected: { color: "#FFF" }, pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  trendLoading: { minHeight: 120, alignItems: "center", justifyContent: "center" }, trendLoadingText: { ...typeStyles.metadata, color: adminPalette.textSecondary },
  sourceList: { gap: 0 }, sourceRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, sourceTitle: { ...typeStyles.label, color: adminPalette.text }, sourceMeta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, sourceTrack: { height: 5, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, overflow: "hidden", marginTop: 6 }, sourceFill: { height: "100%", backgroundColor: adminPalette.brand, borderRadius: 999 }, sourceAmount: { ...typeStyles.cardTitle, color: adminPalette.text },
  taxGrid: { gap: 0 }, taxRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }, taxRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, taxLabel: { ...typeStyles.bodyCompact, color: adminPalette.textSecondary }, taxHint: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 2, maxWidth: 260 }, taxValue: { ...typeStyles.bodyCompact, color: adminPalette.text, fontVariant: ["tabular-nums"] },
  transactionTable: { minWidth: 1040, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 12, overflow: "hidden" }, transactionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border, backgroundColor: adminPalette.surface }, transactionHeader: { backgroundColor: adminPalette.surfaceSubtle }, transactionCell: { width: 130, paddingHorizontal: 12, ...typeStyles.caption, color: adminPalette.text, fontVariant: ["tabular-nums"] }, successText: { color: adminPalette.success, fontFamily: typeStyles.button.fontFamily },
  searchRow: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: adminPalette.border, backgroundColor: adminPalette.surface, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13 }, searchInput: { ...typeStyles.bodyCompact, flex: 1, color: adminPalette.text },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 16 }, sortButton: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 }, sortText: { ...typeStyles.caption, color: adminPalette.textSecondary }, sortTextActive: { color: adminPalette.brand, fontFamily: typeStyles.button.fontFamily }, resultCount: { ...typeStyles.caption, color: adminPalette.textMuted, marginLeft: "auto" },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, row: { minHeight: 86, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }, rowPhone: { flexWrap: "wrap", alignItems: "flex-start" }, voidRow: { opacity: 0.55 },
  dateBlock: { width: 43, height: 49, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, dateDay: { ...typeStyles.cardTitle, color: adminPalette.text }, dateMonth: { ...typeStyles.caption, color: adminPalette.textSecondary, textTransform: "uppercase" },
  titleLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }, rowTitle: { ...typeStyles.label, color: adminPalette.text, maxWidth: 260 }, statusBadge: { ...typeStyles.caption, color: adminPalette.textSecondary, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, statusVerified: { color: adminPalette.success, backgroundColor: adminPalette.successSubtle },
  meta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 3 },
  amountBlock: { minWidth: 116, alignItems: "flex-end" }, amountBlockPhone: { marginLeft: 55, minWidth: 0, alignItems: "flex-start" }, amount: { ...typeStyles.cardTitle },
  actions: { flexDirection: "row", gap: 5 }, actionsPhone: { marginLeft: "auto" }, iconButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" }, deleteButton: { backgroundColor: adminPalette.errorSubtle },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 4 }, pageLabel: { ...typeStyles.caption, color: adminPalette.textSecondary },
  backdrop: { flex: 1, backgroundColor: "rgba(15,18,25,.42)", justifyContent: "center", padding: 14 }, modal: { width: "100%", maxWidth: 720, maxHeight: "92%", alignSelf: "center", backgroundColor: adminPalette.surface, borderRadius: 20, overflow: "hidden" }, modalHeader: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }, modalTitle: { ...typeStyles.sectionTitle, color: adminPalette.text }, modalHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, close: { width: 48, height: 48, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, form: { padding: 18, gap: 14 }, label: { ...typeStyles.label, color: adminPalette.textSecondary, marginBottom: 6 },
  toggle: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12 }, toggleTitle: { ...typeStyles.label, color: adminPalette.text }, toggleHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
  usageGrid: { gap: 14 }, usageItem: { gap: 7 }, usageTop: { flexDirection: "row", justifyContent: "space-between" }, usageValue: { ...typeStyles.label }, usageTrack: { height: 7, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, overflow: "hidden" }, usageFill: { height: "100%", borderRadius: 999 },
  costRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border, paddingTop: 14, marginTop: 14 }, costRight: { alignItems: "flex-end" }, costLabel: { ...typeStyles.label, color: adminPalette.textSecondary }, costValue: { ...typeStyles.cardTitle, color: adminPalette.text, marginTop: 3 },
});
