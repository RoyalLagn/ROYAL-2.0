import React, { useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BarChart3, CalendarDays, ChevronRight, Inbox, MessageCircle, Phone, Search, TrendingDown, TrendingUp, X } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useVendorEnquiries } from "@/hooks/useEnquiries";
import { ENQUIRY_STATUSES, EnquiryService, enquirySourceLabel, enquiryStatusLabel, type EnquiryStatus, type TrackedEnquiry } from "@/services/enquiries";
import { SkeletonList } from "@/components/loading/Skeleton";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import { interactionTokens } from "@/constants/interactionTokens";

type Filter = "all" | EnquiryStatus;
type Sort = "newest" | "oldest" | "follow_up";

export default function VendorEnquiries() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const workspace = useVendorWorkspace();
  const { items, loading, error, refresh, analytics } = useVendorEnquiries(workspace.data.vendor?.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<TrackedEnquiry | null>(null);
  const [status, setStatus] = useState<EnquiryStatus>("new");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (filter === "all" || item.status === filter) && (!needle || [item.customer_name, item.customer_email, item.customer_phone, item.reference_code, item.package_name, item.event_type].some((value) => value?.toLowerCase().includes(needle))))
      .sort((a, b) => sort === "oldest" ? a.created_at.localeCompare(b.created_at) : sort === "follow_up" ? (a.follow_up_date ?? "9999").localeCompare(b.follow_up_date ?? "9999") : b.created_at.localeCompare(a.created_at));
  }, [filter, items, query, sort]);

  const open = (item: TrackedEnquiry) => { setSelected(item); setStatus(item.status); setNotes(item.vendor_notes ?? ""); setFollowUp(item.follow_up_date ?? ""); };
  const save = async () => {
    if (!selected || saving) return;
    if (followUp && !/^\d{4}-\d{2}-\d{2}$/.test(followUp)) return Alert.alert("Check follow-up date", "Use YYYY-MM-DD.");
    setSaving(true);
    try { await EnquiryService.updateVendor(selected.id, status, notes, followUp || null); setSelected(null); await refresh(true); showSuccess("Lead updated"); }
    catch (cause) { Alert.alert("Enquiry not updated", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setSaving(false); }
  };

  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={workspace.data.notifications.filter((item) => !item.is_read).length} />
    <FlatList
      accessibilityLabel="Vendor enquiries"
      data={!loading && !error ? visible : []}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={Platform.OS !== "web"}
      ListHeaderComponent={<>
        <Text style={[styles.eyebrow, { color: colors.pink }]}>TRACKED LEADS</Text><Text style={[styles.title, { color: colors.text }]}>Enquiries</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Call and WhatsApp clicks are attempts. Only “Booked” counts as a vendor-confirmed booking.</Text>
        <View style={styles.metrics}><Metric label="Tracked enquiries" value={analytics.total} colors={colors} /><Metric label="Call Clicks" value={analytics.callClicks} colors={colors} /><Metric label="WhatsApp Clicks" value={analytics.whatsappClicks} colors={colors} /><Metric label="Confirmed booked" value={analytics.bookedLeads} colors={colors} /></View>
        <View style={[styles.analytics, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.analyticsIcon, { backgroundColor: colors.surfaceSoft }]}><BarChart3 size={18} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.analyticsTitle, { color: colors.text }]}>{analytics.conversionRate}% tracked-to-booked conversion</Text><Text style={[styles.meta, { color: colors.muted }]}>Top source: {analytics.topSource ? enquirySourceLabel(analytics.topSource) : "No data yet"}</Text></View>{analytics.monthOverMonth == null ? null : analytics.monthOverMonth >= 0 ? <TrendingUp size={18} color={colors.success} /> : <TrendingDown size={18} color={colors.destructive} />}<Text style={[styles.month, { color: analytics.monthOverMonth != null && analytics.monthOverMonth >= 0 ? colors.success : colors.destructive }]}>{analytics.monthOverMonth == null ? "—" : `${analytics.monthOverMonth > 0 ? "+" : ""}${analytics.monthOverMonth}% MoM`}</Text></View>
        <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><Search size={17} color={colors.muted} /><TextInput accessibilityLabel="Search enquiries" accessibilityHint="Search by customer, phone, reference or package" value={query} onChangeText={setQuery} placeholder="Search name, phone, reference or package" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(["all", ...ENQUIRY_STATUSES] as Filter[]).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={item === "all" ? "All enquiry statuses" : enquiryStatusLabel(item)} accessibilityState={{ checked: filter === item }} onPress={() => setFilter(item)} style={styles.filterTouchTarget}><View pointerEvents="none" style={[styles.filter, { borderColor: filter === item ? colors.pink : colors.border, backgroundColor: filter === item ? colors.surfaceSoft : colors.surface }]}><Text style={{ color: filter === item ? colors.pink : colors.muted, fontWeight: "700", fontSize: typeScale.caption }}>{item === "all" ? "All" : enquiryStatusLabel(item)}</Text></View></Pressable>)}</ScrollView>
        <View style={styles.sortRow}><Text accessibilityLiveRegion="polite" style={[styles.resultCount, { color: colors.muted }]}>{visible.length} {visible.length === 1 ? "lead" : "leads"}</Text>{(["newest", "oldest", "follow_up"] as Sort[]).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityLabel={`Sort ${item === "follow_up" ? "by follow-up" : item}`} accessibilityState={{ checked: sort === item }} onPress={() => setSort(item)} style={styles.sortTouchTarget}><Text style={[styles.sortText, { color: sort === item ? colors.pink : colors.muted }]}>{item === "follow_up" ? "Follow-up" : item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}</View>
      </>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Open enquiry from ${item.customer_name}, ${enquiryStatusLabel(item.status)}`} onPress={() => open(item)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
        <View style={styles.cardTop}><View style={[styles.channelIcon, { backgroundColor: colors.surfaceSoft }]}>{item.enquiry_channel === "call" ? <Phone size={17} color={colors.pink} /> : <MessageCircle size={17} color={colors.pink} />}</View><View style={styles.flex}><Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{item.customer_name}</Text><Text numberOfLines={1} style={[styles.meta, { color: colors.muted }]}>{item.reference_code} · {item.enquiry_channel === "call" ? "Call Click" : item.enquiry_channel === "whatsapp" ? "WhatsApp Click" : "Form enquiry"}</Text></View><View style={[styles.status, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.statusText, { color: colors.pink }]}>{enquiryStatusLabel(item.status)}</Text></View></View>
        <Text numberOfLines={2} style={[styles.message, { color: colors.muted }]}>{item.message}</Text><View style={[styles.details, { borderTopColor: colors.border }]}><Text style={[styles.detailText, { color: colors.muted }]}>{enquirySourceLabel(item.source_type)}</Text><Text style={[styles.detailText, { color: colors.muted }]}>{new Date(item.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</Text>{item.customer_confirmation !== "pending" ? <Text style={[styles.customerFlag, { color: colors.pink }]}>Customer: {item.customer_confirmation}</Text> : null}<ChevronRight size={17} color={colors.pink} /></View>
      </Pressable>}
      ListEmptyComponent={loading
        ? <View accessibilityRole="progressbar" accessibilityLabel="Loading enquiries"><SkeletonList count={4} height={110} /></View>
        : error
          ? <State title="Enquiries unavailable" body={error} colors={colors} action={() => void refresh()} />
          : <State title="No matching enquiries" body="New Call Clicks, WhatsApp Clicks and form enquiries will appear here." colors={colors} />}
    />
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}><KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}><View style={[styles.sheet, { backgroundColor: colors.surface }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.sheetTop}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: colors.text }]}>{selected?.customer_name}</Text><Text style={[styles.meta, { color: colors.muted }]}>{selected?.reference_code} · {selected?.package_name || selected?.event_type || enquirySourceLabel(selected?.source_type || "other")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close enquiry details" hitSlop={4} onPress={() => setSelected(null)} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}><X size={20} color={colors.text} /></Pressable></View>
      <Text style={[styles.message, { color: colors.muted }]}>{selected?.message}</Text>{selected?.customer_confirmation !== "pending" ? <View style={[styles.customerNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.customerNoticeText, { color: colors.pink }]}>Customer marked this enquiry: {selected?.customer_confirmation}</Text></View> : null}
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Lead status</Text><View style={styles.statusGrid}>{ENQUIRY_STATUSES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={enquiryStatusLabel(value)} accessibilityState={{ checked: status === value }} onPress={() => setStatus(value)} style={[styles.statusOption, { borderColor: status === value ? colors.pink : colors.border, backgroundColor: status === value ? colors.surfaceSoft : colors.background }]}><Text style={{ color: status === value ? colors.pink : colors.text, fontSize: typeScale.caption, fontWeight: "700" }}>{enquiryStatusLabel(value)}</Text></Pressable>)}</View>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Private vendor notes</Text><TextInput accessibilityLabel="Private vendor notes" accessibilityHint="Only your vendor workspace can see these notes" accessibilityState={{ disabled: saving }} editable={!saving} value={notes} onChangeText={setNotes} multiline placeholder="Add context for your follow-up" placeholderTextColor={colors.muted} style={[styles.notes, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Follow-up date</Text><View style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border }]}><CalendarDays size={16} color={colors.pink} /><TextInput accessibilityLabel="Follow-up date" accessibilityHint="Enter a date in year month day format" accessibilityState={{ disabled: saving }} editable={!saving} value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.flex, { color: colors.text, fontSize: typeScale.metadata }]} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Save lead update" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.pink }, saving && styles.disabled]}><Text style={[styles.saveText, { color: colors.onPrimary }]}>{saving ? "Saving…" : "Save lead update"}</Text></Pressable>
    </ScrollView></View></KeyboardAvoidingView></Modal>
  </View>;
}

function Metric({ label, value, colors }: any) { return <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text></View>; }
function State({ title, body, colors, action }: any) { return <View accessibilityRole={action ? "alert" : undefined} accessibilityLiveRegion="polite" style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Inbox size={30} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>{action ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading enquiries" onPress={action} style={[styles.retry, { backgroundColor: colors.pink }]}><Text style={[styles.retryText, { color: colors.onPrimary }]}>Try again</Text></Pressable> : null}</View>; }

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 30 },
  eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle },
  subtitle: { ...typeStyles.metadata, marginTop: 4, maxWidth: 620 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 18 },
  metric: { minWidth: 145, flex: 1, borderWidth: 1, borderRadius: 18, padding: 14 },
  metricValue: { ...typeStyles.metric },
  metricLabel: { ...typeStyles.caption, marginTop: 4 },
  analytics: { borderWidth: 1, borderRadius: 18, padding: 13, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 9 },
  analyticsIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  analyticsTitle: { fontSize: typeScale.metadata, fontWeight: "700" },
  month: { fontSize: typeScale.caption, fontWeight: "700" },
  search: { minHeight: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 },
  searchInput: { flex: 1, minHeight: interactionTokens.minimumTouchTarget, fontSize: typeScale.metadata },
  filters: { gap: 7, paddingVertical: 8 },
  filterTouchTarget: { minWidth: interactionTokens.minimumTouchTarget, minHeight: interactionTokens.minimumTouchTarget, alignItems: "center", justifyContent: "center" },
  filter: { height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 5 },
  sortTouchTarget: { minWidth: interactionTokens.minimumTouchTarget, minHeight: interactionTokens.minimumTouchTarget, alignItems: "center", justifyContent: "center" },
  resultCount: { flex: 1, fontSize: typeScale.caption },
  sortText: { fontSize: typeScale.caption, fontWeight: "700" },
  loading: { marginTop: 35 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 10 },
  pressed: { transform: [{ scale: .99 }], opacity: .9 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  channelIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: typeScale.body, fontWeight: "700" },
  meta: { fontSize: typeScale.caption, marginTop: 3 },
  status: { maxWidth: 104, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  statusText: { fontSize: typeScale.caption, fontWeight: "700", textAlign: "center" },
  message: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, marginTop: 12 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  detailText: { fontSize: typeScale.caption },
  customerFlag: { flex: 1, fontSize: typeScale.caption, textTransform: "capitalize" },
  empty: { borderWidth: 1, borderRadius: 22, alignItems: "center", padding: 32, marginTop: 6 },
  emptyTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 12 },
  emptyBody: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center", maxWidth: 410, marginTop: 6 },
  retry: { minHeight: interactionTokens.minimumTouchTarget, borderRadius: 13, paddingHorizontal: 16, justifyContent: "center", marginTop: 12 },
  retryText: { fontSize: typeScale.caption, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,8,12,.55)", justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 620, maxHeight: "92%", alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  close: { width: interactionTokens.minimumTouchTarget, height: interactionTokens.minimumTouchTarget, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  customerNotice: { borderRadius: 13, padding: 11, marginTop: 13 },
  customerNoticeText: { fontSize: typeScale.caption, fontWeight: "700", textTransform: "capitalize" },
  fieldLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusOption: { minWidth: "30%", flexGrow: 1, height: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  notes: { minHeight: 92, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: typeScale.metadata, textAlignVertical: "top" },
  dateInput: { minHeight: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  save: { minHeight: 49, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  saveText: { fontSize: typeScale.metadata, fontWeight: "700" },
  disabled: { opacity: .55 },
});
