import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight, CalendarDays, MessageCircle, Phone, RefreshCw, Search, Store, Ticket, UserRound, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminTableSkeleton } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";
import { DateField } from "@/components/admin/crm/ui/DateField";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminEnquiry } from "@/services/adminOperations";
import { adminErrorMessage } from "@/services/adminErrors";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";

const PAGE_SIZE = 15;
const ENQUIRY_TIMEZONE = "Asia/Kolkata";
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: ENQUIRY_TIMEZONE });
type TimePeriod = "all" | "day" | "month" | "year";
const periodLabels: Record<TimePeriod, string> = { all: "All time", day: "Daily", month: "Monthly", year: "Yearly" };
const monthOptions = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((name, index) => ({ id: String(index + 1).padStart(2, "0"), name }));
const currentYear = Number(todayIst().slice(0, 4));
const yearOptions = Array.from({ length: 11 }, (_, index) => ({ id: String(currentYear - index), name: String(currentYear - index) }));

export default function AdminEnquiries() {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [items, setItems] = useState<AdminEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [calls, setCalls] = useState(0);
  const [whatsapp, setWhatsapp] = useState(0);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | "all">("all");
  const [period, setPeriod] = useState<TimePeriod>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnquiry, setSelectedEnquiry] = useState<AdminEnquiry | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { void CategoryService.list().then(setCategories).catch(() => setCategories([])); }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await AdminOperationsService.enquiries({
        page,
        pageSize: PAGE_SIZE,
        query: search,
        categoryId: categoryId === "all" ? null : categoryId,
        date: period === "day"
          ? selectedDate
          : period === "month" && selectedMonth && selectedYear
            ? `${selectedYear}-${selectedMonth}-01`
            : period === "year" && selectedYear
              ? `${selectedYear}-01-01`
              : null,
        period,
      });
      setItems(result.rows);
      setTotal(result.total);
      setCalls(result.calls);
      setWhatsapp(result.whatsapp);
    } catch (cause) {
      setError(adminErrorMessage(cause, "Unable to load enquiries."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, page, period, search, selectedDate, selectedMonth, selectedYear]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => AdminOperationsService.subscribe("vendor_enquiries", () => void load(true)), [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryOptions = useMemo(() => [{ id: "all", name: "All categories" }, ...categories.map(({ id, name }) => ({ id, name }))], [categories]);
  const selectedCategoryName = categoryOptions.find((category) => category.id === categoryId)?.name ?? "All categories";
  const firstResult = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 72 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#0878E8" />}
      >
        <ResponsiveContainer style={{ maxWidth: 1180, alignSelf: "center" }}>
          <AdminPageHeader
            title="Enquiries"
            subtitle="See every customer Call or WhatsApp connection to a vendor"
            action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh enquiries" disabled={refreshing} className="min-w-11 min-h-11 rounded-xl border border-primary/15 bg-card items-center justify-center active:bg-primary/10" style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: refreshing ? 0.55 : 1 })} onPress={() => void load(true)}>{refreshing ? <ActivityIndicator size="small" color="#0878E8" /> : <RefreshCw size={19} className="text-primary" />}</Pressable>}
          />

          <View className={desktop ? "flex-row items-end gap-3 mb-5" : "gap-3 mb-5"}>
            <View style={desktop ? { width: 280 } : undefined}>
              <HierarchySelect label="Category" value={selectedCategoryName} options={categoryOptions} selectedId={categoryId} onSelect={(id) => { setCategoryId(id); setPage(1); }} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-label font-inter-semibold mb-2">Search enquiries</Text>
              <View className="h-12 bg-card border border-border rounded-xl px-4 flex-row items-center gap-3 focus-within:border-primary/50">
                <Search size={18} className="text-muted-foreground" />
                <TextInput accessibilityLabel="Search customers or vendors" value={query} onChangeText={setQuery} placeholder="Customer name, phone, email or vendor" placeholderTextColor="#6B7280" className="flex-1 min-w-0 h-12 text-foreground text-body" />
              </View>
            </View>
          </View>

          <View className="mb-5">
            <Text className="text-foreground text-label font-inter-semibold mb-2">Time period</Text>
            <View className="flex-row flex-wrap gap-2">
              {(Object.keys(periodLabels) as TimePeriod[]).map((value) => {
                const active = period === value;
                return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active }} className={`min-h-11 px-4 rounded-xl flex-row items-center justify-center gap-2 border ${active ? "bg-primary border-primary" : "bg-card border-border"}`} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })} onPress={() => {
                  const today = todayIst();
                  setPeriod(value);
                  setSelectedDate(value === "day" ? (selectedDate ?? today) : null);
                  setSelectedMonth(value === "month" ? (selectedMonth ?? today.slice(5, 7)) : null);
                  setSelectedYear(value === "month" || value === "year" ? (selectedYear ?? today.slice(0, 4)) : null);
                  setPage(1);
                }}><CalendarDays size={15} color={active ? "#FFFFFF" : "#6B7280"} /><Text className={`text-xs font-bold ${active ? "text-white" : "text-foreground"}`}>{periodLabels[value]}</Text></Pressable>;
              })}
            </View>
            {period === "day" && selectedDate ? (
              <View className="mt-3 max-w-sm">
                <DateField label="Select day" value={selectedDate} onChange={(value) => { setSelectedDate(value); setPage(1); }} />
              </View>
            ) : null}
            {period === "month" && selectedMonth && selectedYear ? (
              <View className={desktop ? "flex-row gap-3 mt-3 max-w-xl" : "gap-3 mt-3"}>
                <View className="flex-1"><HierarchySelect label="Month" value={monthOptions.find((item) => item.id === selectedMonth)?.name} options={monthOptions} selectedId={selectedMonth} onSelect={(value) => { setSelectedMonth(value); setPage(1); }} /></View>
                <View className="flex-1"><HierarchySelect label="Year" value={selectedYear} options={yearOptions} selectedId={selectedYear} onSelect={(value) => { setSelectedYear(value); setPage(1); }} /></View>
              </View>
            ) : null}
            {period === "year" && selectedYear ? (
              <View className="mt-3 max-w-xs"><HierarchySelect label="Year" value={selectedYear} options={yearOptions} selectedId={selectedYear} onSelect={(value) => { setSelectedYear(value); setPage(1); }} /></View>
            ) : null}
          </View>

          <View className="flex-row flex-wrap gap-3 mb-6">
            <SummaryMetric label="Total enquiries" value={total} icon={Store} />
            <SummaryMetric label="Call enquiries" value={calls} icon={Phone} />
            <SummaryMetric label="WhatsApp enquiries" value={whatsapp} icon={MessageCircle} />
          </View>

          <View className="flex-row items-end justify-between gap-4 mb-3 px-1">
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-base font-bold">Enquiry activity</Text>
              <Text className="text-muted-foreground text-xs mt-1">Newest customer actions appear first</Text>
            </View>
            {!loading && !error ? <Text className="text-muted-foreground text-xs text-right">{total ? `${firstResult}–${lastResult} of ${total.toLocaleString("en-IN")}` : "0 enquiries"}</Text> : null}
          </View>

          {loading ? <AdminTableSkeleton rows={5} />
            : error ? <AdminErrorState message={error} onRetry={() => void load()} />
              : !items.length ? <AdminEmptyState title="No enquiries found" message={search || categoryId !== "all" ? "Try another customer, vendor or category." : "Call and WhatsApp enquiries will appear here."} />
                : <View className="gap-3">{items.map((item) => <EnquiryRow key={item.id} item={item} desktop={desktop} onPress={() => setSelectedEnquiry(item)} />)}</View>}

          {!loading && !error && total > PAGE_SIZE ? <PaginationBar page={page} pages={pages} onPage={setPage} total={total} pageSize={PAGE_SIZE} /> : null}
        </ResponsiveContainer>
      </ScrollView>
      <EnquiryTicket enquiry={selectedEnquiry} onClose={() => setSelectedEnquiry(null)} />
      <AdminFooter />
    </SafeAreaView>
  );
}

function EnquiryRow({ item, desktop, onPress }: { item: AdminEnquiry; desktop: boolean; onPress: () => void }) {
  const channel = item.enquiry_channel === "whatsapp" ? "WhatsApp" : "Call";
  const ChannelIcon = item.enquiry_channel === "whatsapp" ? MessageCircle : Phone;
  const customerContact = item.customer_phone || item.customer_email || (item.customer_id ? "Registered customer" : "Guest customer");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open enquiry ${item.reference_code}`}
      className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:border-primary/35 hover:-translate-y-px hover:shadow-md active:bg-primary/5 transition-all duration-200 ease-out"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.995 : 1 }] })}
      onPress={onPress}
    >
      <View className={desktop ? "flex-row items-center gap-4" : "gap-4"}>
        <Identity image={item.customer_profile_image} name={item.customer_name || "Guest customer"} detail={customerContact} fallbackIcon={UserRound} />
        <View className={desktop ? "w-8 items-center" : "flex-row items-center gap-2 pl-1"}><ArrowRight size={16} className="text-muted-foreground" />{!desktop ? <Text className="text-muted-foreground text-caption">contacted</Text> : null}</View>
        <Identity image={item.vendor_logo} name={item.vendor_name} detail={item.category_name} fallbackIcon={Store} />
        <View className={desktop ? "w-32 items-start" : "flex-row items-center justify-between gap-3 pt-3 border-t border-border"}>
          <View className={`min-h-9 px-3 rounded-full flex-row items-center gap-2 ${item.enquiry_channel === "whatsapp" ? "bg-green-500/10" : "bg-primary/10"}`}>
            <ChannelIcon size={15} color={item.enquiry_channel === "whatsapp" ? "#15803D" : "#0878E8"} />
            <Text className={`text-xs font-bold ${item.enquiry_channel === "whatsapp" ? "text-green-700" : "text-primary"}`}>{channel}</Text>
          </View>
          {!desktop ? <Timestamp value={item.created_at} /> : null}
        </View>
        {desktop ? <View className="w-40 items-end"><Timestamp value={item.created_at} /></View> : null}
      </View>
    </Pressable>
  );
}

function EnquiryTicket({ enquiry, onClose }: { enquiry: AdminEnquiry | null; onClose: () => void }) {
  const { width } = useWindowDimensions();
  if (!enquiry) return null;
  const desktop = width >= 900;
  const channel = enquiry.enquiry_channel === "whatsapp" ? "WhatsApp" : "Call";
  const ChannelIcon = enquiry.enquiry_channel === "whatsapp" ? MessageCircle : Phone;
  const occurredAt = new Date(enquiry.created_at);
  const ticketDate = occurredAt.toLocaleDateString("en-IN", { timeZone: ENQUIRY_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
  const ticketTime = occurredAt.toLocaleTimeString("en-IN", { timeZone: ENQUIRY_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className={`flex-1 bg-black/55 ${desktop ? "items-center justify-center px-5" : "justify-end"}`}>
        <Pressable accessibilityLabel="Close enquiry ticket" className="absolute inset-0" onPress={onClose} />
        <View className={`w-full bg-card max-h-[88%] overflow-hidden ${desktop ? "max-w-[1180px] rounded-3xl" : "rounded-t-3xl"}`}>
          <View className="items-center pt-3 pb-1 bg-primary/5">
            <View className="w-10 h-1 rounded-full bg-border" />
          </View>
          <View className={`px-5 pt-4 pb-6 bg-primary/5 border-b border-primary/10 ${desktop ? "px-12 pt-8 pb-8" : ""}`}>
            <View className="flex-row items-start gap-4">
              <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center">
                <Ticket size={30} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0 pt-0.5">
                <Text className="text-foreground text-2xl font-bold">Enquiry ticket</Text>
                <Text className="text-muted-foreground text-base mt-1">A customer connected with a vendor</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" className="min-w-11 min-h-11 -mt-2 -mr-2 rounded-full border border-border bg-card items-center justify-center active:bg-muted" onPress={onClose}><X size={21} className="text-foreground" /></Pressable>
            </View>
            <View className={`mt-6 ${desktop ? "flex-row items-center justify-between gap-5" : "gap-4"}`}>
              <View className="flex-row flex-wrap items-center gap-2">
                <View className="min-h-11 px-4 rounded-xl bg-card border border-primary/30 flex-row items-center">
                <Text className="text-primary text-sm font-bold">Ticket #{enquiry.reference_code}</Text>
                </View>
                <View className={`min-h-11 px-4 rounded-xl flex-row items-center gap-2 ${enquiry.enquiry_channel === "whatsapp" ? "bg-green-500/10" : "bg-primary/10"}`}>
                  <ChannelIcon size={17} color={enquiry.enquiry_channel === "whatsapp" ? "#15803D" : "#0878E8"} />
                  <Text className={`text-sm font-bold ${enquiry.enquiry_channel === "whatsapp" ? "text-green-700" : "text-primary"}`}>{channel}</Text>
                </View>
              </View>
              <View className="self-start bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center"><CalendarDays size={19} className="text-primary" /></View>
                <View><Text className="text-foreground text-sm font-bold">{ticketDate}</Text><Text className="text-muted-foreground text-xs mt-1">{ticketTime} IST</Text></View>
              </View>
            </View>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <View className={`px-5 pt-6 ${desktop ? "px-12 pt-8" : ""}`}>
              <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Connection details</Text>
              <View className={desktop ? "flex-row items-center gap-5 mt-4" : "gap-3 mt-4"}>
                <TicketIdentity compact image={enquiry.customer_profile_image} name={enquiry.customer_name || "Guest customer"} icon={UserRound} details={[enquiry.customer_id ? "Registered customer" : "Guest customer"]} />
                <View className={desktop ? "flex-1 flex-row items-center" : "flex-row items-center justify-center"}>
                  <View className={desktop ? "flex-1 border-t border-dashed border-primary/35" : "w-12 border-t border-dashed border-primary/35"} />
                  <View className="w-11 h-11 rounded-full bg-primary/10 border border-primary/15 items-center justify-center mx-2"><ArrowRight size={21} className="text-primary" /></View>
                  <View className={desktop ? "flex-1 border-t border-dashed border-primary/35" : "w-12 border-t border-dashed border-primary/35"} />
                </View>
                <TicketIdentity compact image={enquiry.vendor_logo} name={enquiry.vendor_name} icon={Store} details={[enquiry.category_name]} />
              </View>
            </View>
            <View className={`mt-7 border-t border-border px-5 pt-6 pb-8 ${desktop ? "px-12 flex-row gap-12" : ""}`}>
              <TicketIdentity title="Customer" image={enquiry.customer_profile_image} name={enquiry.customer_name || "Guest customer"} icon={UserRound} details={[enquiry.customer_phone, enquiry.customer_email, enquiry.customer_id ? "Registered customer" : "Guest customer"]} />
              <TicketIdentity title="Vendor" image={enquiry.vendor_logo} name={enquiry.vendor_name} icon={Store} details={[enquiry.vendor_phone, enquiry.category_name]} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TicketIdentity({ title, compact = false, image, name, icon: Icon, details }: { title?: string; compact?: boolean; image: string | null; name: string; icon: React.ElementType; details: (string | null)[] }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View className={compact ? "flex-1 min-w-0 bg-background border border-border rounded-2xl p-4" : "flex-1 min-w-0"}>
      {title ? <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-4">{title}</Text> : null}
      <View className="flex-row items-center gap-3">
        <View className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/10 overflow-hidden items-center justify-center">{image && !imageFailed ? <Image source={{ uri: image }} className="w-14 h-14" resizeMode="cover" onError={() => setImageFailed(true)} /> : <Icon size={22} className="text-primary" />}</View>
        <View className="flex-1 min-w-0"><Text className="text-foreground text-base font-bold" numberOfLines={1}>{name}</Text>{details.filter(Boolean).map((detail) => <Text key={detail} className="text-muted-foreground text-sm mt-1" numberOfLines={1}>{detail}</Text>)}</View>
      </View>
    </View>
  );
}

function SummaryMetric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <View className="flex-1 min-w-44 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3">
      <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Icon size={18} className="text-primary" /></View>
      <View className="flex-1 min-w-0"><Text className="text-foreground text-xl font-bold">{value.toLocaleString("en-IN")}</Text><Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{label}</Text></View>
    </View>
  );
}

function Identity({ image, name, detail, fallbackIcon: FallbackIcon }: { image: string | null; name: string; detail: string; fallbackIcon: React.ElementType }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View className="flex-1 min-w-0 flex-row items-center gap-3">
      <View className="w-12 h-12 rounded-xl bg-primary/10 overflow-hidden items-center justify-center">
        {image && !imageFailed ? <Image source={{ uri: image }} accessibilityLabel={`${name} profile`} className="w-12 h-12" resizeMode="cover" onError={() => setImageFailed(true)} /> : <FallbackIcon size={20} className="text-primary" />}
      </View>
      <View className="flex-1 min-w-0"><Text className="text-foreground text-sm font-bold" numberOfLines={1}>{name}</Text><Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>{detail}</Text></View>
    </View>
  );
}

function Timestamp({ value }: { value: string }) {
  const date = new Date(value);
  const day = date.toLocaleDateString("en-IN", { timeZone: ENQUIRY_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-IN", { timeZone: ENQUIRY_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return <View><Text className="text-foreground text-xs font-semibold text-right">{day}</Text><Text className="text-muted-foreground text-caption mt-0.5 text-right">{time} IST</Text></View>;
}
