import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Mail, Phone, RefreshCw, Search } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminOperationsService, type AdminEnquiry, type AdminEnquiryStatus } from "@/services/adminOperations";
import { enquiryStatusLabel } from "@/services/enquiries";

const statuses: (AdminEnquiryStatus | "all")[] = ["all", "new", "contacted", "in_discussion", "quotation_sent", "follow_up", "booked", "not_interested", "invalid_lead", "no_response", "closed"];
const PAGE_SIZE = 15;

export default function AdminEnquiries() {
  const [items, setItems] = useState<AdminEnquiry[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminEnquiryStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true); setError(null);
    try { setItems(await AdminOperationsService.enquiries()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load enquiries."); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); return AdminOperationsService.subscribe("vendor_enquiries", () => void load(true)); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (status === "all" || item.status === status) && (!needle || [item.customer_name, item.customer_email, item.customer_phone, item.vendor_name, item.event_type, item.message, item.reference_code].some((value) => value?.toLowerCase().includes(needle))));
  }, [items, query, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const setEnquiryStatus = (item: AdminEnquiry, next: AdminEnquiryStatus) => Alert.alert("Update enquiry status?", `${item.customer_name}'s enquiry will be marked ${next}.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Update", onPress: async () => { try { await AdminOperationsService.updateEnquiryStatus(item.id, next); await load(true); } catch (cause) { Alert.alert("Update failed", cause instanceof Error ? cause.message : "Please try again."); } } },
  ]);

  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
      <ResponsiveContainer>
        <AdminPageHeader title="Enquiries" subtitle="Track customer requests sent to vendors" action={<Pressable accessibilityLabel="Refresh enquiries" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
        <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Search customer, vendor or event" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>{statuses.map((value) => <Pressable key={value} onPress={() => { setStatus(value); setPage(1); }} className={status === value ? "px-4 py-2 rounded-xl bg-primary" : "px-4 py-2 rounded-xl bg-card border border-border"}><Text className={status === value ? "text-white text-xs font-semibold" : "text-foreground text-xs font-semibold"}>{value === "all" ? "All" : enquiryStatusLabel(value)}</Text></Pressable>)}</ScrollView>
        <Text className="text-muted-foreground text-xs mb-3">{filtered.length} record{filtered.length === 1 ? "" : "s"}</Text>
        {loading ? <AdminLoadingState label="Loading enquiries…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : !visible.length ? <AdminEmptyState title="No enquiries found" message="Try another search or status filter." /> : <View className="gap-3">{visible.map((item) => <EnquiryCard key={item.id} item={item} onStatus={(next) => setEnquiryStatus(item, next)} />)}</View>}
        {!loading && !error && filtered.length > PAGE_SIZE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
      </ResponsiveContainer>
    </ScrollView><AdminFooter activeTab="profile" />
  </SafeAreaView>;
}

function EnquiryCard({ item, onStatus }: { item: AdminEnquiry; onStatus: (status: AdminEnquiryStatus) => void }) {
  return <View className="bg-card border border-border rounded-2xl p-4"><View className="flex-row items-start gap-3"><View className="flex-1 min-w-0"><Text className="text-foreground font-bold">{item.customer_name}</Text><Text numberOfLines={1} className="text-primary text-xs mt-1">For {item.vendor_name}</Text></View><Text className="text-[9px] uppercase font-bold text-primary bg-primary/10 px-2 py-1 rounded-full">{enquiryStatusLabel(item.status)}</Text></View>
    <View className="flex-row flex-wrap gap-x-4 gap-y-2 mt-3">{item.customer_email ? <View className="flex-row items-center"><Mail size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-xs ml-1">{item.customer_email}</Text></View> : null}{item.customer_phone ? <View className="flex-row items-center"><Phone size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-xs ml-1">{item.customer_phone}</Text></View> : null}{item.event_date ? <View className="flex-row items-center"><CalendarDays size={13} className="text-muted-foreground" /><Text className="text-muted-foreground text-xs ml-1">{new Date(`${item.event_date}T00:00:00`).toLocaleDateString()}</Text></View> : null}</View>
    <Text className="text-muted-foreground text-[9px] mt-3">{item.reference_code} · {item.enquiry_channel === "call" ? "Call Click" : item.enquiry_channel === "whatsapp" ? "WhatsApp Click" : "Form enquiry"} · {item.source_type.replace(/_/g, " ")}</Text>{item.package_name || item.event_type ? <Text className="text-foreground text-xs font-semibold mt-3">{item.package_name ? `Package: ${item.package_name}` : item.event_type}</Text> : null}<Text className="text-muted-foreground text-xs leading-5 mt-1">{item.message}</Text><Text className="text-muted-foreground text-[9px] mt-3">Received {new Date(item.created_at).toLocaleString()}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingTop: 12 }}>{statuses.filter((value): value is AdminEnquiryStatus => value !== "all" && value !== item.status).map((value) => <Pressable key={value} onPress={() => onStatus(value)} className="border border-border rounded-xl px-3 min-h-9 items-center justify-center"><Text className="text-foreground text-[10px] font-semibold">Mark {enquiryStatusLabel(value)}</Text></Pressable>)}</ScrollView>
  </View>;
}
