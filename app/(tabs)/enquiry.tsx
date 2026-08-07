import React, { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CalendarDays, CheckCircle2, MessageCircle, MessageSquareHeart, Phone, RefreshCw, X, XCircle } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { useCustomerEnquiries } from "@/hooks/useEnquiries";
import { EnquiryExternalOpenError, EnquiryService, enquirySourceLabel, enquiryStatusLabel, type CustomerConfirmation, type TrackedEnquiry } from "@/services/enquiries";
import { SkeletonList } from "@/components/loading/Skeleton";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

export default function EnquiryScreen() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const { loading: authLoading, isPublicAuthenticated } = usePublicAuth();
  const { items, loading, error, refresh } = useCustomerEnquiries();
  const [selected, setSelected] = useState<TrackedEnquiry | null>(null);
  const [saving, setSaving] = useState(false);
  const dark = colorScheme === "dark";
  const colors = useMemo(() => ({
    background: dark ? "#070B14" : "#FFFFFF", surface: dark ? "#0E141F" : "#FFF9FB",
    text: dark ? "#F7F2F4" : "#171118", muted: dark ? "#AAA0A5" : "#6B6368", border: dark ? "#232C3D" : "#F1E1E7",
  }), [dark]);

  const contactAgain = async (item: TrackedEnquiry, channel: "call" | "whatsapp") => {
    try {
      await EnquiryService.trackContactAndOpen({ vendorId: item.vendor_id, vendorName: item.vendor_name || "Vendor", contactPhone: item.vendor_phone, channel, source: item.source_type, sourceRecordId: item.source_record_id ?? item.id, packageId: item.package_id, packageName: item.package_name });
      await refresh(true);
    } catch (cause) {
      if (cause instanceof EnquiryExternalOpenError) Alert.alert("Contact app not opened", `${cause.message} The click is saved as ${cause.referenceCode}.`);
      else Alert.alert("Contact unavailable", cause instanceof Error ? cause.message : "Please try again.");
    }
  };
  const updateConfirmation = async (value: Exclude<CustomerConfirmation, "pending">) => {
    if (!selected || saving) return;
    setSaving(true);
    try { await EnquiryService.updateCustomerConfirmation(selected.id, value); setSelected(null); await refresh(true); }
    catch (cause) { Alert.alert("Enquiry not updated", cause instanceof Error ? cause.message : "Please try again."); }
    finally { setSaving(false); }
  };

  return <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.heading}><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>My Enquiries</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Tracked contact attempts and vendor progress</Text></View>{isPublicAuthenticated ? <Pressable accessibilityLabel="Refresh enquiries" onPress={() => void refresh()} style={[styles.refresh, { backgroundColor: colors.surface, borderColor: colors.border }]}><RefreshCw size={17} color="#E91E63" /></Pressable> : null}</View>
    <View style={styles.truthNote}><MessageSquareHeart size={17} color="#C52D60" /><Text style={styles.truthText}>Call Click means the dialler opened. WhatsApp Click means WhatsApp opened. Neither confirms a connected call or sent message.</Text></View>
    {authLoading || loading ? <SkeletonList count={4} height={128} /> : null}
    {!authLoading && !isPublicAuthenticated ? <Empty title="Sign in to view enquiries" message="Guest contact attempts will be linked to your account after you sign in." colors={colors} action="Sign in" onAction={() => router.push("/DashboardCenter")} /> : null}
    {!loading && isPublicAuthenticated && error ? <Empty title="Enquiries unavailable" message={error} colors={colors} action="Try again" onAction={() => void refresh()} /> : null}
    {!loading && isPublicAuthenticated && !error && !items.length ? <Empty title="No enquiries yet" message="Call, WhatsApp or send a package enquiry from any vendor profile. It will appear here." colors={colors} /> : null}
    {!loading && !error ? items.map((item) => <Pressable key={item.id} onPress={() => setSelected(item)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
      <View style={styles.cardTop}><View style={styles.channelIcon}>{item.enquiry_channel === "call" ? <Phone size={18} color="#E91E63" /> : <MessageCircle size={18} color="#E91E63" />}</View><View style={styles.flex}><Text style={[styles.vendor, { color: colors.text }]}>{item.vendor_name}</Text><Text style={[styles.reference, { color: colors.muted }]}>{item.reference_code} · {item.enquiry_channel === "call" ? "Call Click" : item.enquiry_channel === "whatsapp" ? "WhatsApp Click" : "Form enquiry"}</Text></View><Status value={item.status} /></View>
      <View style={styles.metaRow}><Text style={[styles.meta, { color: colors.muted }]}>{enquirySourceLabel(item.source_type)}</Text><Text style={[styles.dot, { color: colors.muted }]}>•</Text><Text style={[styles.meta, { color: colors.muted }]}>{new Date(item.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</Text>{item.package_name ? <><Text style={[styles.dot, { color: colors.muted }]}>•</Text><Text numberOfLines={1} style={[styles.meta, styles.flex, { color: colors.muted }]}>{item.package_name}</Text></> : null}</View>
      {item.customer_confirmation !== "pending" ? <Text style={styles.customerState}>You marked this enquiry: {item.customer_confirmation}</Text> : null}
      <View style={[styles.quick, { borderTopColor: colors.border }]}><Pressable onPress={() => void contactAgain(item, "call")} style={styles.quickButton}><Phone size={14} color="#C52D60" /><Text style={styles.quickText}>Call again</Text></Pressable><Pressable onPress={() => void contactAgain(item, "whatsapp")} style={styles.quickButton}><MessageCircle size={14} color="#C52D60" /><Text style={styles.quickText}>WhatsApp</Text></Pressable></View>
    </Pressable>) : null}
  </ScrollView>
  <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={styles.backdrop}><View style={[styles.sheet, { backgroundColor: colors.surface }]}>
    <View style={styles.sheetTop}><View style={styles.flex}><Text style={[styles.sheetTitle, { color: colors.text }]}>{selected?.vendor_name}</Text><Text style={[styles.reference, { color: colors.muted }]}>{selected?.reference_code}</Text></View><Pressable onPress={() => setSelected(null)} style={styles.close}><X size={20} color={colors.text} /></Pressable></View>
    <Text style={[styles.progressLabel, { color: colors.muted }]}>VENDOR PROGRESS</Text><Text style={[styles.progress, { color: colors.text }]}>{selected ? enquiryStatusLabel(selected.status) : ""}</Text>
    {selected?.event_date ? <View style={styles.event}><CalendarDays size={15} color="#E91E63" /><Text style={[styles.meta, { color: colors.muted }]}>{new Date(`${selected.event_date}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}</Text></View> : null}
    <Text style={[styles.message, { color: colors.muted }]}>{selected?.message}</Text>
    <Text style={[styles.actionLabel, { color: colors.text }]}>Update your side</Text><Text style={[styles.actionHelp, { color: colors.muted }]}>These actions never mark a booking. Only the vendor can confirm Booked.</Text>
    <View style={styles.customerActions}><CustomerAction icon={CheckCircle2} label="I contacted them" disabled={saving} onPress={() => void updateConfirmation("contacted")} /><CustomerAction icon={XCircle} label="Cancel enquiry" disabled={saving} onPress={() => void updateConfirmation("cancelled")} /><CustomerAction icon={X} label="Close" disabled={saving} onPress={() => void updateConfirmation("closed")} /></View>
  </View></View></Modal>
  </SafeAreaView>;
}

function Status({ value }: { value: TrackedEnquiry["status"] }) { return <View style={styles.status}><Text style={styles.statusText}>{enquiryStatusLabel(value)}</Text></View>; }
function CustomerAction({ icon: Icon, label, onPress, disabled }: any) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.customerAction, pressed && styles.pressed, disabled && styles.disabled]}><Icon size={16} color="#C52D60" /><Text style={styles.customerActionText}>{label}</Text></Pressable>; }
function Empty({ title, message, colors, action, onAction }: any) { return <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.emptyIcon}><MessageSquareHeart size={28} color="#E91E63" /></View><Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{message}</Text>{action ? <Pressable onPress={onAction} style={styles.primary}><Text style={styles.primaryText}>{action}</Text></Pressable> : null}</View>; }

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 18, paddingTop: 24, paddingBottom: 110 }, heading: { flexDirection: "row", alignItems: "center", gap: 10 }, flex: { flex: 1, minWidth: 0 }, title: { ...typeStyles.editorialPageTitle }, subtitle: { ...typeStyles.caption, marginTop: 3 }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" }, truthNote: { flexDirection: "row", alignItems: "flex-start", gap: 9, backgroundColor: "#FFF4F7", borderRadius: 15, padding: 12, marginTop: 17 }, truthText: { flex: 1, color: "#7B4256", fontSize: typeScale.caption, lineHeight: typeLeading.label }, loading: { marginTop: 60 }, card: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 11 }, pressed: { transform: [{ scale: .985 }], opacity: .88 }, cardTop: { flexDirection: "row", alignItems: "center", gap: 10 }, channelIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#FFF0F5", alignItems: "center", justifyContent: "center" }, vendor: { fontSize: typeScale.body, fontWeight: "700" }, reference: { fontSize: typeScale.caption, marginTop: 3 }, status: { maxWidth: 110, backgroundColor: "#FFF0F5", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, statusText: { color: "#C52D60", fontSize: typeScale.caption, fontWeight: "700", textAlign: "center" }, metaRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 6 }, meta: { fontSize: typeScale.caption }, dot: { fontSize: typeScale.caption }, customerState: { color: "#9A526B", fontSize: typeScale.caption, marginTop: 10, textTransform: "capitalize" }, quick: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 8, marginTop: 13, paddingTop: 11 }, quickButton: { minHeight: 36, flex: 1, borderRadius: 12, backgroundColor: "#FFF0F5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, quickText: { color: "#C52D60", fontSize: typeScale.caption, fontWeight: "700" }, empty: { marginTop: 24, minHeight: 250, borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center", justifyContent: "center" }, emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#FFF0F6", alignItems: "center", justifyContent: "center" }, emptyTitle: { marginTop: 16, fontSize: typeScale.cardTitle, fontWeight: "700" }, emptyBody: { maxWidth: 370, marginTop: 7, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, textAlign: "center" }, primary: { minHeight: 42, paddingHorizontal: 18, borderRadius: 13, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center", marginTop: 14 }, primaryText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" }, backdrop: { flex: 1, backgroundColor: "rgba(15,8,12,.55)", justifyContent: "flex-end" }, sheet: { width: "100%", maxWidth: 560, alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }, sheetTop: { flexDirection: "row", alignItems: "center", gap: 12 }, sheetTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" }, close: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#FFF0F5", alignItems: "center", justifyContent: "center" }, progressLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.2, marginTop: 19 }, progress: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 4 }, event: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }, message: { fontSize: typeScale.metadata, lineHeight: typeLeading.bodyCompact, marginTop: 14 }, actionLabel: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginTop: 21 }, actionHelp: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 4 }, customerActions: { gap: 8, marginTop: 11 }, customerAction: { minHeight: 44, borderRadius: 14, backgroundColor: "#FFF0F5", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, customerActionText: { color: "#C52D60", fontSize: typeScale.caption, fontWeight: "700" }, disabled: { opacity: .5 },
});
