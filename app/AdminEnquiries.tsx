import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquareText,
  Phone,
  PhoneCall,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Store,
  Tag,
  Ticket,
  UserCheck,
  UserRound,
  X,
  XCircle,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminTableSkeleton } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";
import { adminContentWidth } from "@/utils/responsiveLayout";
import { DateField } from "@/components/admin/crm/ui/DateField";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminEnquiry, type AdminEnquiryStatus } from "@/services/adminOperations";
import { adminErrorMessage } from "@/services/adminErrors";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { normalizeWhatsAppPhone } from "@/services/contactActions";

const PAGE_SIZE = 15;
const ENQUIRY_TIMEZONE = "Asia/Kolkata";
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: ENQUIRY_TIMEZONE });
type TimePeriod = "all" | "day" | "month" | "year";
const periodLabels: Record<TimePeriod, string> = { all: "All time", day: "Daily", month: "Monthly", year: "Yearly" };
const monthOptions = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((name, index) => ({ id: String(index + 1).padStart(2, "0"), name }));
const currentYear = Number(todayIst().slice(0, 4));
const yearOptions = Array.from({ length: 11 }, (_, index) => ({ id: String(currentYear - index), name: String(currentYear - index) }));

export const ADMIN_WORKFLOW_STATUSES: { id: AdminEnquiryStatus; label: string; color: string; bg: string }[] = [
  { id: "new", label: "New Lead", color: "#2563EB", bg: "bg-blue-500/10 text-blue-700 border-blue-500/20" },
  { id: "customer_contacted", label: "Customer Contacted", color: "#0891B2", bg: "bg-cyan-500/10 text-cyan-700 border-cyan-500/20" },
  { id: "vendor_contacted", label: "Vendor Contacted", color: "#7C3AED", bg: "bg-purple-500/10 text-purple-700 border-purple-500/20" },
  { id: "in_progress", label: "In Progress", color: "#D97706", bg: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  { id: "awaiting_confirmation", label: "Awaiting Conf.", color: "#EA580C", bg: "bg-orange-500/10 text-orange-700 border-orange-500/20" },
  { id: "confirmed", label: "Confirmed", color: "#16A34A", bg: "bg-green-500/10 text-green-700 border-green-500/20" },
  { id: "closed", label: "Closed", color: "#4B5563", bg: "bg-gray-500/10 text-gray-700 border-gray-500/20" },
  { id: "cancelled", label: "Cancelled", color: "#DC2626", bg: "bg-red-500/10 text-red-700 border-red-500/20" },
];

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "customer_contacted", label: "Customer Contacted" },
  { id: "vendor_contacted", label: "Vendor Contacted" },
  { id: "in_progress", label: "In Progress" },
  { id: "awaiting_confirmation", label: "Awaiting Confirmation" },
  { id: "confirmed", label: "Confirmed" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
];

export default function AdminEnquiries() {
  const { width } = useWindowDimensions();
  const desktop = adminContentWidth(width) >= 980;
  const [items, setItems] = useState<AdminEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [calls, setCalls] = useState(0);
  const [whatsapp, setWhatsapp] = useState(0);
  const [formCount, setFormCount] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
        statusFilter: statusFilter === "all" ? null : statusFilter,
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
      setFormCount(result.form);
      setNewCount(result.newCount);
      setInProgressCount(result.inProgressCount);
      setConfirmedCount(result.confirmedCount);

      if (selectedEnquiry) {
        const refreshedSelected = result.rows.find((r) => r.id === selectedEnquiry.id);
        if (refreshedSelected) setSelectedEnquiry(refreshedSelected);
      }
    } catch (cause) {
      setError(adminErrorMessage(cause, "Unable to load enquiries."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [categoryId, page, period, search, selectedDate, selectedMonth, selectedYear, statusFilter, selectedEnquiry?.id]);

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
        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          <AdminPageHeader
            title="Enquiry Hub"
            subtitle="Centralised Admin-Managed enquiry coordinator for customers & vendors"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh enquiries"
                disabled={refreshing}
                className="min-w-11 min-h-11 rounded-xl border border-primary/15 bg-card items-center justify-center active:bg-primary/10"
                style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: refreshing ? 0.55 : 1 })}
                onPress={() => void load(true)}
              >
                {refreshing ? <ActivityIndicator size="small" color="#0878E8" /> : <RefreshCw size={19} className="text-primary" />}
              </Pressable>
            }
          />

          {/* Search & Category Filter */}
          <View className={desktop ? "flex-row items-end gap-3 mb-4" : "gap-3 mb-4"}>
            <View style={desktop ? { width: 280 } : undefined}>
              <HierarchySelect label="Category" value={selectedCategoryName} options={categoryOptions} selectedId={categoryId} onSelect={(id) => { setCategoryId(id); setPage(1); }} />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-label font-inter-semibold mb-2">Search enquiries</Text>
              <View className="h-12 bg-card border border-border rounded-xl px-4 flex-row items-center gap-3 focus-within:border-primary/50">
                <Search size={18} className="text-muted-foreground" />
                <TextInput
                  accessibilityLabel="Search customers, vendors or reference code"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Customer name, phone, email, vendor or RL-ENQ..."
                  placeholderTextColor="#6B7280"
                  className="flex-1 min-w-0 h-12 text-foreground text-body"
                />
              </View>
            </View>
          </View>

          {/* Status Tab Filters */}
          <View className="mb-4">
            <Text className="text-foreground text-label font-inter-semibold mb-2">Status workflow</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {STATUS_FILTERS.map((item) => {
                const active = statusFilter === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`min-h-10 px-4 rounded-xl flex-row items-center justify-center border ${
                      active ? "bg-primary border-primary" : "bg-card border-border"
                    }`}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
                    onPress={() => {
                      setStatusFilter(item.id);
                      setPage(1);
                    }}
                  >
                    <Text className={`text-xs font-bold ${active ? "text-white" : "text-foreground"}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Time Period Filter */}
          <View className="mb-5">
            <Text className="text-foreground text-label font-inter-semibold mb-2">Time period</Text>
            <View className="flex-row flex-wrap gap-2">
              {(Object.keys(periodLabels) as TimePeriod[]).map((value) => {
                const active = period === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    className={`min-h-10 px-3.5 rounded-xl flex-row items-center justify-center gap-2 border ${
                      active ? "bg-primary border-primary" : "bg-card border-border"
                    }`}
                    style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
                    onPress={() => {
                      const today = todayIst();
                      setPeriod(value);
                      setSelectedDate(value === "day" ? (selectedDate ?? today) : null);
                      setSelectedMonth(value === "month" ? (selectedMonth ?? today.slice(5, 7)) : null);
                      setSelectedYear(value === "month" || value === "year" ? (selectedYear ?? today.slice(0, 4)) : null);
                      setPage(1);
                    }}
                  >
                    <CalendarDays size={14} color={active ? "#FFFFFF" : "#6B7280"} />
                    <Text className={`text-xs font-bold ${active ? "text-white" : "text-foreground"}`}>
                      {periodLabels[value]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {period === "day" && selectedDate ? (
              <View className="mt-3 max-w-sm">
                <DateField label="Select day" value={selectedDate} onChange={(value) => { setSelectedDate(value); setPage(1); }} />
              </View>
            ) : null}
            {period === "month" && selectedMonth && selectedYear ? (
              <View className={desktop ? "flex-row gap-3 mt-3 max-w-xl" : "gap-3 mt-3"}>
                <View className="flex-1">
                  <HierarchySelect label="Month" value={monthOptions.find((item) => item.id === selectedMonth)?.name} options={monthOptions} selectedId={selectedMonth} onSelect={(value) => { setSelectedMonth(value); setPage(1); }} />
                </View>
                <View className="flex-1">
                  <HierarchySelect label="Year" value={selectedYear} options={yearOptions} selectedId={selectedYear} onSelect={(value) => { setSelectedYear(value); setPage(1); }} />
                </View>
              </View>
            ) : null}
            {period === "year" && selectedYear ? (
              <View className="mt-3 max-w-xs">
                <HierarchySelect label="Year" value={selectedYear} options={yearOptions} selectedId={selectedYear} onSelect={(value) => { setSelectedYear(value); setPage(1); }} />
              </View>
            ) : null}
          </View>

          {/* Metric Summary Cards */}
          <View className="flex-row flex-wrap gap-3 mb-6">
            <SummaryMetric label="Total Leads" value={total} icon={Store} color="#0878E8" />
            <SummaryMetric label="New Leads" value={newCount} icon={Sparkles} color="#2563EB" />
            <SummaryMetric label="In Progress" value={inProgressCount} icon={Clock} color="#D97706" />
            <SummaryMetric label="Confirmed" value={confirmedCount} icon={CheckCircle2} color="#16A34A" />
            <SummaryMetric label="Call Clicks" value={calls} icon={Phone} color="#0878E8" />
            <SummaryMetric label="WhatsApp Clicks" value={whatsapp} icon={MessageCircle} color="#15803D" />
          </View>

          {/* Header Row */}
          <View className="flex-row items-end justify-between gap-4 mb-3 px-1">
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-base font-bold">Customer Enquiries</Text>
              <Text className="text-muted-foreground text-xs mt-1">
                Tap any ticket to view customer and vendor details, make calls, WhatsApp or update status
              </Text>
            </View>
            {!loading && !error ? (
              <Text className="text-muted-foreground text-xs text-right">
                {total ? `${firstResult}–${lastResult} of ${total.toLocaleString("en-IN")}` : "0 enquiries"}
              </Text>
            ) : null}
          </View>

          {/* Listing Rows */}
          {loading ? (
            <AdminTableSkeleton rows={5} />
          ) : error ? (
            <AdminErrorState message={error} onRetry={() => void load()} />
          ) : !items.length ? (
            <AdminEmptyState
              title="No enquiries found"
              message={
                search || categoryId !== "all" || statusFilter !== "all"
                  ? "Try adjusting your search, category or status filters."
                  : "Customer pre-booking enquiries will appear here for Admin management."
              }
            />
          ) : (
            <View className="gap-3">
              {items.map((item) => (
                <EnquiryRow
                  key={item.id}
                  item={item}
                  desktop={desktop}
                  onPress={() => setSelectedEnquiry(item)}
                />
              ))}
            </View>
          )}

          {!loading && !error && total > PAGE_SIZE ? (
            <PaginationBar page={page} pages={pages} onPage={setPage} total={total} pageSize={PAGE_SIZE} />
          ) : null}
        </ResponsiveContainer>
      </ScrollView>

      {/* Interactive Admin Ticket Modal */}
      <EnquiryTicketModal
        enquiry={selectedEnquiry}
        onClose={() => setSelectedEnquiry(null)}
        onUpdated={() => void load(true)}
      />
      <AdminFooter />
    </SafeAreaView>
  );
}

function EnquiryRow({ item, desktop, onPress }: { item: AdminEnquiry; desktop: boolean; onPress: () => void }) {
  const statusMeta = ADMIN_WORKFLOW_STATUSES.find((s) => s.id === item.status) ?? {
    id: item.status,
    label: item.status.replace(/_/g, " "),
    color: "#6B7280",
    bg: "bg-muted text-foreground border-border",
  };

  const channelLabel = item.enquiry_channel === "whatsapp" ? "WhatsApp" : item.enquiry_channel === "call" ? "Call" : "Form";
  const ChannelIcon = item.enquiry_channel === "whatsapp" ? MessageCircle : item.enquiry_channel === "call" ? Phone : MessageSquareText;
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
        {/* Customer Identity */}
        <Identity
          image={item.customer_profile_image}
          name={item.customer_name || "Guest customer"}
          detail={customerContact}
          fallbackIcon={UserRound}
          badge="Customer"
        />

        {/* Direction Arrow */}
        <View className={desktop ? "w-8 items-center" : "flex-row items-center gap-2 pl-1"}>
          <ArrowRight size={16} className="text-muted-foreground" />
          {!desktop ? <Text className="text-muted-foreground text-caption">enquired for</Text> : null}
        </View>

        {/* Vendor Identity */}
        <Identity
          image={item.vendor_logo}
          name={item.vendor_name}
          detail={item.category_name}
          fallbackIcon={Store}
          badge="Vendor"
        />

        {/* Channel & Status */}
        <View className={desktop ? "w-44 items-start gap-1.5" : "flex-row flex-wrap items-center justify-between gap-2 pt-3 border-t border-border"}>
          <View className="flex-row items-center gap-1.5">
            <View className={`min-h-7 px-2.5 rounded-full flex-row items-center gap-1.5 ${
              item.enquiry_channel === "whatsapp"
                ? "bg-green-500/10"
                : item.enquiry_channel === "call"
                  ? "bg-primary/10"
                  : "bg-purple-500/10"
            }`}>
              <ChannelIcon size={13} color={item.enquiry_channel === "whatsapp" ? "#15803D" : item.enquiry_channel === "call" ? "#0878E8" : "#9333EA"} />
              <Text className={`text-[11px] font-bold ${
                item.enquiry_channel === "whatsapp" ? "text-green-700" : item.enquiry_channel === "call" ? "text-primary" : "text-purple-700"
              }`}>{channelLabel}</Text>
            </View>
            <View className={`min-h-7 px-2.5 rounded-full flex-row items-center border ${statusMeta.bg}`}>
              <Text className="text-[11px] font-bold capitalize">{statusMeta.label}</Text>
            </View>
          </View>
          {!desktop ? <Timestamp value={item.created_at} /> : null}
        </View>

        {/* Desktop Reference & Timestamp */}
        {desktop ? (
          <View className="w-36 items-end">
            <Text className="text-primary text-xs font-bold">{item.reference_code}</Text>
            <Timestamp value={item.created_at} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function EnquiryTicketModal({
  enquiry,
  onClose,
  onUpdated,
}: {
  enquiry: AdminEnquiry | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { width } = useWindowDimensions();
  const [selectedStatus, setSelectedStatus] = useState<AdminEnquiryStatus>("new");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (enquiry) {
      setSelectedStatus(enquiry.status);
      setNotes(enquiry.vendor_notes ?? "");
      setFollowUpDate(enquiry.follow_up_date ?? null);
      setSaveSuccess(false);
    }
  }, [enquiry]);

  if (!enquiry) return null;
  const desktop = adminContentWidth(width) >= 980;

  const occurredAt = new Date(enquiry.created_at);
  const ticketDate = occurredAt.toLocaleDateString("en-IN", { timeZone: ENQUIRY_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
  const ticketTime = occurredAt.toLocaleTimeString("en-IN", { timeZone: ENQUIRY_TIMEZONE, hour: "2-digit", minute: "2-digit" });

  const customerPhoneDigits = enquiry.customer_phone?.replace(/\D/g, "") ?? "";
  const vendorPhoneDigits = enquiry.vendor_phone?.replace(/\D/g, "") ?? "";

  const handleCallCustomer = () => {
    if (!customerPhoneDigits) {
      Alert.alert("No phone number", "Customer has not provided a contact number.");
      return;
    }
    void Linking.openURL(`tel:${enquiry.customer_phone!.replace(/[^\d+]/g, "")}`);
  };

  const handleWhatsAppCustomer = () => {
    const digits = normalizeWhatsAppPhone(enquiry.customer_phone);
    if (!digits) {
      Alert.alert("No WhatsApp number", "Customer has not provided a valid mobile number for WhatsApp.");
      return;
    }
    const message = `Hello ${enquiry.customer_name || "Customer"}, this is RoyalLagn Admin coordinating your enquiry #${enquiry.reference_code} for ${enquiry.vendor_name}. How can we assist with your requirements?`;
    void Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`);
  };

  const handleCallVendor = () => {
    if (!vendorPhoneDigits) {
      Alert.alert("No phone number", "Vendor has not configured a contact number.");
      return;
    }
    void Linking.openURL(`tel:${enquiry.vendor_phone!.replace(/[^\d+]/g, "")}`);
  };

  const handleWhatsAppVendor = () => {
    const digits = normalizeWhatsAppPhone(enquiry.vendor_phone);
    if (!digits) {
      Alert.alert("No WhatsApp number", "Vendor has not configured a valid WhatsApp number.");
      return;
    }
    const message = `Hello ${enquiry.vendor_name}, this is RoyalLagn Admin regarding a new customer enquiry #${enquiry.reference_code} for your services. Let's coordinate the availability and pricing.`;
    void Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await AdminOperationsService.updateEnquiryStatus(
        enquiry.id,
        selectedStatus,
        notes,
        followUpDate
      );
      setSaveSuccess(true);
      onUpdated();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (cause) {
      Alert.alert("Error saving enquiry", cause instanceof Error ? cause.message : "Unable to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className={`flex-1 bg-black/60 ${desktop ? "items-center justify-center p-6" : "justify-end"}`}>
        <Pressable accessibilityLabel="Close ticket" className="absolute inset-0" onPress={onClose} />
        <View className={`w-full bg-card max-h-[92%] overflow-hidden flex flex-col ${desktop ? "max-w-[1080px] rounded-3xl" : "rounded-t-3xl"}`}>
          {/* Top handle on mobile */}
          <View className="items-center pt-3 pb-1 bg-primary/5">
            <View className="w-10 h-1 rounded-full bg-border" />
          </View>

          {/* Ticket Header */}
          <View className={`px-5 py-4 bg-primary/5 border-b border-primary/10 ${desktop ? "px-8 py-5" : ""}`}>
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-row items-center gap-3">
                <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                  <Ticket size={24} className="text-primary" />
                </View>
                <View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-foreground text-xl font-bold">Enquiry #{enquiry.reference_code}</Text>
                    <View className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                      <Text className="text-primary text-xs font-bold uppercase">{enquiry.enquiry_channel}</Text>
                    </View>
                  </View>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Submitted on {ticketDate} at {ticketTime} IST
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                className="w-10 h-10 rounded-full border border-border bg-card items-center justify-center active:bg-muted"
                onPress={onClose}
              >
                <X size={19} className="text-foreground" />
              </Pressable>
            </View>
          </View>

          {/* Modal Scrollable Body */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: desktop ? 28 : 18, gap: 24 }}>
            {/* Side-by-Side Dual Party Contacts Card */}
            <View className={desktop ? "flex-row gap-6" : "gap-4"}>
              {/* Customer Card */}
              <View className="flex-1 bg-background border border-border rounded-2xl p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-primary text-xs font-bold uppercase tracking-wider">Customer Details</Text>
                  <View className="px-2 py-0.5 rounded bg-muted">
                    <Text className="text-[10px] text-muted-foreground font-semibold">
                      {enquiry.customer_id ? "Registered User" : "Guest Customer"}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-3 mb-4">
                  <View className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 items-center justify-center overflow-hidden">
                    {enquiry.customer_profile_image ? (
                      <Image source={{ uri: enquiry.customer_profile_image }} className="w-14 h-14" resizeMode="cover" />
                    ) : (
                      <UserRound size={24} className="text-primary" />
                    )}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                      {enquiry.customer_name || "Guest Customer"}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      {enquiry.customer_phone || "No phone provided"}
                    </Text>
                    {enquiry.customer_email ? (
                      <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                        {enquiry.customer_email}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* Customer Action Buttons */}
                <View className="flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    className="flex-1 min-h-10 bg-primary/10 border border-primary/20 rounded-xl flex-row items-center justify-center gap-2 active:bg-primary/20"
                    onPress={handleCallCustomer}
                  >
                    <Phone size={15} className="text-primary" />
                    <Text className="text-primary text-xs font-bold">Call Customer</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="flex-1 min-h-10 bg-green-500/10 border border-green-500/20 rounded-xl flex-row items-center justify-center gap-2 active:bg-green-500/20"
                    onPress={handleWhatsAppCustomer}
                  >
                    <MessageCircle size={15} color="#15803D" />
                    <Text className="text-green-700 text-xs font-bold">WhatsApp</Text>
                  </Pressable>
                </View>
              </View>

              {/* Vendor Card */}
              <View className="flex-1 bg-background border border-border rounded-2xl p-4">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-purple-600 text-xs font-bold uppercase tracking-wider">Target Vendor</Text>
                  <View className="px-2 py-0.5 rounded bg-purple-500/10">
                    <Text className="text-[10px] text-purple-700 font-semibold">{enquiry.category_name}</Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-3 mb-4">
                  <View className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/15 items-center justify-center overflow-hidden">
                    {enquiry.vendor_logo ? (
                      <Image source={{ uri: enquiry.vendor_logo }} className="w-14 h-14" resizeMode="cover" />
                    ) : (
                      <Store size={24} className="text-purple-600" />
                    )}
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                      {enquiry.vendor_name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      {enquiry.vendor_phone || "No phone configured"}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                      Category: {enquiry.category_name}
                    </Text>
                  </View>
                </View>

                {/* Vendor Action Buttons */}
                <View className="flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    className="flex-1 min-h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex-row items-center justify-center gap-2 active:bg-purple-500/20"
                    onPress={handleCallVendor}
                  >
                    <Phone size={15} color="#9333EA" />
                    <Text className="text-purple-700 text-xs font-bold">Call Vendor</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="flex-1 min-h-10 bg-green-500/10 border border-green-500/20 rounded-xl flex-row items-center justify-center gap-2 active:bg-green-500/20"
                    onPress={handleWhatsAppVendor}
                  >
                    <MessageCircle size={15} color="#15803D" />
                    <Text className="text-green-700 text-xs font-bold">WhatsApp</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Event Requirements & Message */}
            <View className="bg-background border border-border rounded-2xl p-5">
              <Text className="text-foreground text-sm font-bold mb-3">Enquiry Details & Event Requirements</Text>
              <View className="flex-row flex-wrap gap-4 mb-3">
                {enquiry.event_date ? (
                  <View className="flex-row items-center gap-2 bg-card border border-border px-3 py-2 rounded-xl">
                    <Calendar size={15} className="text-primary" />
                    <Text className="text-foreground text-xs font-semibold">
                      Event: {new Date(`${enquiry.event_date}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </Text>
                  </View>
                ) : null}
                {enquiry.event_type ? (
                  <View className="flex-row items-center gap-2 bg-card border border-border px-3 py-2 rounded-xl">
                    <Tag size={15} className="text-primary" />
                    <Text className="text-foreground text-xs font-semibold">Event Type: {enquiry.event_type}</Text>
                  </View>
                ) : null}
                {enquiry.package_name ? (
                  <View className="flex-row items-center gap-2 bg-card border border-border px-3 py-2 rounded-xl">
                    <Sparkles size={15} className="text-primary" />
                    <Text className="text-foreground text-xs font-semibold">Package: {enquiry.package_name}</Text>
                  </View>
                ) : null}
              </View>

              <Text className="text-muted-foreground text-xs font-semibold uppercase mb-1">Customer Message / Note</Text>
              <View className="bg-card border border-border rounded-xl p-3">
                <Text className="text-foreground text-sm leading-relaxed">
                  {enquiry.message || "No specific message provided."}
                </Text>
              </View>
            </View>

            {/* Admin Management Panel */}
            <View className="bg-background border border-primary/20 rounded-2xl p-5">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-foreground text-base font-bold">Admin Workflow Status & Notes</Text>
                {saveSuccess ? (
                  <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 size={14} color="#15803D" />
                    <Text className="text-green-700 text-xs font-bold">Updated Successfully</Text>
                  </View>
                ) : null}
              </View>

              {/* Status Radio Chips */}
              <Text className="text-muted-foreground text-xs font-bold uppercase mb-2">Update Workflow Status</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {ADMIN_WORKFLOW_STATUSES.map((status) => {
                  const active = selectedStatus === status.id;
                  return (
                    <Pressable
                      key={status.id}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      className={`min-h-9 px-3.5 rounded-xl flex-row items-center justify-center border ${
                        active ? "bg-primary border-primary" : "bg-card border-border"
                      }`}
                      onPress={() => setSelectedStatus(status.id)}
                    >
                      <Text className={`text-xs font-bold ${active ? "text-white" : "text-foreground"}`}>
                        {status.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Admin Internal Notes */}
              <Text className="text-muted-foreground text-xs font-bold uppercase mb-2">Internal Admin Notes (Private)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                placeholder="Add notes about customer requirements, vendor discussions, agreed price, or next steps..."
                placeholderTextColor="#6B7280"
                className="bg-card border border-border rounded-xl p-3 text-foreground text-body min-h-[80px] mb-4 focus:border-primary/50"
              />

              {/* Follow-up Date */}
              <View className="mb-5 max-w-sm">
                <DateField
                  label="Follow-up Date (Optional)"
                  value={followUpDate || ""}
                  onChange={(val) => setFollowUpDate(val || null)}
                />
              </View>

              {/* Save Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save Enquiry Changes"
                disabled={saving}
                className="min-h-12 bg-primary rounded-xl flex-row items-center justify-center gap-2 active:opacity-90"
                onPress={handleSave}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={18} color="#FFFFFF" />
                    <Text className="text-white text-sm font-bold">Save & Update Status</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SummaryMetric({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <View className="flex-1 min-w-40 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3 shadow-sm">
      <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: `${color}18` }}>
        <Icon size={18} color={color} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-xl font-bold">{value.toLocaleString("en-IN")}</Text>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function Identity({
  image,
  name,
  detail,
  fallbackIcon: FallbackIcon,
  badge,
}: {
  image: string | null;
  name: string;
  detail: string;
  fallbackIcon: React.ElementType;
  badge?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <View className="flex-1 min-w-0 flex-row items-center gap-3">
      <View className="w-12 h-12 rounded-xl bg-primary/10 overflow-hidden items-center justify-center">
        {image && !imageFailed ? (
          <Image source={{ uri: image }} accessibilityLabel={`${name} profile`} className="w-12 h-12" resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <FallbackIcon size={20} className="text-primary" />
        )}
      </View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{name}</Text>
          {badge ? (
            <View className="px-1.5 py-0.2 rounded bg-muted">
              <Text className="text-[9px] text-muted-foreground font-bold uppercase">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{detail}</Text>
      </View>
    </View>
  );
}

function Timestamp({ value }: { value: string }) {
  const date = new Date(value);
  const day = date.toLocaleDateString("en-IN", { timeZone: ENQUIRY_TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-IN", { timeZone: ENQUIRY_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return (
    <View>
      <Text className="text-foreground text-xs font-semibold text-right">{day}</Text>
      <Text className="text-muted-foreground text-caption mt-0.5 text-right">{time} IST</Text>
    </View>
  );
}
