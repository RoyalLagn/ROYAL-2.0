import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Filter, Search, TrendingDown, TrendingUp, X } from "lucide-react-native";
import AdminChart from "@/components/admin/revenue/AdminChart";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { supabase } from "@/services/supabase";
import {
  AdminClipAnalyticsService,
  type AnalyticsClipOption,
  type AnalyticsVendorOption,
  type ClipAnalyticsMetric,
  type ClipAnalyticsResult,
  type ClipAnalyticsTrendPoint,
} from "@/services/adminClipAnalytics";

type PeriodPreset = "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "thisYear" | "custom";
type LocationOption = { id: string; name: string; cityId?: string };
type SelectedFilters = {
  vendor: AnalyticsVendorOption | null;
  clip: AnalyticsClipOption | null;
  category: Pick<CategoryRecord, "id" | "name"> | null;
  city: LocationOption | null;
  area: LocationOption | null;
};

const emptyFilters: SelectedFilters = { vendor: null, clip: null, category: null, city: null, area: null };

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function shiftMonth(date: Date, amount: number) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function parseMonth(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^\d{4}-\d{2}$/.test(text) ? new Date(Number(text.slice(0, 4)), Number(text.slice(5)) - 1, 1) : startOfMonth(new Date());
}
function compact(value: number) { return Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function percent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function fullDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

function rangeFor(preset: PeriodPreset, selectedMonth: Date, customStart: string, customEnd: string) {
  const today = new Date();
  if (preset === "custom") {
    const start = new Date(`${customStart}T00:00:00`); const end = new Date(`${customEnd}T00:00:00`);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    return { start: customStart, end: customEnd, aggregation: days <= 45 ? "day" as const : "month" as const };
  }
  if (preset === "thisMonth" || preset === "lastMonth") {
    const month = preset === "lastMonth" ? shiftMonth(startOfMonth(today), -1) : selectedMonth;
    return { start: iso(startOfMonth(month)), end: iso(endOfMonth(month)), aggregation: "day" as const };
  }
  const end = endOfMonth(today);
  if (preset === "thisYear") return { start: iso(new Date(today.getFullYear(), 0, 1)), end: iso(end), aggregation: "month" as const };
  const count = preset === "last3Months" ? 3 : 6;
  return { start: iso(startOfMonth(shiftMonth(today, -(count - 1)))), end: iso(end), aggregation: "month" as const };
}

export default function ClipAnalyticsSection() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compactLayout = width < 760;
  const currentMonth = startOfMonth(new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => parseMonth(params.month));
  const [preset, setPreset] = useState<PeriodPreset>("thisMonth");
  const [metric, setMetric] = useState<ClipAnalyticsMetric>((params.metric === "watchTime" ? "watchTime" : "views"));
  const [filters, setFilters] = useState<SelectedFilters>(emptyFilters);
  const [customStart, setCustomStart] = useState(iso(startOfMonth(currentMonth)));
  const [customEnd, setCustomEnd] = useState(iso(endOfMonth(currentMonth)));
  const [result, setResult] = useState<ClipAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<ClipAnalyticsTrendPoint | null>(null);
  const requestId = useRef(0);
  const range = useMemo(() => rangeFor(preset, selectedMonth, customStart, customEnd), [customEnd, customStart, preset, selectedMonth]);

  const load = useCallback(async () => {
    const id = ++requestId.current; setLoading(true); setError(null);
    try {
      const data = await AdminClipAnalyticsService.load({
        startDate: range.start, endDate: range.end, aggregation: range.aggregation,
        vendorId: filters.vendor?.id, clipId: filters.clip?.id, categoryId: filters.category?.id,
        cityId: filters.city?.id, areaId: filters.area?.id,
      });
      if (id === requestId.current) setResult(data);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Unable to load clip analytics.");
    } finally { if (id === requestId.current) setLoading(false); }
  }, [filters, range]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    router.setParams({ month: monthKey(selectedMonth), metric });
  }, [metric, router, selectedMonth]);

  const activeFilters = [filters.vendor, filters.clip, filters.category, filters.city, filters.area].filter(Boolean).length;
  const values = result?.trend.map((point) => metric === "views" ? point.views : point.watchTimeHours) ?? [];
  const labels = result?.trend.map((point) => new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", range.aggregation === "day" ? { day: "numeric", month: "short" } : { month: "short" })) ?? [];
  const summaryValue = metric === "views" ? result?.summary.views ?? 0 : result?.summary.watchTimeHours ?? 0;
  const hasAnyData = Boolean(result && (result.summary.views > 0 || result.summary.watchTimeHours > 0));
  const summaryChange = metric === "views" ? result?.summary.viewsChangePercent ?? 0 : result?.summary.watchTimeChangePercent ?? 0;
  const status = summaryChange > 2 ? "up" : summaryChange < -2 ? "down" : "stable";
  const periodLabel = preset === "thisMonth" ? selectedMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : ({ lastMonth: "Last Month", last3Months: "Last 3 Months", last6Months: "Last 6 Months", thisYear: "This Year", custom: "Custom Range" } as const)[preset];

  return <View className="mb-8">
    <View className="mb-4"><Text className="text-foreground text-2xl font-bold">Clip Analytics</Text><Text className="text-muted-foreground text-sm mt-1">Track views and watch activity across RoyalLagn Clips.</Text></View>
    <View className="bg-card rounded-2xl border border-border overflow-hidden">
      <View className="p-5 lg:p-6 border-b border-border">
        <View className={compactLayout ? "gap-4" : "flex-row items-start gap-5"}>
          <View className="flex-1"><Text className="text-foreground text-xl font-bold">Monthly Clip Performance</Text><Text className="text-muted-foreground text-sm mt-1">See how clip views and watch activity are changing.</Text></View>
          <View className="flex-row flex-wrap gap-2">
            <Pressable onPress={() => setMonthOpen(true)} className="h-11 px-3 rounded-xl border border-border bg-background flex-row items-center gap-2"><CalendarDays size={16} className="text-primary" /><Text className="text-foreground text-xs font-semibold">{periodLabel}</Text><ChevronDown size={14} className="text-muted-foreground" /></Pressable>
            <Pressable onPress={() => setFilterOpen(true)} className="h-11 px-3 rounded-xl border border-border bg-background flex-row items-center gap-2"><Filter size={16} className="text-primary" /><Text className="text-foreground text-xs font-semibold">Filters{activeFilters ? ` (${activeFilters})` : ""}</Text></Pressable>
          </View>
        </View>
        {preset === "thisMonth" ? <View className="flex-row items-center mt-5 gap-3"><Pressable accessibilityLabel="Previous month" onPress={() => setSelectedMonth((value) => shiftMonth(value, -1))} className="w-10 h-10 rounded-xl border border-border items-center justify-center"><ChevronLeft size={18} className="text-foreground" /></Pressable><Text className="text-foreground font-semibold min-w-32 text-center">{periodLabel}</Text><Pressable accessibilityLabel="Next month" disabled={monthKey(selectedMonth) >= monthKey(currentMonth)} onPress={() => setSelectedMonth((value) => shiftMonth(value, 1))} className="w-10 h-10 rounded-xl border border-border items-center justify-center disabled:opacity-30"><ChevronRight size={18} className="text-foreground" /></Pressable><Text className="text-muted-foreground text-xs">{fullDate(range.start)} – {fullDate(range.end)}</Text></View> : null}
      </View>

      <View className={compactLayout ? "p-4 gap-3" : "p-5 lg:p-6 flex-row gap-3"}>
        <MetricButton label="Views" value={compact(result?.summary.views ?? 0)} change={result?.summary.viewsChangePercent ?? 0} selected={metric === "views"} onPress={() => setMetric("views")} loading={loading && !result} />
        <MetricButton label="Watch Time" value={`${compact(result?.summary.watchTimeHours ?? 0)} hrs`} change={result?.summary.watchTimeChangePercent ?? 0} selected={metric === "watchTime"} onPress={() => setMetric("watchTime")} loading={loading && !result} />
      </View>

      <View className="px-5 lg:px-6 pb-6">
        {activeFilters ? <FilterChips filters={filters} onChange={setFilters} /> : null}
        <View className="flex-row items-center gap-2 mb-4">{status === "up" ? <TrendingUp size={17} color="#16A34A" /> : status === "down" ? <TrendingDown size={17} color="#DC2626" /> : null}<Text className="text-foreground text-sm font-semibold">Clip {metric === "views" ? "views" : "watch time"} {status === "stable" ? "is stable" : `is ${status} ${Math.abs(summaryChange).toFixed(1)}%`} compared with the previous period.</Text></View>
        <View className={hasAnyData || loading ? "min-h-[340px] rounded-2xl bg-background p-4 relative" : "min-h-[220px] rounded-2xl bg-background p-4 relative"}>
          {error ? <CenteredState title="Unable to load clip analytics." action="Retry" onPress={() => void load()} /> : !loading && summaryValue === 0 ? <CenteredState title={activeFilters ? `No ${metric === "views" ? "views" : "watch time"} found for the selected filters.` : `No clip ${metric === "views" ? "views" : "watch time"} recorded for ${periodLabel}.`} action={activeFilters ? "Clear Filters" : undefined} onPress={() => setFilters(emptyFilters)} /> : <>
            <View className="flex-row items-center justify-between mb-2"><Text className="text-foreground text-sm font-bold">{metric === "views" ? "Views" : "Watch Time"} trend</Text><Text className="text-muted-foreground text-xs">{range.aggregation === "day" ? "Daily" : "Monthly"}</Text></View>
            <AdminChart type="line" labels={labels} datasets={[{ label: metric === "views" ? "Views" : "Watch Time", data: values }]} height={285} valueFormatter={(value) => metric === "views" ? Math.round(value).toLocaleString("en-IN") : `${value.toFixed(1)} hrs`} tooltipFooter={(_value, index) => {
              const previous = values[index - 1] ?? 0; const current = values[index] ?? 0;
              const change = previous ? (current - previous) / previous * 100 : current ? 100 : 0;
              return `Change vs previous ${range.aggregation}: ${percent(change)}`;
            }} onPointSelect={(index) => setSelectedPoint(result?.trend[index] ?? null)} />
          </>}
          {loading && result ? <View className="absolute inset-0 bg-background/70 items-center justify-center"><ActivityIndicator color="#E91E63" /><Text className="text-muted-foreground text-xs mt-2">Updating analytics…</Text></View> : null}
        </View>
        {result && hasAnyData ? <Comparison current={result.comparison.currentViews} previous={result.comparison.previousViews} /> : null}
      </View>
    </View>
    <MonthModal visible={monthOpen} selected={selectedMonth} preset={preset} customStart={customStart} customEnd={customEnd} onClose={() => setMonthOpen(false)} onSelect={(nextPreset, month) => { setPreset(nextPreset); if (month) setSelectedMonth(month); setMonthOpen(false); }} onCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); setPreset("custom"); setMonthOpen(false); }} />
    <FiltersModal visible={filterOpen} value={filters} onClose={() => setFilterOpen(false)} onApply={(value) => { setFilters(value); setFilterOpen(false); }} />
    <DetailModal point={selectedPoint} filters={filters} onClose={() => setSelectedPoint(null)} />
  </View>;
}

function MetricButton({ label, value, change, selected, onPress, loading }: { label: string; value: string; change: number; selected: boolean; onPress: () => void; loading: boolean }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} className={selected ? "flex-1 min-w-52 rounded-2xl bg-primary/10 border border-primary p-4" : "flex-1 min-w-52 rounded-2xl bg-background border border-border p-4"}><Text className={selected ? "text-primary text-xs font-bold" : "text-muted-foreground text-xs font-semibold"}>{label}</Text>{loading ? <View className="h-7 w-24 bg-muted rounded-lg mt-2" /> : <Text className="text-foreground text-2xl font-bold mt-1">{value}</Text>}<Text className={change >= 0 ? "text-emerald-600 text-xs font-bold mt-2" : "text-red-600 text-xs font-bold mt-2"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</Text><Text className="text-muted-foreground text-caption mt-1">vs previous period</Text></Pressable>;
}

function FilterChips({ filters, onChange }: { filters: SelectedFilters; onChange: (value: SelectedFilters) => void }) {
  const chips = (["vendor", "clip", "category", "city", "area"] as const).map((key) => {
    const selected = filters[key];
    return { key, label: selected ? String("name" in selected ? selected.name : selected.title) : "" };
  }).filter((item) => item.label);
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>{chips.map(({ key, label }) => <Pressable key={key} onPress={() => onChange({ ...filters, [key]: null, ...(key === "city" ? { area: null } : {}) })} className="h-8 px-3 rounded-full bg-primary/10 flex-row items-center gap-1"><Text className="text-primary text-xs font-semibold">{label}</Text><X size={12} className="text-primary" /></Pressable>)}<Pressable onPress={() => onChange(emptyFilters)} className="h-8 px-2 items-center justify-center"><Text className="text-muted-foreground text-xs font-semibold">Clear all</Text></Pressable></ScrollView>;
}

function CenteredState({ title, action, onPress }: { title: string; action?: string; onPress: () => void }) { return <View className="min-h-[190px] items-center justify-center px-4"><Text className="text-foreground text-base font-bold text-center">{title}</Text>{action ? <Pressable onPress={onPress} className="mt-4 min-h-11 px-4 bg-primary rounded-xl items-center justify-center"><Text className="text-white text-xs font-bold">{action}</Text></Pressable> : null}</View>; }

function Comparison({ current, previous }: { current: number; previous: number }) {
  const max = Math.max(1, current, previous); const change = previous ? (current - previous) / previous * 100 : current ? 100 : 0;
  return <View className="mt-5 pt-5 border-t border-border"><Text className="text-foreground font-bold">Monthly comparison</Text><View className="gap-3 mt-4"><ComparisonRow label="This period" value={current} width={current / max * 100} primary /><ComparisonRow label="Previous period" value={previous} width={previous / max * 100} /></View><Text className={change >= 0 ? "text-emerald-600 text-xs font-bold mt-4" : "text-red-600 text-xs font-bold mt-4"}>{current - previous >= 0 ? "+" : ""}{compact(current - previous)} views · {percent(change)}</Text></View>;
}
function ComparisonRow({ label, value, width, primary }: { label: string; value: number; width: number; primary?: boolean }) { return <View className="flex-row items-center gap-3"><Text className="text-muted-foreground text-xs w-28">{label}</Text><View className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><View className={primary ? "h-full bg-primary rounded-full" : "h-full bg-muted-foreground/40 rounded-full"} style={{ width: `${width}%` }} /></View><Text className="text-foreground text-xs font-bold w-16 text-right">{compact(value)}</Text></View>; }

function MonthModal({ visible, selected, preset, customStart, customEnd, onClose, onSelect, onCustom }: { visible: boolean; selected: Date; preset: PeriodPreset; customStart: string; customEnd: string; onClose: () => void; onSelect: (preset: PeriodPreset, month?: Date) => void; onCustom: (start: string, end: string) => void }) {
  const [start, setStart] = useState(customStart); const [end, setEnd] = useState(customEnd); const now = startOfMonth(new Date());
  const months = Array.from({ length: 18 }, (_, index) => shiftMonth(now, -index));
  const presets: { key: PeriodPreset; label: string }[] = [{ key: "thisMonth", label: "This Month" }, { key: "lastMonth", label: "Last Month" }, { key: "last3Months", label: "Last 3 Months" }, { key: "last6Months", label: "Last 6 Months" }, { key: "thisYear", label: "This Year" }, { key: "custom", label: "Custom Range" }];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View className="flex-1 bg-black/50 items-center justify-center p-5"><View className="bg-card rounded-2xl p-5 w-full max-w-xl max-h-[85vh]"><ModalHeader title="Reporting period" onClose={onClose} /><View className="flex-row flex-wrap gap-2 mt-4">{presets.map((item) => <Pressable key={item.key} onPress={() => item.key !== "custom" && onSelect(item.key, item.key === "lastMonth" ? shiftMonth(now, -1) : undefined)} className={preset === item.key ? "px-3 h-9 rounded-xl bg-primary items-center justify-center" : "px-3 h-9 rounded-xl border border-border items-center justify-center"}><Text className={preset === item.key ? "text-white text-xs font-bold" : "text-foreground text-xs font-semibold"}>{item.label}</Text></Pressable>)}</View><Text className="text-foreground text-xs font-bold mt-5 mb-2">Choose month</Text><ScrollView className="max-h-56">{months.map((month) => <Pressable key={monthKey(month)} onPress={() => onSelect("thisMonth", month)} className="h-11 flex-row items-center justify-between border-b border-border"><Text className="text-foreground text-sm">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>{monthKey(month) === monthKey(selected) ? <View className="w-2 h-2 bg-primary rounded-full" /> : null}</Pressable>)}</ScrollView><Text className="text-foreground text-xs font-bold mt-5">Custom range</Text><View className="flex-row gap-3 mt-2"><TextInput value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" className="flex-1 h-11 px-3 rounded-xl border border-border text-foreground" /><TextInput value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" className="flex-1 h-11 px-3 rounded-xl border border-border text-foreground" /></View><Pressable disabled={!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end} onPress={() => onCustom(start, end)} className="h-11 bg-primary rounded-xl items-center justify-center mt-3 disabled:opacity-40"><Text className="text-white text-xs font-bold">Apply custom range</Text></Pressable></View></View></Modal>;
}

function FiltersModal({ visible, value, onClose, onApply }: { visible: boolean; value: SelectedFilters; onClose: () => void; onApply: (value: SelectedFilters) => void }) {
  const [draft, setDraft] = useState(value); const [vendorQuery, setVendorQuery] = useState(""); const [clipQuery, setClipQuery] = useState("");
  const [vendors, setVendors] = useState<AnalyticsVendorOption[]>([]); const [clips, setClips] = useState<AnalyticsClipOption[]>([]); const [categories, setCategories] = useState<CategoryRecord[]>([]); const [cities, setCities] = useState<LocationOption[]>([]); const [areas, setAreas] = useState<LocationOption[]>([]); const [searching, setSearching] = useState(false);
  useEffect(() => { if (visible) setDraft(value); }, [value, visible]);
  useEffect(() => { if (!visible) return; void Promise.all([CategoryService.list(), supabase.from("supported_cities").select("id,name").eq("is_active", true).order("name")]).then(([categoryRows, cityResult]) => { setCategories(categoryRows); setCities((cityResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }))); }); }, [visible]);
  useEffect(() => { if (!visible) return; const timer = setTimeout(() => { setSearching(true); void AdminClipAnalyticsService.searchVendors(vendorQuery).then(setVendors).finally(() => setSearching(false)); }, 400); return () => clearTimeout(timer); }, [vendorQuery, visible]);
  useEffect(() => { if (!visible) return; const timer = setTimeout(() => { setSearching(true); void AdminClipAnalyticsService.searchClips(clipQuery).then(setClips).finally(() => setSearching(false)); }, 400); return () => clearTimeout(timer); }, [clipQuery, visible]);
  useEffect(() => { if (!draft.city) { setAreas([]); return; } void supabase.from("supported_areas").select("id,name,city_id").eq("city_id", draft.city.id).eq("is_active", true).order("name").then(({ data }) => setAreas((data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), cityId: String(row.city_id) })))); }, [draft.city]);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View className="flex-1 bg-black/50 items-end"><View className="bg-card h-full w-full max-w-xl p-5"><ModalHeader title="Analytics filters" onClose={onClose} /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}><SearchPicker label="Vendor" query={vendorQuery} onQuery={setVendorQuery} placeholder="Search vendors…" selected={draft.vendor?.name} loading={searching} rows={vendors.map((item) => ({ id: item.id, title: item.name, onPress: () => setDraft((current) => ({ ...current, vendor: item })) }))} onClear={() => setDraft((current) => ({ ...current, vendor: null }))} /><SearchPicker label="Clip" query={clipQuery} onQuery={setClipQuery} placeholder="Search title, caption or clip ID…" selected={draft.clip?.title} loading={searching} rows={clips.map((item) => ({ id: item.id, title: item.title, subtitle: `${item.vendorName} · ${item.publishedAt ? fullDate(item.publishedAt.slice(0, 10)) : "Not published"}`, image: item.thumbnailUrl, onPress: () => setDraft((current) => ({ ...current, clip: item })) }))} onClear={() => setDraft((current) => ({ ...current, clip: null }))} /><OptionStrip label="Category" selected={draft.category?.id} options={categories.map((item) => ({ id: item.id, name: item.name }))} onSelect={(item) => setDraft((current) => ({ ...current, category: item }))} onClear={() => setDraft((current) => ({ ...current, category: null }))} /><OptionStrip label="Location" selected={draft.city?.id} options={cities} onSelect={(item) => setDraft((current) => ({ ...current, city: item, area: null }))} onClear={() => setDraft((current) => ({ ...current, city: null, area: null }))} />{draft.city ? <OptionStrip label="Area" selected={draft.area?.id} options={areas} onSelect={(item) => setDraft((current) => ({ ...current, area: item }))} onClear={() => setDraft((current) => ({ ...current, area: null }))} /> : null}</ScrollView><View className="flex-row gap-3 pt-3 border-t border-border"><Pressable onPress={() => setDraft(emptyFilters)} className="h-12 px-5 rounded-xl border border-border items-center justify-center"><Text className="text-foreground text-xs font-bold">Clear all</Text></Pressable><Pressable onPress={() => onApply(draft)} className="flex-1 h-12 bg-primary rounded-xl items-center justify-center"><Text className="text-white text-xs font-bold">Apply filters</Text></Pressable></View></View></View></Modal>;
}

function SearchPicker({ label, query, onQuery, placeholder, selected, loading, rows, onClear }: { label: string; query: string; onQuery: (value: string) => void; placeholder: string; selected?: string; loading: boolean; rows: { id: string; title: string; subtitle?: string; image?: string; onPress: () => void }[]; onClear: () => void }) { return <View className="mt-5"><Text className="text-foreground text-xs font-bold mb-2">{label}</Text>{selected ? <Pressable onPress={onClear} className="h-10 px-3 rounded-xl bg-primary/10 flex-row items-center justify-between"><Text className="text-primary text-xs font-semibold" numberOfLines={1}>{selected}</Text><X size={14} className="text-primary" /></Pressable> : null}<View className="h-11 rounded-xl border border-border flex-row items-center px-3 mt-2"><Search size={15} className="text-muted-foreground" /><TextInput value={query} onChangeText={onQuery} placeholder={placeholder} placeholderTextColor="#8A8589" className="flex-1 h-11 ml-2 text-foreground text-sm" />{loading ? <ActivityIndicator size="small" color="#E91E63" /> : null}</View>{query || rows.length ? <View className="border border-border rounded-xl mt-2 overflow-hidden max-h-52">{!loading && !rows.length ? <Text className="text-muted-foreground text-xs p-3">No results</Text> : rows.map((row) => <Pressable key={row.id} onPress={row.onPress} className="min-h-12 p-2 flex-row items-center gap-3 border-b border-border">{row.image ? <Image source={{ uri: row.image }} className="w-10 h-10 rounded-lg bg-muted" /> : null}<View className="flex-1"><Text className="text-foreground text-xs font-semibold" numberOfLines={1}>{row.title}</Text>{row.subtitle ? <Text className="text-muted-foreground text-caption mt-0.5" numberOfLines={1}>{row.subtitle}</Text> : null}</View></Pressable>)}</View> : null}</View>; }

function OptionStrip({ label, selected, options, onSelect, onClear }: { label: string; selected?: string; options: { id: string; name: string }[]; onSelect: (item: any) => void; onClear: () => void }) { return <View className="mt-5"><View className="flex-row justify-between"><Text className="text-foreground text-xs font-bold">{label}</Text>{selected ? <Pressable onPress={onClear}><Text className="text-primary text-xs font-semibold">Clear</Text></Pressable> : null}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 9 }}>{options.map((item) => <Pressable key={item.id} onPress={() => onSelect(item)} className={selected === item.id ? "h-9 px-3 bg-primary rounded-xl items-center justify-center" : "h-9 px-3 border border-border rounded-xl items-center justify-center"}><Text className={selected === item.id ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{item.name}</Text></Pressable>)}</ScrollView></View>; }

function DetailModal({ point, filters, onClose }: { point: ClipAnalyticsTrendPoint | null; filters: SelectedFilters; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!point) return; setLoading(true); void AdminClipAnalyticsService.dailyDetails(point.date, { vendorId: filters.vendor?.id, clipId: filters.clip?.id, categoryId: filters.category?.id, cityId: filters.city?.id, areaId: filters.area?.id }).then(setRows).finally(() => setLoading(false)); }, [filters, point]);
  const totalWatch = rows.reduce((sum, row) => sum + row.watchTimeHours, 0); const totalViews = rows.reduce((sum, row) => sum + row.views, 0); const topVendor = rows[0]?.vendorName ?? "—";
  return <Modal visible={Boolean(point)} transparent animationType="fade" onRequestClose={onClose}><View className="flex-1 bg-black/50 items-center justify-center p-5"><View className="bg-card rounded-2xl p-5 w-full max-w-3xl max-h-[85vh]"><ModalHeader title={point ? fullDate(point.date) : "Daily details"} onClose={onClose} />{point ? <><View className="flex-row flex-wrap gap-3 mt-4"><DetailMetric label="Total Views" value={point.views.toLocaleString("en-IN")} /><DetailMetric label="Watch Time" value={`${point.watchTimeHours.toFixed(1)} hrs`} /><DetailMetric label="Unique Viewers" value={point.uniqueViewers.toLocaleString("en-IN")} /><DetailMetric label="Clips Viewed" value={point.clipsViewed.toLocaleString("en-IN")} /></View><Text className="text-muted-foreground text-xs mt-4">Top clip: <Text className="text-foreground font-bold">{point.topClip || "—"}</Text></Text><Text className="text-muted-foreground text-xs mt-1">Top vendor: <Text className="text-foreground font-bold">{topVendor}</Text></Text><Text className="text-muted-foreground text-xs mt-1">Average watch time: <Text className="text-foreground font-bold">{totalViews ? `${(totalWatch * 3600 / totalViews).toFixed(1)} sec` : "—"}</Text></Text><ScrollView className="mt-5 max-h-80">{loading ? <ActivityIndicator color="#E91E63" /> : rows.map((row) => <View key={row.clipId} className="py-3 border-b border-border flex-row gap-3"><View className="flex-1"><Text className="text-foreground text-xs font-bold">{row.clipTitle}</Text><Text className="text-muted-foreground text-caption mt-1">{row.vendorName} · {row.publishedAt ? fullDate(row.publishedAt.slice(0, 10)) : "Not published"}</Text></View><View><Text className="text-foreground text-xs font-bold text-right">{row.views.toLocaleString("en-IN")} views</Text><Text className="text-muted-foreground text-caption text-right mt-1">{row.watchTimeHours.toFixed(1)} hrs</Text></View></View>)}</ScrollView></> : null}</View></View></Modal>;
}
function DetailMetric({ label, value }: { label: string; value: string }) { return <View className="min-w-32 flex-1 bg-background rounded-xl p-3"><Text className="text-muted-foreground text-caption">{label}</Text><Text className="text-foreground text-base font-bold mt-1">{value}</Text></View>; }
function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) { return <View className="flex-row items-center"><Text className="text-foreground text-lg font-bold flex-1">{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose} className="w-10 h-10 rounded-xl items-center justify-center"><X size={19} className="text-foreground" /></Pressable></View>; }
