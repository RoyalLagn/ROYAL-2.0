import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Phone, RefreshCw, Search, Store } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminEnquiry } from "@/services/adminOperations";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";

const PAGE_SIZE = 15;

// RoyalLagn is an India-only marketplace, so "which day" an enquiry counts
// toward must be a fixed business timezone (IST), not the admin's own
// device/browser timezone — otherwise an enquiry near midnight IST could
// silently move to the wrong calendar day for an admin viewing from
// elsewhere. en-CA conveniently formats as YYYY-MM-DD.
const ENQUIRY_TIMEZONE = "Asia/Kolkata";
function istDateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ENQUIRY_TIMEZONE });
}
function todayIstKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ENQUIRY_TIMEZONE });
}
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDateKeyLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}
// Pure calendar-grid arithmetic (days in month, weekday of day 1) is a fact
// about the Gregorian calendar, not a specific instant in time, so ordinary
// local Date math is safe here — this never touches the IST enquiry-day
// bucketing above.
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstWeekdayMondayIndexed(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

type DayCounts = { total: number; call: number; whatsapp: number };
const emptyDayCounts: DayCounts = { total: 0, call: 0, whatsapp: 0 };

type VendorEnquirySummary = {
  vendorId: string;
  vendorName: string;
  categoryId: string | null;
  categoryName: string;
  callCount: number;
  whatsappCount: number;
  totalCount: number;
};

export default function AdminEnquiries() {
  const [items, setItems] = useState<AdminEnquiry[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayKey = useMemo(() => todayIstKey(), []);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = todayKey.split("-").map(Number);
    return { year, month: month - 1 };
  });
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [enquiries, categoryRows] = await Promise.all([
        AdminOperationsService.enquiries(),
        CategoryService.list(),
      ]);
      setItems(enquiries);
      setCategories(categoryRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load enquiry summary.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return AdminOperationsService.subscribe("vendor_enquiries", () => void load(true));
  }, [load]);

  const channelEnquiries = useMemo(
    () => items.filter((item) => item.enquiry_channel === "call" || item.enquiry_channel === "whatsapp"),
    [items],
  );

  // Same category + vendor-name filter predicate as vendorSummaries below —
  // reused, not re-implemented, so the calendar's counts and the vendor
  // summary/KPI cards always agree on what "the current filters" mean.
  const filteredEnquiries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return channelEnquiries.filter((item) =>
      (categoryId === "all" || item.category_id === categoryId)
      && (!needle || item.vendor_name.toLowerCase().includes(needle)));
  }, [channelEnquiries, categoryId, query]);

  // One pass over the already-loaded, already-filtered data — no extra
  // Supabase query per month, since the full history is already in memory
  // for the vendor summary above and a month is always a subset of it.
  const dayCounts = useMemo(() => {
    const map = new Map<string, DayCounts>();
    filteredEnquiries.forEach((item) => {
      const key = istDateKey(item.created_at);
      const current = map.get(key) ?? { total: 0, call: 0, whatsapp: 0 };
      current.total += 1;
      if (item.enquiry_channel === "call") current.call += 1;
      if (item.enquiry_channel === "whatsapp") current.whatsapp += 1;
      map.set(key, current);
    });
    return map;
  }, [filteredEnquiries]);

  const selectedDateCounts = dayCounts.get(selectedDate) ?? emptyDayCounts;

  const goToMonth = (delta: number) => setCalendarMonth((current) => {
    const total = current.year * 12 + current.month + delta;
    return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
  });
  const goToToday = () => {
    const [year, month] = todayKey.split("-").map(Number);
    setCalendarMonth({ year, month: month - 1 });
    setSelectedDate(todayKey);
  };

  const vendorSummaries = useMemo(() => {
    const grouped = new Map<string, VendorEnquirySummary>();
    channelEnquiries.forEach((item) => {
      const current = grouped.get(item.vendor_id) ?? {
        vendorId: item.vendor_id,
        vendorName: item.vendor_name,
        categoryId: item.category_id,
        categoryName: item.category_name,
        callCount: 0,
        whatsappCount: 0,
        totalCount: 0,
      };
      if (item.enquiry_channel === "call") current.callCount += 1;
      if (item.enquiry_channel === "whatsapp") current.whatsappCount += 1;
      current.totalCount += 1;
      grouped.set(item.vendor_id, current);
    });
    const needle = query.trim().toLowerCase();
    return [...grouped.values()]
      .filter((vendor) => (categoryId === "all" || vendor.categoryId === categoryId)
        && (!needle || vendor.vendorName.toLowerCase().includes(needle)))
      .sort((a, b) => b.totalCount - a.totalCount || a.vendorName.localeCompare(b.vendorName));
  }, [categoryId, channelEnquiries, query]);

  const pages = Math.max(1, Math.ceil(vendorSummaries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = vendorSummaries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalCalls = vendorSummaries.reduce((sum, vendor) => sum + vendor.callCount, 0);
  const totalWhatsApp = vendorSummaries.reduce((sum, vendor) => sum + vendor.whatsappCount, 0);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Enquiries"
            subtitle="Compare Call and WhatsApp interest by category and vendor"
            action={<Pressable accessibilityLabel="Refresh enquiry summary" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>}
          />

          <View className="flex-row flex-wrap gap-3 mb-5">
            <SummaryMetric label="Vendors with enquiries" value={vendorSummaries.length} icon={Store} />
            <SummaryMetric label="Call enquiries" value={totalCalls} icon={Phone} />
            <SummaryMetric label="WhatsApp enquiries" value={totalWhatsApp} icon={MessageCircle} />
          </View>

          <Text className="text-foreground font-bold mb-2">Filter by category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            <CategoryFilter label="All categories" selected={categoryId === "all"} onPress={() => { setCategoryId("all"); setPage(1); }} />
            {categories.map((category) => (
              <CategoryFilter key={category.id} label={category.name} selected={categoryId === category.id} onPress={() => { setCategoryId(category.id); setPage(1); }} />
            ))}
          </ScrollView>

          <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center mb-4">
            <Search size={18} className="text-muted-foreground" />
            <TextInput
              value={query}
              onChangeText={(value) => { setQuery(value); setPage(1); }}
              placeholder="Search vendors"
              placeholderTextColor="#8A8589"
              className="flex-1 h-12 ml-3 text-foreground"
            />
          </View>

          <EnquiryCalendarSection
            calendarMonth={calendarMonth}
            selectedDate={selectedDate}
            dayCounts={dayCounts}
            todayKey={todayKey}
            onSelectDate={setSelectedDate}
            onPrevMonth={() => goToMonth(-1)}
            onNextMonth={() => goToMonth(1)}
            onToday={goToToday}
          />
          <SelectedDaySummary dateKey={selectedDate} counts={selectedDateCounts} />

          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-foreground font-bold">Vendor enquiry summary</Text>
              <Text className="text-muted-foreground text-xs mt-1">Sorted by highest total enquiries</Text>
            </View>
            <Text className="text-muted-foreground text-xs">{vendorSummaries.length} vendor{vendorSummaries.length === 1 ? "" : "s"}</Text>
          </View>

          {loading ? <AdminLoadingState label="Loading vendor enquiry totals…" />
            : error ? <AdminErrorState message={error} onRetry={() => void load()} />
              : !visible.length ? <AdminEmptyState title="No vendor enquiries found" message={query || categoryId !== "all" ? "Try another vendor search or category." : "Call and WhatsApp enquiries will appear here."} />
                : <View className="gap-3">{visible.map((vendor) => <VendorSummaryCard key={vendor.vendorId} vendor={vendor} />)}</View>}

          {!loading && !error && vendorSummaries.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}

function EnquiryCalendarSection({
  calendarMonth, selectedDate, dayCounts, todayKey, onSelectDate, onPrevMonth, onNextMonth, onToday,
}: {
  calendarMonth: { year: number; month: number };
  selectedDate: string;
  dayCounts: Map<string, DayCounts>;
  todayKey: string;
  onSelectDate: (dateKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}) {
  const { year, month } = calendarMonth;
  const totalDays = daysInMonth(year, month);
  const leadingBlanks = firstWeekdayMondayIndexed(year, month);
  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`),
  ];

  return (
    <View className="bg-card border border-border rounded-2xl p-2.5 mb-5">
      <View className="flex-row items-center justify-between h-8">
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={onPrevMonth} className="w-7 h-7 rounded-lg bg-background items-center justify-center">
          <ChevronLeft size={16} className="text-foreground" />
        </Pressable>
        <View className="flex-row items-center gap-1.5">
          <CalendarDays size={14} className="text-primary" />
          <Text className="text-foreground font-bold text-sm">{MONTH_NAMES[month]} {year}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={onNextMonth} className="w-7 h-7 rounded-lg bg-background items-center justify-center">
          <ChevronRight size={16} className="text-foreground" />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={onToday} className="self-center mt-1 mb-1 px-2.5 h-5 rounded-full bg-primary/10 items-center justify-center">
        <Text className="text-primary text-caption font-bold">Today</Text>
      </Pressable>

      <View className="flex-row">
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={{ width: `${100 / 7}%` }} className="items-center py-0.5">
            <Text className="text-muted-foreground text-caption font-bold">{label}</Text>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((dateKey, index) => {
          if (!dateKey) return <View key={`blank-${index}`} style={{ width: `${100 / 7}%`, height: 38 }} className="p-px" />;
          const counts = dayCounts.get(dateKey);
          const selected = dateKey === selectedDate;
          const isToday = dateKey === todayKey;
          const dayNumber = Number(dateKey.slice(-2));
          return (
            <View key={dateKey} style={{ width: `${100 / 7}%`, height: 38 }} className="p-px">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatDateKeyLabel(dateKey)}${counts ? `, ${counts.total} enquir${counts.total === 1 ? "y" : "ies"}` : ""}`}
                accessibilityState={{ selected }}
                onPress={() => onSelectDate(dateKey)}
                className="flex-1 rounded-lg items-center justify-center"
                style={{
                  backgroundColor: selected ? "#E91E63" : counts ? "#FFF0F6" : "transparent",
                  borderWidth: isToday && !selected ? 1 : 0,
                  borderColor: "#E91E63",
                }}
              >
                <Text className={selected ? "text-white text-xs font-bold" : "text-foreground text-xs font-bold"}>{dayNumber}</Text>
                {counts ? <Text className={selected ? "text-white text-caption" : "text-primary text-caption font-bold"} style={{ lineHeight: 12 }}>{counts.total}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SelectedDaySummary({ dateKey, counts }: { dateKey: string; counts: DayCounts }) {
  return (
    <View className="bg-card border border-border rounded-2xl p-4 mb-5">
      <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-1">Selected date</Text>
      <Text className="text-foreground text-lg font-bold mb-3">{formatDateKeyLabel(dateKey)}</Text>
      {counts.total === 0 ? <Text className="text-muted-foreground text-sm mb-3">No enquiries on this date.</Text> : null}
      <View className="flex-row gap-3">
        <DaySummaryMetric label="Total" value={counts.total} />
        <DaySummaryMetric label="Call" value={counts.call} icon={Phone} />
        <DaySummaryMetric label="WhatsApp" value={counts.whatsapp} icon={MessageCircle} />
      </View>
    </View>
  );
}

function DaySummaryMetric({ label, value, icon: Icon }: { label: string; value: number; icon?: React.ElementType }) {
  return (
    <View className="flex-1 min-w-0 bg-background rounded-xl p-3 items-center">
      {Icon ? <Icon size={15} className="text-primary mb-1" /> : null}
      <Text className="text-foreground text-lg font-bold">{value.toLocaleString("en-IN")}</Text>
      <Text className="text-muted-foreground text-caption mt-0.5">{label}</Text>
    </View>
  );
}

function CategoryFilter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} className={selected ? "min-h-11 px-4 rounded-xl bg-primary items-center justify-center" : "min-h-11 px-4 rounded-xl bg-card border border-border items-center justify-center"}>
      <Text className={selected ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{label}</Text>
    </Pressable>
  );
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <View className="flex-1 min-w-44 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3">
      <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Icon size={18} className="text-primary" /></View>
      <View><Text className="text-foreground text-xl font-bold">{value.toLocaleString("en-IN")}</Text><Text className="text-muted-foreground text-xs mt-0.5">{label}</Text></View>
    </View>
  );
}

function VendorSummaryCard({ vendor }: { vendor: VendorEnquirySummary }) {
  return (
    <View className="bg-card border border-border rounded-2xl p-4">
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Store size={19} className="text-primary" /></View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground font-bold" numberOfLines={1}>{vendor.vendorName}</Text>
          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>{vendor.categoryName}</Text>
        </View>
        <View className="items-end">
          <Text className="text-foreground text-xl font-bold">{vendor.totalCount.toLocaleString("en-IN")}</Text>
          <Text className="text-muted-foreground text-caption">total enquiries</Text>
        </View>
      </View>
      <View className="flex-row gap-3 mt-4 pt-4 border-t border-border">
        <ChannelCount label="Call" value={vendor.callCount} icon={Phone} />
        <ChannelCount label="WhatsApp" value={vendor.whatsappCount} icon={MessageCircle} />
      </View>
    </View>
  );
}

function ChannelCount({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <View className="flex-1 min-w-0 bg-background rounded-xl p-3 flex-row items-center gap-2">
      <Icon size={16} className="text-primary" />
      <Text className="text-muted-foreground text-xs flex-1">{label}</Text>
      <Text className="text-foreground font-bold">{value.toLocaleString("en-IN")}</Text>
    </View>
  );
}
