import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { AlertTriangle, CheckCircle2, Download, IndianRupee, Plus, RefreshCw, Trash2 } from "lucide-react-native";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import AdminChart from "@/components/admin/revenue/AdminChart";
import { AdminRevenueService, type EquityMember, type RevenueDataset, type RevenuePayment } from "@/services/adminRevenueService";

type FilterMode = "month" | "year" | "month_range" | "date_range";
type DraftMember = { key: string; id?: string; name: string; percentage: string };
type Period = { start: Date; endExclusive: Date; label: string; error?: string };
const PINK = "#E91E63";

export function EquityRevenueDashboard() {
  const now = new Date();
  const currentMonth = monthKey(now);
  const previousMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [mode, setMode] = useState<FilterMode>("month");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState(`${currentMonth}-01`);
  const [toDate, setToDate] = useState(todayKey(now));
  const [compareA, setCompareA] = useState(currentMonth);
  const [compareB, setCompareB] = useState(previousMonth);
  const [members, setMembers] = useState<DraftMember[]>([]);
  const [dirty, setDirty] = useState(false);
  const [dataset, setDataset] = useState<RevenueDataset>({ payments: [], subscriptions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const { width } = useWindowDimensions();
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const period = useMemo(() => resolvePeriod(mode, { month, year, fromMonth, toMonth, fromDate, toDate }), [fromDate, fromMonth, mode, month, toDate, toMonth, year]);
  const compareRangeA = useMemo(() => monthRange(compareA), [compareA]);
  const compareRangeB = useMemo(() => monthRange(compareB), [compareB]);
  const windowRange = useMemo(() => {
    const ranges = [period, compareRangeA, compareRangeB].filter((item) => !item.error);
    return {
      start: new Date(Math.min(...ranges.map((item) => item.start.getTime()))),
      endExclusive: new Date(Math.max(...ranges.map((item) => item.endExclusive.getTime()))),
    };
  }, [compareRangeA, compareRangeB, period]);

  const load = useCallback(async () => {
    if (period.error || compareRangeA.error || compareRangeB.error) { setLoading(false); return; }
    setError(null);
    try {
      const [equity, revenue] = await Promise.all([
        AdminRevenueService.listEquity(),
        AdminRevenueService.load(windowRange.start, windowRange.endExclusive),
      ]);
      setDataset(revenue);
      if (!dirtyRef.current) setMembers(equity.length ? equity.map(toDraft) : [blankMember()]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to load revenue records.";
      setError(/admin_equity_splits|schema cache/i.test(message) ? "Equity storage is not available yet. Apply the pending Supabase migration, then refresh." : message);
    } finally { setLoading(false); }
  }, [compareRangeA.error, compareRangeB.error, period.error, windowRange.endExclusive, windowRange.start]);

  useEffect(() => { setLoading(true); const timer = setTimeout(() => void load(), 220); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = AdminRevenueService.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 250);
    });
    return () => { if (timer) clearTimeout(timer); unsubscribe(); };
  }, [load]);

  const totalEquity = useMemo(() => members.reduce((sum, member) => sum + (Number(member.percentage) || 0), 0), [members]);
  const scaledTotal = Math.round(totalEquity * 10_000);
  const names = members.map((member) => member.name.trim().toLowerCase()).filter(Boolean);
  const validSplit = members.length > 0 && scaledTotal === 1_000_000 && members.every((member) => member.name.trim() && Number(member.percentage) > 0 && Number(member.percentage) <= 100) && new Set(names).size === names.length;
  const selectedPayments = useMemo(() => dataset.payments.filter((payment) => inRange(payment.revenue_date, period)), [dataset.payments, period]);
  const selectedSubscriptions = useMemo(() => dataset.subscriptions.filter((subscription) => inRange(subscription.created_at, period)), [dataset.subscriptions, period]);
  const revenue = selectedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const overviewSeries = useMemo(() => series(period, selectedPayments, (item) => item.revenue_date, (item) => item.amount), [period, selectedPayments]);
  const subscriptionSeries = useMemo(() => series(period, selectedSubscriptions, (item) => item.created_at, () => 1), [period, selectedSubscriptions]);
  const comparisonValues = [sumPayments(dataset.payments, compareRangeA), sumPayments(dataset.payments, compareRangeB)];

  const updateMember = (key: string, changes: Partial<DraftMember>) => {
    setDirty(true);
    setMembers((current) => current.map((member) => member.key === key ? { ...member, ...changes } : member));
  };
  const removeMember = (key: string) => {
    setDirty(true);
    setMembers((current) => current.length === 1 ? [blankMember()] : current.filter((member) => member.key !== key));
  };
  const save = async () => {
    if (!validSplit) return Alert.alert("Equity split is not valid", "Names must be unique and total equity must equal exactly 100%.");
    setSaving(true);
    try {
      const saved = await AdminRevenueService.saveEquity(members.map((member) => ({ id: member.id, name: member.name, equity_percentage: Number(member.percentage) })));
      setMembers(saved.map(toDraft)); setDirty(false);
      Alert.alert("Equity split saved", "Income distribution now uses this saved split.");
    } catch (cause) { Alert.alert("Unable to save equity", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setSaving(false); }
  };
  const download = () => {
    if (period.error) return Alert.alert("Check report period", period.error);
    if (!validSplit || dirty) return Alert.alert("Save a valid equity split", "The Excel report requires a saved split totaling exactly 100%.");
    try {
      AdminRevenueService.downloadExcel({ periodLabel: period.label, start: period.start, endExclusive: period.endExclusive, payments: selectedPayments, subscriptions: selectedSubscriptions, equity: members.map((member) => ({ id: member.id, name: member.name, equity_percentage: Number(member.percentage) })) });
    } catch (cause) { Alert.alert("Report unavailable", cause instanceof Error ? cause.message : "Unable to create the report."); }
  };

  return <DashboardWidget title="Equity Split & Revenue" subtitle="Verified subscription income and ownership distribution" icon={IndianRupee} onRefresh={() => void load()}>
    <PeriodFilters mode={mode} setMode={setMode} values={{ month, year, fromMonth, toMonth, fromDate, toDate }} setters={{ setMonth, setYear, setFromMonth, setToMonth, setFromDate, setToDate }} error={period.error} onRefresh={() => { setLoading(true); void load(); }} />
    {loading ? <AdminLoadingState label="Loading revenue records…" /> : error ? <AdminErrorState message={error} onRetry={() => { setLoading(true); void load(); }} /> : <>
      <View className="flex-row flex-wrap gap-3 mt-4"><Metric label="Verified revenue" value={money(revenue)} /><Metric label="Verified payments" value={String(selectedPayments.length)} /><Metric label="New subscriptions" value={String(selectedSubscriptions.length)} /></View>

      <SectionTitle title="Equity split" subtitle="Only an exact 100% split can be saved or distributed" />
      <View className="bg-background rounded-2xl border border-border overflow-hidden"><View className="flex-row px-3 py-2 bg-muted/60"><Text className="text-muted-foreground text-metadata font-bold uppercase flex-1">Name</Text><Text className="text-muted-foreground text-metadata font-bold uppercase w-32">Equity percentage</Text><View className="w-11" /></View>{members.map((member) => <View key={member.key} className="flex-row items-center px-3 py-2 border-t border-border"><TextInput value={member.name} maxLength={120} onChangeText={(name) => updateMember(member.key, { name })} placeholder="Member name" placeholderTextColor="#91868B" className="flex-1 h-11 text-foreground mr-3" /><View className="w-32 h-11 rounded-xl bg-card border border-border flex-row items-center px-3"><TextInput value={member.percentage} onChangeText={(percentage) => updateMember(member.key, { percentage: percentage.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#91868B" className="flex-1 text-foreground" /><Text className="text-muted-foreground">%</Text></View><Pressable accessibilityLabel={`Remove ${member.name || "member"}`} onPress={() => removeMember(member.key)} className="w-11 h-11 items-center justify-center"><Trash2 size={16} color="#D33B55" /></Pressable></View>)}</View>
      <View className="flex-row flex-wrap items-center gap-3 mt-3"><Pressable onPress={() => { setDirty(true); setMembers((current) => [...current, blankMember()]); }} className="min-h-11 px-4 rounded-xl bg-primary/10 flex-row items-center justify-center"><Plus size={16} color={PINK} /><Text className="text-primary text-xs font-bold ml-2">Add member</Text></Pressable><View className={validSplit ? "min-h-11 px-4 rounded-xl bg-emerald-500/10 flex-row items-center justify-center" : "min-h-11 px-4 rounded-xl bg-amber-500/10 flex-row items-center justify-center"}>{validSplit ? <CheckCircle2 size={16} color="#168A5B" /> : <AlertTriangle size={16} color="#B76A00" />}<Text className={validSplit ? "text-emerald-700 text-xs font-bold ml-2" : "text-amber-700 text-xs font-bold ml-2"}>Total {totalEquity.toFixed(2)}%{totalEquity < 100 ? ` · ${(100 - totalEquity).toFixed(2)}% remaining` : totalEquity > 100 ? ` · ${(totalEquity - 100).toFixed(2)}% over` : " · Valid"}</Text></View><Pressable disabled={!validSplit || saving || !dirty} onPress={() => void save()} className={!validSplit || saving || !dirty ? "min-h-11 px-5 rounded-xl bg-primary/35 items-center justify-center ml-auto" : "min-h-11 px-5 rounded-xl bg-primary items-center justify-center ml-auto"}><Text className="text-white text-xs font-bold">{saving ? "Saving…" : dirty ? "Save split" : "Saved"}</Text></Pressable></View>

      <SectionTitle title="Income distribution" subtitle={dirty ? "Preview only — save the split to use it in reports" : `Calculated from ${period.label}`} />
      <View className="bg-background rounded-2xl border border-border overflow-hidden"><View className="flex-row px-3 py-3 bg-muted/60"><TableHeader flex={1.4}>Name</TableHeader><TableHeader flex={1}>Equity</TableHeader><TableHeader flex={1.2} align="right">Calculated income</TableHeader></View>{members.map((member) => <View key={`income-${member.key}`} className="flex-row px-3 py-3 border-t border-border"><TableCell flex={1.4}>{member.name || "Unnamed"}</TableCell><TableCell flex={1}>{Number(member.percentage || 0).toFixed(2)}%</TableCell><TableCell flex={1.2} align="right">{validSplit ? money(revenue * Number(member.percentage) / 100) : "—"}</TableCell></View>)}</View>

      <View className={width >= 980 ? "flex-row gap-4 mt-6" : "gap-4 mt-6"}><ChartCard title="Revenue overview" subtitle={period.label} wide={width >= 980}><AdminChart type="line" labels={overviewSeries.labels} datasets={[{ label: "Verified revenue", data: overviewSeries.values }]} currency /></ChartCard><ChartCard title="New subscription trend" subtitle={`${selectedSubscriptions.length} created in selected period`} wide={width >= 980}><AdminChart type="line" labels={subscriptionSeries.labels} datasets={[{ label: "New subscriptions", data: subscriptionSeries.values, borderColor: "#C58A22", backgroundColor: "rgba(197,138,34,.18)" }]} /></ChartCard></View>

      <SectionTitle title="Revenue comparison" subtitle="Compare any two calendar months" />
      <View className="flex-row flex-wrap gap-3 mb-3"><FilterInput label="Month A" value={compareA} onChangeText={setCompareA} placeholder="YYYY-MM" /><FilterInput label="Month B" value={compareB} onChangeText={setCompareB} placeholder="YYYY-MM" /></View>
      {compareRangeA.error || compareRangeB.error ? <Text className="text-red-500 text-xs mb-3">{compareRangeA.error || compareRangeB.error}</Text> : <ChartCard title={`${compareRangeA.label} vs ${compareRangeB.label}`} subtitle="Verified subscription revenue"><AdminChart type="bar" labels={[compareRangeA.label, compareRangeB.label]} datasets={[{ label: "Verified revenue", data: comparisonValues }]} currency height={220} /></ChartCard>}

      <SectionTitle title="Excel report download" subtitle="Includes revenue, equity, distribution, payments and new subscriptions" />
      <View className="bg-background border border-border rounded-2xl p-4 flex-row flex-wrap items-center gap-3"><View className="w-11 h-11 rounded-xl bg-emerald-500/10 items-center justify-center"><Download size={19} color="#168A5B" /></View><View className="flex-1 min-w-52"><Text className="text-foreground font-bold">{period.label}</Text><Text className="text-muted-foreground text-xs mt-1">{selectedPayments.length} payments · {selectedSubscriptions.length} new subscriptions · {money(revenue)}</Text></View><Pressable accessibilityRole="button" accessibilityHint={!validSplit || dirty ? "Save a valid equity split before downloading" : "Downloads the selected revenue report"} onPress={download} className={period.error || !validSplit || dirty ? "min-h-11 px-5 rounded-xl bg-emerald-600/60 items-center justify-center" : "min-h-11 px-5 rounded-xl bg-emerald-600 items-center justify-center"}><Text className="text-white text-xs font-bold">Download Excel</Text></Pressable></View>
    </>}
  </DashboardWidget>;
}

function PeriodFilters({ mode, setMode, values, setters, error, onRefresh }: any) {
  return <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{(["month", "year", "month_range", "date_range"] as FilterMode[]).map((item) => <Pressable key={item} onPress={() => setMode(item)} className={mode === item ? "px-4 min-h-10 rounded-xl bg-primary items-center justify-center" : "px-4 min-h-10 rounded-xl bg-primary/10 items-center justify-center"}><Text className={mode === item ? "text-white text-xs font-bold" : "text-primary text-xs font-bold"}>{item === "month_range" ? "Month range" : item === "date_range" ? "Date range" : item.charAt(0).toUpperCase() + item.slice(1)}</Text></Pressable>)}</ScrollView><View className="flex-row flex-wrap gap-3 mt-3">{mode === "month" ? <FilterInput label="Month" value={values.month} onChangeText={setters.setMonth} placeholder="YYYY-MM" /> : null}{mode === "year" ? <FilterInput label="Year" value={values.year} onChangeText={setters.setYear} placeholder="YYYY" /> : null}{mode === "month_range" ? <><FilterInput label="From month" value={values.fromMonth} onChangeText={setters.setFromMonth} placeholder="YYYY-MM" /><FilterInput label="To month" value={values.toMonth} onChangeText={setters.setToMonth} placeholder="YYYY-MM" /></> : null}{mode === "date_range" ? <><FilterInput label="From date" value={values.fromDate} onChangeText={setters.setFromDate} placeholder="YYYY-MM-DD" /><FilterInput label="To date" value={values.toDate} onChangeText={setters.setToDate} placeholder="YYYY-MM-DD" /></> : null}<Pressable accessibilityLabel="Refresh revenue" onPress={onRefresh} className="w-11 h-11 rounded-xl bg-card border border-border items-center justify-center"><RefreshCw size={17} className="text-primary" /></Pressable></View>{error ? <Text className="text-red-500 text-xs mt-2">{error}</Text> : null}</View>;
}
function FilterInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) { return <View className="min-w-40 flex-1"><Text className="text-muted-foreground text-caption font-bold uppercase mb-1">{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#91868B" className="h-11 px-3 bg-card border border-border rounded-xl text-foreground" /></View>; }
function Metric({ label, value }: { label: string; value: string }) { return <View className="flex-1 min-w-36 bg-background border border-border rounded-2xl p-4"><Text className="text-foreground text-xl font-bold">{value}</Text><Text className="text-muted-foreground text-metadata mt-1">{label}</Text></View>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <View className="mt-7 mb-3"><Text className="text-foreground font-bold">{title}</Text><Text className="text-muted-foreground text-xs mt-1">{subtitle}</Text></View>; }
function TableHeader({ children, flex, align }: { children: React.ReactNode; flex: number; align?: "right" }) { return <Text className="text-muted-foreground text-caption font-bold uppercase" style={{ flex, textAlign: align }}>{children}</Text>; }
function TableCell({ children, flex, align }: { children: React.ReactNode; flex: number; align?: "right" }) { return <Text className="text-foreground text-xs" numberOfLines={1} style={{ flex, textAlign: align }}>{children}</Text>; }
function ChartCard({ title, subtitle, children, wide }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) { return <View className="bg-background border border-border rounded-2xl p-4" style={wide ? { flex: 1, minWidth: 0 } : undefined}><Text className="text-foreground font-bold">{title}</Text><Text className="text-muted-foreground text-metadata mt-1 mb-3">{subtitle}</Text>{children}</View>; }
function blankMember(): DraftMember { return { key: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: "", percentage: "" }; }
function toDraft(member: EquityMember): DraftMember { return { key: member.id || `member-${member.name}`, id: member.id, name: member.name, percentage: String(member.equity_percentage) }; }
function money(value: number) { return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function monthKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`; }
function todayKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function monthRange(value: string): Period { const match = /^(\d{4})-(\d{2})$/.exec(value); if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return { start: new Date(0), endExclusive: new Date(0), label: value || "Invalid month", error: "Use month format YYYY-MM." }; const year = Number(match[1]), month = Number(match[2]) - 1; const start = new Date(Date.UTC(year, month, 1)), endExclusive = new Date(Date.UTC(year, month + 1, 1)); return { start, endExclusive, label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) }; }
function dateRange(from: string, to: string): Period { const valid = /^\d{4}-\d{2}-\d{2}$/; if (!valid.test(from) || !valid.test(to)) return { start: new Date(0), endExclusive: new Date(0), label: "Invalid date range", error: "Use date format YYYY-MM-DD." }; const start = new Date(`${from}T00:00:00.000Z`), end = new Date(`${to}T00:00:00.000Z`); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to || start > end) return { start, endExclusive: end, label: "Invalid date range", error: "Enter real calendar dates with the end on or after the start." }; const endExclusive = new Date(end); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1); return { start, endExclusive, label: `${start.toLocaleDateString("en-IN", { timeZone: "UTC" })} – ${end.toLocaleDateString("en-IN", { timeZone: "UTC" })}` }; }
function resolvePeriod(mode: FilterMode, input: Record<string, string>): Period { if (mode === "month") return monthRange(input.month); if (mode === "year") { if (!/^\d{4}$/.test(input.year)) return { start: new Date(0), endExclusive: new Date(0), label: input.year || "Invalid year", error: "Use year format YYYY." }; const value = Number(input.year); return { start: new Date(Date.UTC(value, 0, 1)), endExclusive: new Date(Date.UTC(value + 1, 0, 1)), label: input.year }; } if (mode === "date_range") return dateRange(input.fromDate, input.toDate); const first = monthRange(input.fromMonth), last = monthRange(input.toMonth); if (first.error || last.error) return { ...first, error: first.error || last.error }; if (first.start >= last.endExclusive) return { ...first, error: "The ending month must be on or after the starting month." }; return { start: first.start, endExclusive: last.endExclusive, label: `${first.label} – ${last.label}` }; }
function inRange(date: string, period: Period) { const time = Date.parse(date); return !period.error && time >= period.start.getTime() && time < period.endExclusive.getTime(); }
function sumPayments(payments: RevenuePayment[], period: Period) { return payments.filter((payment) => inRange(payment.revenue_date, period)).reduce((sum, payment) => sum + payment.amount, 0); }
function series<T>(period: Period, items: T[], dateOf: (item: T) => string, valueOf: (item: T) => number) { const daily = (period.endExclusive.getTime() - period.start.getTime()) / 86_400_000 <= 92; const labels: string[] = [], keys: string[] = []; const cursor = new Date(period.start); while (cursor < period.endExclusive && labels.length < 400) { const key = daily ? cursor.toISOString().slice(0, 10) : cursor.toISOString().slice(0, 7); keys.push(key); labels.push(daily ? cursor.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : cursor.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })); if (daily) cursor.setUTCDate(cursor.getUTCDate() + 1); else cursor.setUTCMonth(cursor.getUTCMonth() + 1); } const values = keys.map((key) => items.filter((item) => dateOf(item).slice(0, daily ? 10 : 7) === key).reduce((sum, item) => sum + valueOf(item), 0)); return { labels, values }; }
