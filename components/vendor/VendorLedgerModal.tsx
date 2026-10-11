import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Package,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react-native";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";
import {
  VendorBookingService,
  type BookingStatus,
  type VendorBooking,
} from "@/services/vendorBookings";
import type { AvailabilityStatus } from "@/services/vendorAvailability";

const PINK = brandPalette.light.primary;
const GREEN = "#16A34A";
const GOLD = "#D97706";
const RED = "#DC2626";

const money = (val?: number | null) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

type Props = {
  visible: boolean;
  date: string; // YYYY-MM-DD
  vendorId: string;
  vendorName: string;
  currentStatus?: AvailabilityStatus;
  isPast?: boolean;
  dark?: boolean;
  onClose: () => void;
  onStatusChange: (date: string, nextStatus: AvailabilityStatus) => Promise<void>;
  onBookingUpdated: () => void;
};

export default function VendorLedgerModal({
  visible,
  date,
  vendorId,
  vendorName,
  currentStatus = "available",
  isPast = false,
  dark = false,
  onClose,
  onStatusChange,
  onBookingUpdated,
}: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 760;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<VendorBooking[]>([]);
  const [showAddOffline, setShowAddOffline] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [statusToggling, setStatusToggling] = useState(false);

  // Offline form states
  const [offlineName, setOfflineName] = useState("");
  const [offlinePhone, setOfflinePhone] = useState("");
  const [offlinePackage, setOfflinePackage] = useState("");
  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlineNotes, setOfflineNotes] = useState("");
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);

  const palette = useMemo(() => ({
    background: dark ? "#0A0F1A" : "#FFF9FB",
    surface: dark ? "#141B28" : "#FFFFFF",
    surfaceSoft: dark ? "#212A3D" : "#FFF0F5",
    text: dark ? "#FFF8FB" : "#1C1418",
    muted: dark ? "#B0A5AB" : "#6E6368",
    border: dark ? "#2B3548" : "#F3DFE7",
    cardBorder: dark ? "#4A2937" : "#F8CDDB",
  }), [dark]);

  const formattedDate = useMemo(() => {
    if (!date) return "";
    try {
      const [year, month, day] = date.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return date;
    }
  }, [date]);

  const loadEntries = async () => {
    if (!vendorId || !date) return;
    setLoading(true);
    try {
      const list = await VendorBookingService.getVendorBookingsForDate(vendorId, date);
      setEntries(list);
    } catch (err) {
      console.warn("Could not load date entries", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && date) {
      void loadEntries();
      setShowAddOffline(false);
      setOfflineName("");
      setOfflinePhone("");
      setOfflinePackage("");
      setOfflineAmount("");
      setOfflineNotes("");
    }
  }, [visible, date, vendorId]);

  const hasConfirmed = useMemo(() => {
    return entries.some((e) => e.booking_status === "confirmed");
  }, [entries]);

  const handleAcceptBooking = async (booking: VendorBooking) => {
    if (isPast) {
      Alert.alert("Past date", "Cannot confirm bookings for past dates.");
      return;
    }
    setBusyActionId(booking.id);
    try {
      await VendorBookingService.confirmBooking(booking.id);
      await loadEntries();
      onBookingUpdated();
      Alert.alert("Booking confirmed", `Confirmed booking for ${booking.customer_name}. Date is now reserved 🔴.`);
    } catch (err) {
      Alert.alert("Action failed", err instanceof Error ? err.message : "Unable to accept booking.");
    } finally {
      setBusyActionId(null);
    }
  };

  const handleRejectBooking = async (booking: VendorBooking) => {
    Alert.alert(
      "Reject booking request?",
      `Are you sure you want to decline the booking for ${booking.customer_name}?`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setBusyActionId(booking.id);
            try {
              await VendorBookingService.cancelBooking(booking.id, "Vendor unavailable on this date");
              await loadEntries();
              onBookingUpdated();
            } catch (err) {
              Alert.alert("Action failed", err instanceof Error ? err.message : "Unable to reject booking.");
            } finally {
              setBusyActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleCreateOffline = async () => {
    if (!offlineName.trim()) {
      Alert.alert("Name required", "Enter the customer or client name.");
      return;
    }
    const cleanPhone = offlinePhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      Alert.alert("Phone number required", "Enter a valid 10-digit phone number.");
      return;
    }
    const amt = Number(offlineAmount) || 0;
    if (amt <= 0) {
      Alert.alert("Amount required", "Enter the agreed booking amount.");
      return;
    }

    setOfflineSubmitting(true);
    try {
      await VendorBookingService.createOfflineBooking({
        vendorId,
        customerName: offlineName.trim(),
        customerPhone: cleanPhone,
        eventDate: date,
        eventType: "Wedding Event",
        packageTitle: offlinePackage.trim() || "Offline Custom Booking",
        totalAmount: amt,
        specialNotes: offlineNotes.trim() || null,
      });

      setShowAddOffline(false);
      setOfflineName("");
      setOfflinePhone("");
      setOfflinePackage("");
      setOfflineAmount("");
      setOfflineNotes("");
      await loadEntries();
      onBookingUpdated();
      Alert.alert("Offline booking saved", `Date ${date} is now recorded as confirmed in your ledger.`);
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setOfflineSubmitting(false);
    }
  };

  const toggleAvailability = async (target: AvailabilityStatus) => {
    if (hasConfirmed && target === "available") {
      Alert.alert("Active booking exists", "This date has a confirmed booking. Cancel or complete the booking before marking it available.");
      return;
    }
    setStatusToggling(true);
    try {
      await onStatusChange(date, target);
      onBookingUpdated();
    } catch (err) {
      Alert.alert("Could not change status", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setStatusToggling(false);
    }
  };

  return (
    <AnimatedBottomSheet
      visible={visible}
      onRequestClose={onClose}
      variant={desktop ? "center" : "sheet"}
      sheetStyle={[
        styles.sheet,
        desktop && styles.desktopSheet,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <View style={styles.headerIcon}>
          <CalendarDays size={22} color={PINK} strokeWidth={2.2} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>Date Ledger</Text>
          <Text style={[styles.headerSubtitle, { color: palette.muted }]}>
            {formattedDate} · {entries.length} {entries.length === 1 ? "Event" : "Events"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close ledger"
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: palette.surfaceSoft }]}
        >
          <X size={20} color={palette.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Date Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.statusBannerLabel, { color: palette.muted }]}>CALENDAR STATUS</Text>
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusPill,
                  currentStatus === "blocked"
                    ? styles.pillBlocked
                    : currentStatus === "tentative"
                    ? styles.pillTentative
                    : styles.pillAvailable,
                ]}
              >
                <Text style={styles.statusPillText}>
                  {currentStatus === "blocked" ? "🔴 BOOKED / BLOCKED" : currentStatus === "tentative" ? "🟡 TENTATIVE" : "🟢 AVAILABLE"}
                </Text>
              </View>
              {isPast ? <Text style={[styles.pastLabel, { color: palette.muted }]}>· Read Only (Past)</Text> : null}
            </View>
          </View>

          {/* Quick toggle buttons if not past */}
          {!isPast && !hasConfirmed ? (
            <View style={styles.toggleRow}>
              <Pressable
                disabled={statusToggling || currentStatus === "available"}
                onPress={() => toggleAvailability("available")}
                style={[styles.toggleBtn, currentStatus === "available" && styles.toggleBtnActiveAvail]}
              >
                <Text style={[styles.toggleBtnText, currentStatus === "available" && styles.toggleBtnTextActive]}>Avail</Text>
              </Pressable>
              <Pressable
                disabled={statusToggling || currentStatus === "tentative"}
                onPress={() => toggleAvailability("tentative")}
                style={[styles.toggleBtn, currentStatus === "tentative" && styles.toggleBtnActiveTent]}
              >
                <Text style={[styles.toggleBtnText, currentStatus === "tentative" && styles.toggleBtnTextActive]}>Tent</Text>
              </Pressable>
              <Pressable
                disabled={statusToggling || currentStatus === "blocked"}
                onPress={() => toggleAvailability("blocked")}
                style={[styles.toggleBtn, currentStatus === "blocked" && styles.toggleBtnActiveBlock]}
              >
                <Text style={[styles.toggleBtnText, currentStatus === "blocked" && styles.toggleBtnTextActive]}>Booked</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Bookings / Events on this date */}
        <View style={styles.sectionHeaderRow}>
          <Users size={16} color={PINK} />
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Events on this Date</Text>
          <Pressable onPress={() => void loadEntries()} style={styles.refreshBtn}>
            <RefreshCw size={13} color={PINK} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator color={PINK} />
            <Text style={[styles.loaderText, { color: palette.muted }]}>Loading ledger records…</Text>
          </View>
        ) : entries.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Calendar size={32} color={palette.muted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No bookings on this date</Text>
            <Text style={[styles.emptySubtitle, { color: palette.muted }]}>
              This date is open for new wedding inquiries and customer bookings.
            </Text>
          </View>
        ) : (
          <View style={styles.entriesList}>
            {entries.map((entry) => {
              const isPending = entry.booking_status === "pending";
              const isConfirmed = entry.booking_status === "confirmed";
              const isCancelled = entry.booking_status === "cancelled";
              const isBusy = busyActionId === entry.id;

              return (
                <View
                  key={entry.id}
                  style={[
                    styles.entryCard,
                    { backgroundColor: palette.surface, borderColor: isConfirmed ? GREEN : isPending ? GOLD : palette.border },
                  ]}
                >
                  {/* Card Top */}
                  <View style={styles.entryTop}>
                    <View style={styles.flex}>
                      <View style={styles.entryBadges}>
                        <View
                          style={[
                            styles.sourceBadge,
                            entry.source === "offline"
                              ? { backgroundColor: "#F3E8FF" }
                              : { backgroundColor: "#DBEAFE" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sourceBadgeText,
                              entry.source === "offline" ? { color: "#7E22CE" } : { color: "#1D4ED8" },
                            ]}
                          >
                            {entry.source === "offline" ? "OFFLINE / MANUAL" : "ROYALLAGN APP"}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            isConfirmed
                              ? { backgroundColor: "#DCFCE7" }
                              : isPending
                              ? { backgroundColor: "#FEF3C7" }
                              : { backgroundColor: "#FEE2E2" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isConfirmed
                                ? { color: "#15803D" }
                                : isPending
                                ? { color: "#B45309" }
                                : { color: "#B91C1C" },
                            ]}
                          >
                            {isConfirmed ? "CONFIRMED" : isPending ? "PENDING CONFIRMATION" : "CANCELLED"}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.customerName, { color: palette.text }]}>{entry.customer_name}</Text>
                      <Text style={[styles.packageLabel, { color: palette.muted }]}>
                        {entry.package_title} {entry.ticket_id ? `· #${entry.ticket_id}` : ""}
                      </Text>
                    </View>

                    {/* Contact Call/WhatsApp */}
                    {entry.customer_phone ? (
                      <View style={styles.contactActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${entry.customer_name}`}
                          onPress={() => void Linking.openURL(`tel:${entry.customer_phone}`)}
                          style={[styles.contactCircle, { backgroundColor: palette.surfaceSoft }]}
                        >
                          <Phone size={16} color={PINK} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>

                  {/* Financial Breakdown Row */}
                  <View style={[styles.entryFinance, { backgroundColor: palette.surfaceSoft }]}>
                    <View style={styles.financeCell}>
                      <Text style={[styles.financeCellLabel, { color: palette.muted }]}>TOTAL</Text>
                      <Text style={[styles.financeCellVal, { color: palette.text }]}>{money(entry.total_amount)}</Text>
                    </View>
                    <View style={styles.financeCell}>
                      <Text style={[styles.financeCellLabel, { color: GREEN }]}>30% PAID</Text>
                      <Text style={[styles.financeCellVal, { color: GREEN }]}>{money(entry.advance_amount)}</Text>
                    </View>
                    <View style={styles.financeCell}>
                      <Text style={[styles.financeCellLabel, { color: GOLD }]}>70% DUE</Text>
                      <Text style={[styles.financeCellVal, { color: GOLD }]}>{money(entry.due_amount)}</Text>
                    </View>
                  </View>

                  {/* Notes if any */}
                  {entry.special_notes ? (
                    <Text style={[styles.notesText, { color: palette.muted }]}>
                      Notes: {entry.special_notes}
                    </Text>
                  ) : null}

                  {/* Pending Action Buttons (Accept / Reject) */}
                  {isPending && !isPast ? (
                    <View style={styles.actionBtnRow}>
                      <Pressable
                        disabled={isBusy}
                        onPress={() => void handleRejectBooking(entry)}
                        style={[styles.rejectBtn, isBusy && styles.btnDisabled]}
                      >
                        <XCircle size={15} color={RED} />
                        <Text style={styles.rejectBtnText}>Decline</Text>
                      </Pressable>
                      <Pressable
                        disabled={isBusy}
                        onPress={() => void handleAcceptBooking(entry)}
                        style={[styles.acceptBtn, isBusy && styles.btnDisabled]}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <CheckCircle2 size={15} color="#FFF" />
                            <Text style={styles.acceptBtnText}>Accept & Mark Booked 🔴</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Add Offline Booking Button / Form */}
        {!isPast ? (
          <View style={styles.offlineSection}>
            {!showAddOffline ? (
              <Pressable
                onPress={() => setShowAddOffline(true)}
                style={[styles.addOfflineToggle, { backgroundColor: palette.surface, borderColor: palette.border }]}
              >
                <Plus size={18} color={PINK} />
                <Text style={[styles.addOfflineToggleText, { color: palette.text }]}>
                  Record Walk-in / Offline Booking
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.offlineForm, { backgroundColor: palette.surface, borderColor: palette.cardBorder }]}>
                <View style={styles.formHeader}>
                  <Text style={[styles.formTitle, { color: palette.text }]}>New Offline Booking</Text>
                  <Pressable onPress={() => setShowAddOffline(false)}>
                    <X size={18} color={palette.muted} />
                  </Pressable>
                </View>
                <Text style={[styles.formHint, { color: palette.muted }]}>
                  Saving will record the booking and automatically mark this date as BOOKED 🔴.
                </Text>

                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Client Name *</Text>
                  <TextInput
                    value={offlineName}
                    onChangeText={setOfflineName}
                    placeholder="e.g. Vikram & Sneha"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, color: palette.text }]}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Mobile Number *</Text>
                  <TextInput
                    value={offlinePhone}
                    onChangeText={setOfflinePhone}
                    keyboardType="phone-pad"
                    maxLength={15}
                    placeholder="e.g. 9822012345"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, color: palette.text }]}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Service / Package Name</Text>
                  <TextInput
                    value={offlinePackage}
                    onChangeText={setOfflinePackage}
                    placeholder="e.g. Complete Wedding Photography"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, color: palette.text }]}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Total Agreed Amount (₹) *</Text>
                  <TextInput
                    value={offlineAmount}
                    onChangeText={setOfflineAmount}
                    keyboardType="numeric"
                    placeholder="e.g. 85000"
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, color: palette.text }]}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={[styles.fieldLabel, { color: palette.text }]}>Notes (Optional)</Text>
                  <TextInput
                    value={offlineNotes}
                    onChangeText={setOfflineNotes}
                    placeholder="Advance paid, venue timings, special gear..."
                    placeholderTextColor={palette.muted}
                    style={[styles.input, { backgroundColor: palette.surfaceSoft, borderColor: palette.border, color: palette.text }]}
                  />
                </View>

                <Pressable
                  disabled={offlineSubmitting}
                  onPress={handleCreateOffline}
                  style={[styles.saveOfflineBtn, offlineSubmitting && styles.btnDisabled]}
                >
                  {offlineSubmitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <ShieldCheck size={18} color="#FFF" />
                      <Text style={styles.saveOfflineBtnText}>Save & Lock Date as Booked</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { width: "100%", maxHeight: "94%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  desktopSheet: { maxWidth: 660, maxHeight: "90%", borderRadius: 28 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: `${PINK}18`, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  headerSubtitle: { fontSize: typeScale.caption, marginTop: 2 },
  closeBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  scrollContent: { padding: 18, paddingBottom: 40, gap: 16 },

  statusBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderRadius: 16, borderWidth: 1, gap: 12 },
  statusBannerLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  statusBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pillAvailable: { backgroundColor: "#DCFCE7" },
  pillTentative: { backgroundColor: "#FEF3C7" },
  pillBlocked: { backgroundColor: "#FEE2E2" },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  pastLabel: { fontSize: 11, fontWeight: "600" },

  toggleRow: { flexDirection: "row", gap: 6 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#F1F5F9" },
  toggleBtnText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  toggleBtnActiveAvail: { backgroundColor: "#15803D" },
  toggleBtnActiveTent: { backgroundColor: "#B45309" },
  toggleBtnActiveBlock: { backgroundColor: "#DC2626" },
  toggleBtnTextActive: { color: "#FFFFFF" },

  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700", flex: 1 },
  refreshBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  loaderBox: { padding: 24, alignItems: "center", justifyContent: "center", gap: 8 },
  loaderText: { fontSize: typeScale.caption },

  emptyBox: { padding: 24, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { fontSize: typeScale.metadata, fontWeight: "700" },
  emptySubtitle: { fontSize: typeScale.caption, textAlign: "center" },

  entriesList: { gap: 12 },
  entryCard: { padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 10 },
  entryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  entryBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  sourceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  sourceBadgeText: { fontSize: 9, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  statusBadgeText: { fontSize: 9, fontWeight: "800" },
  customerName: { fontSize: typeScale.sectionTitle, fontWeight: "700" },
  packageLabel: { fontSize: 12, marginTop: 2 },
  contactActions: { flexDirection: "row", gap: 6 },
  contactCircle: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  entryFinance: { flexDirection: "row", padding: 10, borderRadius: 12, justifyContent: "space-between" },
  financeCell: { alignItems: "center" },
  financeCellLabel: { fontSize: 10, fontWeight: "700" },
  financeCellVal: { fontSize: 14, fontWeight: "800", marginTop: 2 },
  notesText: { fontSize: 11, fontStyle: "italic" },

  actionBtnRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#FCA5A5" },
  rejectBtnText: { color: RED, fontSize: 12, fontWeight: "700" },
  acceptBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: PINK },
  acceptBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },

  offlineSection: { marginTop: 6 },
  addOfflineToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" },
  addOfflineToggleText: { fontSize: typeScale.metadata, fontWeight: "700" },

  offlineForm: { padding: 16, borderRadius: 18, borderWidth: 1.5, gap: 12 },
  formHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  formTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  formHint: { fontSize: 11 },
  formField: { gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, minHeight: 42, fontSize: typeScale.metadata },
  saveOfflineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: PINK, minHeight: 46, borderRadius: 12, marginTop: 4 },
  saveOfflineBtnText: { color: "#FFFFFF", fontSize: typeScale.metadata, fontWeight: "700" },
});
