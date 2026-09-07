import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Inbox, Mail, MessageCircle, MessageSquareText, Phone, Search, SlidersHorizontal, UserRound, X } from "lucide-react-native";
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
import Pressable from "@/components/InteropSafePressable";
import { DateField } from "@/components/admin/crm/ui/DateField";

type Filter = "all" | EnquiryStatus;
type Sort = "newest" | "oldest" | "follow_up";
type ChannelFilter = "all" | "call" | "form" | "whatsapp";
const PAGE_SIZE = 15;

export default function VendorEnquiries() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const workspace = useVendorWorkspace();
  const { items, loading, error, refresh } = useVendorEnquiries(workspace.data.vendor?.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [enquiryDate, setEnquiryDate] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<TrackedEnquiry | null>(null);
  const [status, setStatus] = useState<EnquiryStatus>("new");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const markingAllSeen = useRef(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (filter === "all" || item.status === filter) && (channelFilter === "all" || item.enquiry_channel === channelFilter) && (!enquiryDate || localDateKey(item.created_at) === enquiryDate) && (!needle || [item.customer_name, item.customer_email, item.customer_phone, item.reference_code, item.package_name, item.event_type].some((value) => value?.toLowerCase().includes(needle))))
      .sort((a, b) => sort === "oldest" ? a.created_at.localeCompare(b.created_at) : sort === "follow_up" ? (a.follow_up_date ?? "9999").localeCompare(b.follow_up_date ?? "9999") : b.created_at.localeCompare(a.created_at));
  }, [channelFilter, enquiryDate, filter, items, query, sort]);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pagedEnquiries = useMemo(() => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [page, visible]);
  const channelCounts = useMemo(() => ({
    call: items.filter((item) => item.enquiry_channel === "call").length,
    form: items.filter((item) => item.enquiry_channel === "form").length,
    whatsapp: items.filter((item) => item.enquiry_channel === "whatsapp").length,
  }), [items]);
  const activeFilterCount = Number(channelFilter !== "all") + Number(filter !== "all") + Number(sort !== "newest");
  useEffect(() => { setPage(1); }, [channelFilter, enquiryDate, filter, query, sort]);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  useEffect(() => {
    const unseenIds = items.filter((item) => !item.vendor_seen_at).map((item) => item.id);
    if (loading || markingAllSeen.current || unseenIds.length === 0) return;
    markingAllSeen.current = true;
    void EnquiryService.markAllVendorSeen(unseenIds)
      .then(() => refresh(true))
      .catch(() => undefined)
      .finally(() => { markingAllSeen.current = false; });
  }, [items, loading, refresh]);

  const open = (item: TrackedEnquiry) => {
    setSelected({ ...item, vendor_seen_at: item.vendor_seen_at ?? new Date().toISOString() });
    setStatus(item.status);
    setNotes(item.vendor_notes ?? "");
    setFollowUp(item.follow_up_date ?? "");
    if (!item.vendor_seen_at) {
      void EnquiryService.markVendorSeen(item.id)
        .then(() => refresh(true))
        .catch((cause) => Alert.alert("Enquiry not marked as opened", cause instanceof Error ? cause.message : "Please try again."));
    }
  };
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
      data={!loading && !error ? pagedEnquiries : []}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={Platform.OS !== "web"}
      ListHeaderComponent={<>
        <Text style={[styles.title, { color: colors.text }]}>Enquiry workspace</Text>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Find enquiries</Text><View style={styles.searchRow}><View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><Search size={18} color={colors.pink} /><TextInput accessibilityLabel="Search enquiries" accessibilityHint="Search by customer, email, phone, reference or package" value={query} onChangeText={setQuery} placeholder="Search name or enquiry number" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ""}`} onPress={() => setFiltersOpen(true)} style={({ pressed, hovered, focused }) => [styles.filterButton, { backgroundColor: activeFilterCount ? colors.pink : colors.surface, borderColor: activeFilterCount ? colors.pink : colors.border }, (hovered || focused) && styles.filterButtonHover, pressed && styles.pressed]}><SlidersHorizontal size={20} color={activeFilterCount ? colors.onPrimary : colors.pink} />{activeFilterCount ? <View style={[styles.filterCount, { backgroundColor: colors.onPrimary }]}><Text style={[styles.filterCountText, { color: colors.pink }]}>{activeFilterCount}</Text></View> : null}</Pressable></View>
        <View style={styles.dateFilterRow}><View style={styles.dateFilter}><DateField label="Enquiry date" value={enquiryDate} onChange={setEnquiryDate} displayValue={enquiryDate ? formatFilterDate(enquiryDate) : undefined} placeholder="Choose a past date" maximumDate={todayKey()} /></View>{enquiryDate ? <Pressable accessibilityRole="button" accessibilityLabel="Show enquiries from all dates" onPress={() => setEnquiryDate("")} style={({ pressed }) => [styles.clearDate, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressed]}><X size={16} color={colors.pink} /><Text style={[styles.clearDateText, { color: colors.pink }]}>All dates</Text></Pressable> : null}</View>
        <View style={styles.channelHeading}><Text style={[styles.sectionLabel, styles.channelTitle, { color: colors.text }]}>Enquiries by type</Text>{channelFilter !== "all" ? <Pressable accessibilityRole="button" accessibilityLabel="Show all enquiry types" onPress={() => setChannelFilter("all")} style={styles.showAll}><Text style={[styles.showAllText, { color: colors.pink }]}>Show all</Text></Pressable> : null}</View>
        <View style={styles.channelGrid}><ChannelCard label="Calls" value={channelCounts.call} icon={Phone} active={channelFilter === "call"} colors={colors} onPress={() => setChannelFilter((current) => current === "call" ? "all" : "call")} /><ChannelCard label="Text" value={channelCounts.form} icon={MessageSquareText} active={channelFilter === "form"} colors={colors} onPress={() => setChannelFilter((current) => current === "form" ? "all" : "form")} /><ChannelCard label="WhatsApp" value={channelCounts.whatsapp} icon={MessageCircle} active={channelFilter === "whatsapp"} colors={colors} onPress={() => setChannelFilter((current) => current === "whatsapp" ? "all" : "whatsapp")} /></View>
        <View style={styles.resultsHeader}><Text accessibilityLiveRegion="polite" style={[styles.resultCount, { color: colors.text }]}>{visible.length} {visible.length === 1 ? "enquiry" : "enquiries"}</Text><Text style={[styles.pageSummary, { color: colors.muted }]}>Page {page} of {pageCount}</Text></View>
      </>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.vendor_seen_at ? "Opened" : "Unopened"} enquiry ${item.reference_code} from ${firstName(item.customer_name)}`} onPress={() => open(item)} style={({ pressed, hovered, focused }) => [styles.card, { backgroundColor: colors.surface }, (hovered || focused) && styles.cardHover, pressed && styles.pressed]}>
        <View style={[styles.channelIcon, { backgroundColor: colors.surfaceSoft }]}>{item.enquiry_channel === "call" ? <Phone size={18} color={colors.pink} /> : item.enquiry_channel === "form" ? <MessageSquareText size={18} color={colors.pink} /> : <MessageCircle size={18} color={colors.pink} />}</View><View style={styles.flex}><Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{firstName(item.customer_name)}</Text><Text numberOfLines={1} style={[styles.enquiryNumber, { color: colors.muted }]}>{item.reference_code}</Text></View>{!item.vendor_seen_at ? <View accessibilityLabel="Unopened enquiry" style={[styles.unreadDot, { backgroundColor: colors.pink }]} /> : null}<ChevronRight size={19} color={colors.pink} />
      </Pressable>}
      ListEmptyComponent={loading
        ? <View accessibilityRole="progressbar" accessibilityLabel="Loading enquiries"><SkeletonList count={4} height={110} /></View>
        : error
          ? <State title="Enquiries unavailable" body={error} colors={colors} action={() => void refresh()} />
          : <State title="No matching enquiries" body={enquiryDate ? `No enquiries were received on ${formatFilterDate(enquiryDate)}.` : "New Call Clicks, WhatsApp Clicks and form enquiries will appear here."} colors={colors} />}
      ListFooterComponent={!loading && !error && visible.length > PAGE_SIZE ? <View style={styles.pagination}><Pressable accessibilityRole="button" accessibilityLabel="Previous enquiry page" accessibilityState={{ disabled: page === 1 }} disabled={page === 1} onPress={() => setPage((current) => Math.max(1, current - 1))} style={({ pressed }) => [styles.pageButton, { backgroundColor: colors.surface, borderColor: colors.border }, page === 1 && styles.disabled, pressed && page > 1 && styles.pressed]}><ChevronLeft size={19} color={colors.text} /></Pressable><Text style={[styles.paginationText, { color: colors.muted }]}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} of {visible.length}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next enquiry page" accessibilityState={{ disabled: page >= pageCount }} disabled={page >= pageCount} onPress={() => setPage((current) => Math.min(pageCount, current + 1))} style={({ pressed }) => [styles.pageButton, { backgroundColor: colors.surface, borderColor: colors.border }, page >= pageCount && styles.disabled, pressed && page < pageCount && styles.pressed]}><ChevronRight size={19} color={colors.text} /></Pressable></View> : null}
    />
    <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}><View style={styles.filterBackdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close filters" style={StyleSheet.absoluteFill} onPress={() => setFiltersOpen(false)} /><View style={[styles.filterSheet, { backgroundColor: colors.surface }]}><View style={styles.sheetTop}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: colors.text }]}>Filter enquiries</Text><Text style={[styles.meta, { color: colors.muted }]}>Narrow the list by enquiry type and lead status.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFiltersOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}><X size={20} color={colors.text} /></Pressable></View><Text style={[styles.filterGroupLabel, { color: colors.muted }]}>ENQUIRY TYPE</Text><View style={styles.optionList}>{(["all", "call", "form", "whatsapp"] as ChannelFilter[]).map((value) => <FilterOption key={value} label={value === "all" ? "All enquiry types" : channelLabel(value)} selected={channelFilter === value} colors={colors} onPress={() => setChannelFilter(value)} />)}</View><Text style={[styles.filterGroupLabel, { color: colors.muted }]}>LEAD STATUS</Text><ScrollView style={styles.statusFilterScroll} contentContainerStyle={styles.optionList}>{(["all", ...ENQUIRY_STATUSES] as Filter[]).map((value) => <FilterOption key={value} label={value === "all" ? "All statuses" : enquiryStatusLabel(value)} selected={filter === value} colors={colors} onPress={() => setFilter(value)} />)}</ScrollView><Text style={[styles.filterGroupLabel, { color: colors.muted }]}>SORT BY</Text><View style={styles.optionList}>{(["newest", "oldest", "follow_up"] as Sort[]).map((value) => <FilterOption key={value} label={value === "follow_up" ? "Follow-up date" : value === "newest" ? "Newest first" : "Oldest first"} selected={sort === value} colors={colors} onPress={() => setSort(value)} />)}</View><View style={styles.filterActions}><Pressable accessibilityRole="button" accessibilityLabel="Reset all filters" onPress={() => { setChannelFilter("all"); setFilter("all"); setSort("newest"); }} style={[styles.resetButton, { borderColor: colors.border }]}><Text style={[styles.resetText, { color: colors.text }]}>Reset</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Apply filters" onPress={() => setFiltersOpen(false)} style={[styles.applyButton, { backgroundColor: colors.pink }]}><Text style={[styles.applyText, { color: colors.onPrimary }]}>Show {visible.length} results</Text></Pressable></View></View></View></Modal>
    <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}><KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}><View style={[styles.sheet, { backgroundColor: colors.surface }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.sheetTop}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: colors.text }]}>{selected?.customer_name}</Text><Text style={[styles.meta, { color: colors.muted }]}>{selected?.reference_code} · {selected ? channelLabel(selected.enquiry_channel) : ""} · {selected ? new Date(selected.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : ""}</Text><Text style={[styles.meta, { color: colors.muted }]}>{selected?.package_name || selected?.event_type || enquirySourceLabel(selected?.source_type || "other")}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close enquiry details" hitSlop={4} onPress={() => setSelected(null)} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}><X size={20} color={colors.text} /></Pressable></View>
      <View style={[styles.contactPanel, { backgroundColor: colors.background }]}><View style={[styles.contactAvatar, { backgroundColor: colors.surfaceSoft }]}><UserRound size={22} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.contactName, { color: colors.text }]}>{selected?.customer_name}</Text><ContactLine icon={Phone} value={selected?.customer_phone} fallback="Mobile not provided" colors={colors} /><ContactLine icon={Mail} value={selected?.customer_email} fallback="Email not provided" colors={colors} /></View></View>
      <View style={styles.contactActions}><ContactAction label="Call customer" icon={Phone} enabled={Boolean(selected?.customer_phone)} colors={colors} onPress={() => selected?.customer_phone && void Linking.openURL(`tel:${selected.customer_phone.replace(/[^\d+]/g, "")}`)} /><ContactAction label="Email customer" icon={Mail} enabled={Boolean(selected?.customer_email)} colors={colors} onPress={() => selected?.customer_email && void Linking.openURL(`mailto:${selected.customer_email}`)} /></View>
      <View style={[styles.messagePanel, { borderColor: colors.border }]}><Text style={[styles.messageLabel, { color: colors.muted }]}>CUSTOMER MESSAGE</Text><Text style={[styles.message, styles.sheetMessage, { color: colors.text }]}>{selected?.message}</Text></View>{selected?.customer_confirmation !== "pending" ? <View style={[styles.customerNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.customerNoticeText, { color: colors.pink }]}>Customer marked this enquiry: {selected?.customer_confirmation}</Text></View> : null}
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Lead status</Text><View style={styles.statusGrid}>{ENQUIRY_STATUSES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={enquiryStatusLabel(value)} accessibilityState={{ checked: status === value }} onPress={() => setStatus(value)} style={[styles.statusOption, { borderColor: status === value ? colors.pink : colors.border, backgroundColor: status === value ? colors.surfaceSoft : colors.background }]}><Text style={{ color: status === value ? colors.pink : colors.text, fontSize: typeScale.caption, fontWeight: "700" }}>{enquiryStatusLabel(value)}</Text></Pressable>)}</View>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Private vendor notes</Text><TextInput accessibilityLabel="Private vendor notes" accessibilityHint="Only your vendor workspace can see these notes" accessibilityState={{ disabled: saving }} editable={!saving} value={notes} onChangeText={setNotes} multiline placeholder="Add context for your follow-up" placeholderTextColor={colors.muted} style={[styles.notes, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
      <Text style={[styles.fieldLabel, { color: colors.text }]}>Follow-up date</Text><View style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border }]}><CalendarDays size={16} color={colors.pink} /><TextInput accessibilityLabel="Follow-up date" accessibilityHint="Enter a date in year month day format" accessibilityState={{ disabled: saving }} editable={!saving} value={followUp} onChangeText={setFollowUp} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.flex, { color: colors.text, fontSize: typeScale.metadata }]} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Save lead update" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.pink }, saving && styles.disabled]}><Text style={[styles.saveText, { color: colors.onPrimary }]}>{saving ? "Saving…" : "Save lead update"}</Text></Pressable>
    </ScrollView></View></KeyboardAvoidingView></Modal>
  </View>;
}

function FilterOption({ label, selected, colors, onPress }: any) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.filterOption, { backgroundColor: selected ? colors.surfaceSoft : colors.background, borderColor: selected ? colors.pink : colors.border }, pressed && styles.pressed]}><Text style={[styles.filterOptionText, { color: selected ? colors.pink : colors.text }]}>{label}</Text><View style={[styles.filterOptionMark, { borderColor: selected ? colors.pink : colors.border, backgroundColor: selected ? colors.pink : "transparent" }]}>{selected ? <Check size={13} color={colors.onPrimary} strokeWidth={3} /> : null}</View></Pressable>; }
function ChannelCard({ label, value, icon: Icon, active, colors, onPress }: any) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${label}: ${value}. Filter enquiries`} onPress={onPress} style={({ pressed, hovered, focused }) => [styles.channelCard, { backgroundColor: active ? colors.pink : colors.surface, borderColor: active ? colors.pink : colors.border }, (hovered || focused) && styles.channelCardHover, pressed && styles.pressed]}><View style={[styles.channelCardIcon, { backgroundColor: active ? "rgba(255,255,255,.18)" : colors.surfaceSoft }]}><Icon size={18} color={active ? colors.onPrimary : colors.pink} /></View><View style={styles.flex}><Text style={[styles.channelCardValue, { color: active ? colors.onPrimary : colors.text }]}>{value}</Text><Text numberOfLines={1} style={[styles.channelCardLabel, { color: active ? colors.onPrimary : colors.muted }]}>{label}</Text></View></Pressable>; }
function ContactLine({ icon: Icon, value, fallback, colors }: any) { return <View style={styles.contactLine}><Icon size={14} color={value ? colors.pink : colors.muted} /><Text selectable={Boolean(value)} numberOfLines={1} style={[styles.contactValue, { color: value ? colors.text : colors.muted }]}>{value || fallback}</Text></View>; }
function ContactAction({ label, icon: Icon, enabled, colors, onPress }: any) { return <Pressable disabled={!enabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} onPress={onPress} style={({ pressed, hovered, focused }) => [styles.contactAction, { backgroundColor: enabled ? colors.pink : colors.surfaceSoft }, (hovered || focused) && enabled && styles.actionHover, pressed && enabled && styles.pressed, !enabled && styles.disabled]}><Icon size={17} color={enabled ? colors.onPrimary : colors.muted} /><Text style={[styles.contactActionText, { color: enabled ? colors.onPrimary : colors.muted }]}>{label}</Text></Pressable>; }
function State({ title, body, colors, action }: any) { return <View accessibilityRole={action ? "alert" : undefined} accessibilityLiveRegion="polite" style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Inbox size={30} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text>{action ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading enquiries" onPress={action} style={[styles.retry, { backgroundColor: colors.pink }]}><Text style={[styles.retryText, { color: colors.onPrimary }]}>Try again</Text></Pressable> : null}</View>; }
function localDateKey(value: string) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function firstName(value: string) { return value.trim().split(/\s+/)[0] || "Customer"; }
function channelLabel(value: TrackedEnquiry["enquiry_channel"]) { return value === "call" ? "Call Click" : value === "whatsapp" ? "WhatsApp Click" : "Text enquiry"; }
function todayKey() { return localDateKey(new Date().toISOString()); }
function formatFilterDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 30 },
  title: { ...typeStyles.pageTitle },
  sectionLabel: { fontSize: typeScale.bodyCompact, fontWeight: "800", marginTop: 22, marginBottom: 9 },
  searchRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  search: { flex: 1, minWidth: 0, minHeight: 54, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, minHeight: interactionTokens.minimumTouchTarget, fontSize: typeScale.metadata },
  filterButton: { width: 54, minHeight: 54, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  filterButtonHover: { transform: [{ translateY: -1 }] },
  filterCount: { position: "absolute", top: 5, right: 5, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  filterCountText: { fontSize: 10, fontWeight: "900" },
  channelHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  channelTitle: { marginBottom: 9 },
  showAll: { minHeight: interactionTokens.minimumTouchTarget, justifyContent: "center", paddingHorizontal: 4, marginTop: 11 },
  showAllText: { fontSize: typeScale.caption, fontWeight: "800" },
  channelGrid: { flexDirection: "row", gap: 9 },
  channelCard: { flex: 1, minWidth: 0, minHeight: 72, borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#6F3048", shadowOffset: { width: 0, height: 3 }, shadowOpacity: .035, shadowRadius: 9, elevation: 1 },
  channelCardHover: { transform: [{ translateY: -1 }], shadowOpacity: .09 },
  channelCardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  channelCardValue: { fontSize: typeScale.body, fontWeight: "800" },
  channelCardLabel: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  dateFilterRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 9, marginTop: 12 },
  dateFilter: { flex: 1, minWidth: 220 },
  clearDate: { minHeight: interactionTokens.minimumTouchTarget, borderRadius: 14, paddingHorizontal: 13, marginBottom: 3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  clearDateText: { fontSize: typeScale.caption, fontWeight: "700" },
  resultsHeader: { minHeight: 48, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  resultCount: { fontSize: typeScale.bodyCompact, fontWeight: "800" },
  pageSummary: { fontSize: typeScale.caption, fontWeight: "600" },
  loading: { marginTop: 35 },
  card: { minHeight: 76, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: "#6F3048", shadowOffset: { width: 0, height: 5 }, shadowOpacity: .055, shadowRadius: 14, elevation: 2 },
  cardHover: { transform: [{ translateY: -2 }], shadowOpacity: .13 },
  pressed: { transform: [{ scale: .99 }], opacity: .9 },
  channelIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: typeScale.body, fontWeight: "700" },
  enquiryNumber: { fontSize: typeScale.caption, fontWeight: "600", marginTop: 3 },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  meta: { fontSize: typeScale.caption, marginTop: 3 },
  message: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, marginTop: 12 },
  contactLine: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  contactValue: { flexShrink: 1, fontSize: typeScale.caption, fontWeight: "600" },
  empty: { borderWidth: 1, borderRadius: 22, alignItems: "center", padding: 32, marginTop: 6 },
  emptyTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 12 },
  emptyBody: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center", maxWidth: 410, marginTop: 6 },
  retry: { minHeight: interactionTokens.minimumTouchTarget, borderRadius: 13, paddingHorizontal: 16, justifyContent: "center", marginTop: 12 },
  retryText: { fontSize: typeScale.caption, fontWeight: "700" },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 12, paddingBottom: 6 },
  pageButton: { width: interactionTokens.minimumTouchTarget, height: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  paginationText: { minWidth: 100, textAlign: "center", fontSize: typeScale.caption, fontWeight: "700" },
  filterBackdrop: { flex: 1, backgroundColor: "rgba(15,8,12,.55)", justifyContent: "flex-end" },
  filterSheet: { width: "100%", maxWidth: 620, maxHeight: "92%", alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 24 },
  filterGroupLabel: { fontSize: 10, lineHeight: 14, fontWeight: "800", letterSpacing: 1.1, marginTop: 18, marginBottom: 8 },
  optionList: { gap: 7 },
  statusFilterScroll: { maxHeight: 230 },
  filterOption: { minHeight: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  filterOptionText: { flex: 1, fontSize: typeScale.metadata, fontWeight: "700" },
  filterOptionMark: { width: 22, height: 22, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  filterActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  resetButton: { minHeight: 50, minWidth: 104, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  resetText: { fontSize: typeScale.metadata, fontWeight: "800" },
  applyButton: { flex: 1, minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  applyText: { fontSize: typeScale.metadata, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,8,12,.55)", justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 620, maxHeight: "92%", alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  sheetTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  close: { width: interactionTokens.minimumTouchTarget, height: interactionTokens.minimumTouchTarget, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  customerNotice: { borderRadius: 13, padding: 11, marginTop: 13 },
  customerNoticeText: { fontSize: typeScale.caption, fontWeight: "700", textTransform: "capitalize" },
  contactPanel: { flexDirection: "row", gap: 12, borderRadius: 16, padding: 14, marginTop: 18 },
  contactAvatar: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  contactName: { fontSize: typeScale.body, fontWeight: "800", marginBottom: 5 },
  contactActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  contactAction: { flex: 1, minWidth: 180, minHeight: interactionTokens.minimumTouchTarget, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  contactActionText: { fontSize: typeScale.metadata, fontWeight: "800" },
  actionHover: { transform: [{ translateY: -1 }] },
  messagePanel: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14 },
  messageLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  sheetMessage: { marginTop: 7 },
  fieldLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusOption: { minWidth: "30%", flexGrow: 1, height: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  notes: { minHeight: 92, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: typeScale.metadata, textAlignVertical: "top" },
  dateInput: { minHeight: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  save: { minHeight: 49, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 20 },
  saveText: { fontSize: typeScale.metadata, fontWeight: "700" },
  disabled: { opacity: .55 },
});
