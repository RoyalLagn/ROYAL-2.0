import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Lock,
  MapPin,
  MessageSquare,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Unlock,
  User,
  X,
} from "lucide-react-native";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import Pressable from "@/components/InteropSafePressable";
import { brandPalette } from "@/constants/brandPalette";
import {
  formatCutoffDisplayIST,
  getTimeRemainingToCutoff,
} from "@/lib/bookingCancellationPolicy";
import {
  VendorBookingService,
  type SecureBookingDetails,
} from "@/services/vendorBookings";

const PINK = brandPalette.light.primary;

const EMERGENCY_REASONS = [
  "Vendor Unreachable on Event Day",
  "Critical Venue / Location Issue",
  "Severe Family / Medical Emergency",
  "Severe Weather / Force Majeure",
  "Other Urgent Disruption",
];

const CANCEL_REASONS = [
  "Date / Venue Rescheduled",
  "Found Alternative Arrangement",
  "Personal / Family Emergency",
  "Budgetary Adjustments",
  "Other Reason",
];

type Props = {
  visible: boolean;
  bookingRef: string;
  role: "customer" | "vendor" | "admin";
  dark?: boolean;
  onClose: () => void;
  onBookingUpdated?: () => void;
  onOpenTicket?: (ticketId: string) => void;
};

export default function BookingDetailsModal({
  visible,
  bookingRef,
  role,
  dark = false,
  onClose,
  onBookingUpdated,
  onOpenTicket,
}: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 760;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<SecureBookingDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState(CANCEL_REASONS[0]);
  const [customCancelNotes, setCustomCancelNotes] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

  // Emergency modal state
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [selectedEmergencyReason, setSelectedEmergencyReason] = useState(EMERGENCY_REASONS[0]);
  const [emergencyDescription, setEmergencyDescription] = useState("");
  const [submittingEmergency, setSubmittingEmergency] = useState(false);

  const palette = useMemo(
    () => ({
      background: dark ? "#0F1623" : "#FFFFFF",
      surface: dark ? "#182234" : "#FFF9FB",
      surfaceSoft: dark ? "#222D42" : "#FFF0F5",
      text: dark ? "#FAF5F8" : "#171015",
      muted: dark ? "#B0A5AB" : "#6E6368",
      border: dark ? "#2B3548" : "#F3DFE7",
      cardBorder: dark ? "#4A2937" : "#F8CDDB",
      accent: PINK,
    }),
    [dark]
  );

  const loadDetails = useCallback(async () => {
    if (!bookingRef) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await VendorBookingService.getSecureBookingDetails(bookingRef, role);
      if (!data) {
        setErrorMessage("Booking details could not be found.");
      } else {
        setBooking(data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load booking details.");
    } finally {
      setLoading(false);
    }
  }, [bookingRef, role]);

  useEffect(() => {
    if (visible && bookingRef) {
      void loadDetails();
    } else {
      setBooking(null);
      setErrorMessage(null);
      setShowCancelModal(false);
      setShowEmergencyModal(false);
    }
  }, [visible, bookingRef, loadDetails]);

  // Cutoff & status calculations
  const countdown = useMemo(() => {
    if (!booking) return null;
    return getTimeRemainingToCutoff(
      booking.cancellation_cutoff_at,
      booking.event_start_at,
      booking.event_date
    );
  }, [booking]);

  const handleCall = (phone?: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, "");
    void Linking.openURL(`tel:${clean}`);
  };

  const handleWhatsApp = (phone?: string | null) => {
    if (!phone) return;
    let clean = phone.replace(/\D/g, "");
    if (clean.length === 10) clean = `91${clean}`;
    const text = encodeURIComponent(
      `Hello, regarding RoyalLagn Booking #${booking?.ticket_id} for ${booking?.event_date}:`
    );
    void Linking.openURL(`https://wa.me/${clean}?text=${text}`);
  };

  const handleOpenMap = (mapUrl?: string | null) => {
    if (!mapUrl) return;
    const target = mapUrl.startsWith("http") ? mapUrl : `https://${mapUrl}`;
    void Linking.openURL(target);
  };

  // Cancellation action
  const handleConfirmCancel = async () => {
    if (!booking) return;
    setSubmittingCancel(true);
    const reasonText = customCancelNotes.trim()
      ? `${selectedCancelReason}: ${customCancelNotes.trim()}`
      : selectedCancelReason;

    try {
      if (role === "customer") {
        await VendorBookingService.cancelCustomerBooking(booking.id, reasonText);
      } else {
        await VendorBookingService.cancelBooking(booking.id, reasonText);
      }

      setShowCancelModal(false);
      Alert.alert(
        "Booking Cancelled",
        booking.advance_amount > 0
          ? `Your cancellation has been processed. Your paid advance of ₹${booking.advance_amount.toLocaleString("en-IN")} has been queued for full refund (72-hour SLA).`
          : "Your booking has been cancelled successfully."
      );
      void loadDetails();
      onBookingUpdated?.();
    } catch (err) {
      Alert.alert(
        "Cancellation Failed",
        err instanceof Error ? err.message : "Could not cancel booking."
      );
    } finally {
      setSubmittingCancel(false);
    }
  };

  // Emergency action
  const handleConfirmEmergency = async () => {
    if (!booking) return;
    if (!emergencyDescription.trim()) {
      Alert.alert("Description Required", "Please describe the emergency situation so Admins can act quickly.");
      return;
    }

    setSubmittingEmergency(true);
    try {
      await VendorBookingService.reportBookingEmergency(
        booking.id,
        selectedEmergencyReason,
        emergencyDescription.trim()
      );

      setShowEmergencyModal(false);
      setEmergencyDescription("");
      Alert.alert(
        "🚨 Emergency Escalated",
        "Your emergency report has been prioritized and dispatched to RoyalLagn Admin Support. An administrative case officer will review and coordinate mediation immediately."
      );
      void loadDetails();
      onBookingUpdated?.();
    } catch (err) {
      Alert.alert(
        "Report Failed",
        err instanceof Error ? err.message : "Could not file emergency report."
      );
    } finally {
      setSubmittingEmergency(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "#059669";
      case "cancelled":
      case "cancelled_by_vendor":
      case "cancelled_by_customer":
        return "#DC2626";
      case "pending_vendor_confirmation":
        return "#D97706";
      default:
        return "#6B7280";
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
        <View style={styles.headerLeft}>
          <View style={styles.badgeRow}>
            <Text style={[styles.ticketId, { color: PINK }]}>#{booking?.ticket_id || bookingRef}</Text>
            {booking && (
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor(booking.booking_status)}15` }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor(booking.booking_status) }]}>
                  {booking.booking_status.replace(/_/g, " ").toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: palette.muted }]}>
            {booking ? `${booking.event_type} · ${booking.event_date}` : "Booking Details"}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: palette.surfaceSoft }]}
        >
          <X size={20} color={palette.text} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={PINK} />
            <Text style={[styles.loadingText, { color: palette.muted }]}>Loading booking details...</Text>
          </View>
        ) : errorMessage || !booking ? (
          <View style={styles.centerBox}>
            <AlertTriangle size={36} color="#DC2626" />
            <Text style={styles.errorTitle}>{errorMessage || "Booking Not Found"}</Text>
            <Pressable onPress={loadDetails} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 1. 5-Day Cancellation & Unlock Policy Banner */}
            <View
              style={[
                styles.policyBanner,
                booking.is_cutoff_passed
                  ? { backgroundColor: booking.booking_status === "confirmed" ? "#ECFDF5" : "#FEF3C7", borderColor: booking.booking_status === "confirmed" ? "#10B981" : "#F59E0B" }
                  : { backgroundColor: "#EFF6FF", borderColor: "#3B82F6" },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                {booking.is_cutoff_passed ? (
                  booking.booking_status === "confirmed" ? (
                    <Unlock size={20} color="#059669" />
                  ) : (
                    <Lock size={20} color="#D97706" />
                  )
                ) : (
                  <Clock size={20} color="#2563EB" />
                )}

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.policyBannerTitle,
                      {
                        color: booking.is_cutoff_passed
                          ? booking.booking_status === "confirmed" ? "#047857" : "#B45309"
                          : "#1D4ED8",
                      },
                    ]}
                  >
                    {booking.is_cutoff_passed
                      ? booking.booking_status === "confirmed"
                        ? "Event Inside 5 Days · Contact Details Unlocked"
                        : "Event Inside 5 Days · Cancellation Window Closed"
                      : "5-Day Cancellation Window Active"}
                  </Text>

                  <Text
                    style={[
                      styles.policyBannerDesc,
                      {
                        color: booking.is_cutoff_passed
                          ? booking.booking_status === "confirmed" ? "#065F46" : "#92400E"
                          : "#1E40AF",
                      },
                    ]}
                  >
                    {booking.is_cutoff_passed ? (
                      booking.booking_status === "confirmed"
                        ? "Standard cancellation is closed. Full vendor & customer direct contact details are now unlocked for coordination."
                        : "Cancellation is locked within 120 hours of the event. Unconfirmed bookings remain confidential."
                    ) : (
                      countdown?.label ? (
                        <>
                          <Text style={{ fontWeight: "700" }}>{countdown.label}. </Text>
                          Cutoff deadline: {formatCutoffDisplayIST(booking.cancellation_cutoff_at)}. Direct contacts unlock at cutoff.
                        </>
                      ) : (
                        `Cutoff: ${formatCutoffDisplayIST(booking.cancellation_cutoff_at)}`
                      )
                    )}
                  </Text>
                </View>
              </View>
            </View>

            {/* Emergency status alert if reported */}
            {booking.emergency_status && booking.emergency_status !== "none" && (
              <View style={styles.emergencyAlertBanner}>
                <ShieldAlert size={18} color="#DC2626" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.emergencyAlertTitle}>
                    🚨 Emergency Case #{booking.emergency_status.toUpperCase()}
                  </Text>
                  <Text style={styles.emergencyAlertDesc}>
                    Reason: {booking.emergency_reason || "Escalated for immediate mediation"}. Case officer assigned.
                  </Text>
                </View>
              </View>
            )}

            {/* 2. Customer Contact Card (Locked/Unlocked) */}
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <User size={16} color={PINK} />
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Customer Details</Text>
                </View>
                {role === "vendor" && !booking.contacts_unlocked ? (
                  <View style={styles.lockedPill}>
                    <Lock size={12} color="#D97706" />
                    <Text style={styles.lockedPillText}>LOCKED UNTIL CUTOFF</Text>
                  </View>
                ) : (
                  <View style={styles.unlockedPill}>
                    <CheckCircle size={12} color="#059669" />
                    <Text style={styles.unlockedPillText}>CONFIRMED</Text>
                  </View>
                )}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: palette.muted }]}>Name</Text>
                <Text style={[styles.infoVal, { color: palette.text }]}>{booking.customer.name}</Text>
              </View>

              {/* Phone & WhatsApp */}
              {role === "vendor" && !booking.contacts_unlocked ? (
                <View style={styles.lockedInfoBox}>
                  <Lock size={16} color="#B45309" />
                  <Text style={styles.lockedInfoText}>
                    Phone number and WhatsApp will automatically unlock on{" "}
                    <Text style={{ fontWeight: "700" }}>{formatCutoffDisplayIST(booking.cancellation_cutoff_at)}</Text>.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: palette.muted }]}>Personal Contact</Text>
                    <View style={styles.actionRow}>
                      <Text style={[styles.infoVal, { color: palette.text }]}>
                        {booking.customer.phone || "—"}
                      </Text>
                      {booking.customer.phone && (
                        <Pressable
                          onPress={() => handleCall(booking.customer.phone)}
                          style={[styles.miniActionBtn, { backgroundColor: "#10B981" }]}
                        >
                          <Phone size={12} color="#FFFFFF" />
                          <Text style={styles.miniActionBtnText}>Call</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: palette.muted }]}>WhatsApp</Text>
                    <View style={styles.actionRow}>
                      <Text style={[styles.infoVal, { color: palette.text }]}>
                        {booking.customer.whatsapp || "—"}
                      </Text>
                      {booking.customer.whatsapp && (
                        <Pressable
                          onPress={() => handleWhatsApp(booking.customer.whatsapp)}
                          style={[styles.miniActionBtn, { backgroundColor: "#25D366" }]}
                        >
                          <MessageSquare size={12} color="#FFFFFF" />
                          <Text style={styles.miniActionBtnText}>WhatsApp</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </>
              )}

              {/* Service Venue Location (Google Maps) */}
              <View style={[styles.divider, { backgroundColor: palette.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: palette.muted }]}>Venue Location</Text>
                {role === "vendor" && !booking.contacts_unlocked ? (
                  <Text style={[styles.infoVal, { color: palette.muted, fontStyle: "italic" }]}>
                    🔒 Unlocks 5 days prior to event
                  </Text>
                ) : booking.customer.service_map_url ? (
                  <Pressable
                    onPress={() => handleOpenMap(booking.customer.service_map_url)}
                    style={styles.linkRow}
                  >
                    <MapPin size={14} color={PINK} />
                    <Text style={[styles.linkText, { color: PINK }]}>Open in Google Maps</Text>
                    <ExternalLink size={12} color={PINK} />
                  </Pressable>
                ) : (
                  <Text style={[styles.infoVal, { color: palette.muted }]}>Venue link not provided</Text>
                )}
              </View>

              {/* Booking Description / Instructions */}
              <View style={styles.infoBlock}>
                <Text style={[styles.infoLabel, { color: palette.muted, marginBottom: 4 }]}>
                  Event Arrangements & Instructions
                </Text>
                {role === "vendor" && !booking.contacts_unlocked ? (
                  <Text style={[styles.infoDesc, { color: palette.muted, fontStyle: "italic" }]}>
                    🔒 Venue instructions & arrangements unlock at 5-day cutoff.
                  </Text>
                ) : (
                  <Text style={[styles.infoDesc, { color: palette.text }]}>
                    {booking.customer.booking_description || "No specific instructions provided."}
                  </Text>
                )}
              </View>
            </View>

            {/* 3. Vendor Details Card (Locked/Unlocked) */}
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.cardBorder }]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <FileText size={16} color={PINK} />
                  <Text style={[styles.cardTitle, { color: palette.text }]}>Vendor Service Provider</Text>
                </View>
                {role === "customer" && !booking.contacts_unlocked ? (
                  <View style={styles.lockedPill}>
                    <Lock size={12} color="#D97706" />
                    <Text style={styles.lockedPillText}>PHONE LOCKED</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: palette.muted }]}>Business Name</Text>
                <Text style={[styles.infoVal, { color: palette.text, fontWeight: "700" }]}>
                  {booking.vendor.business_name}
                </Text>
              </View>

              {booking.vendor.city && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: palette.muted }]}>City</Text>
                  <Text style={[styles.infoVal, { color: palette.text }]}>{booking.vendor.city}</Text>
                </View>
              )}

              {/* Direct Phone */}
              {role === "customer" && !booking.contacts_unlocked ? (
                <View style={styles.lockedInfoBox}>
                  <Lock size={16} color="#B45309" />
                  <Text style={styles.lockedInfoText}>
                    Vendor direct contact phone unlocks automatically on{" "}
                    <Text style={{ fontWeight: "700" }}>{formatCutoffDisplayIST(booking.cancellation_cutoff_at)}</Text>.
                  </Text>
                </View>
              ) : (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: palette.muted }]}>Direct Phone</Text>
                  <View style={styles.actionRow}>
                    <Text style={[styles.infoVal, { color: palette.text }]}>
                      {booking.vendor.contact_phone || "—"}
                    </Text>
                    {booking.vendor.contact_phone && (
                      <>
                        <Pressable
                          onPress={() => handleCall(booking.vendor.contact_phone)}
                          style={[styles.miniActionBtn, { backgroundColor: "#10B981" }]}
                        >
                          <Phone size={12} color="#FFFFFF" />
                          <Text style={styles.miniActionBtnText}>Call</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleWhatsApp(booking.vendor.contact_phone)}
                          style={[styles.miniActionBtn, { backgroundColor: "#25D366" }]}
                        >
                          <MessageSquare size={12} color="#FFFFFF" />
                          <Text style={styles.miniActionBtnText}>WhatsApp</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* 4. Financial Summary */}
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.cardTitle, { color: palette.text, marginBottom: 12 }]}>
                Financial Escrow Breakdown
              </Text>

              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: palette.muted }]}>Total Booking Value</Text>
                <Text style={[styles.priceVal, { color: palette.text }]}>
                  ₹{booking.total_amount.toLocaleString("en-IN")}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: "#059669", fontWeight: "700" }]}>
                  Paid in Escrow (30% Advance)
                </Text>
                <Text style={[styles.priceVal, { color: "#059669", fontWeight: "800" }]}>
                  ₹{booking.advance_amount.toLocaleString("en-IN")}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: palette.muted }]}>Due on Event Day (70%)</Text>
                <Text style={[styles.priceVal, { color: palette.text }]}>
                  ₹{booking.due_amount.toLocaleString("en-IN")}
                </Text>
              </View>

              {booking.refund_status && (
                <View style={[styles.refundBadgeBox, { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" }]}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#B91C1C" }}>
                    Refund Status: {booking.refund_status.toUpperCase()}
                  </Text>
                  {booking.refund_amount ? (
                    <Text style={{ fontSize: 11, color: "#991B1B", marginTop: 2 }}>
                      Refund Amount: ₹{booking.refund_amount.toLocaleString("en-IN")} (72-Hour Bank Settlement)
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* 5. Cancellation Audit (if cancelled) */}
            {booking.cancelled_at && (
              <View style={[styles.card, { backgroundColor: "#FEF2F2", borderColor: "#F87171" }]}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#991B1B", marginBottom: 6 }}>
                  Cancellation Audit Log
                </Text>
                <Text style={{ fontSize: 12, color: "#7F1D1D" }}>
                  Cancelled by: {booking.cancelled_by ? booking.cancelled_by.toUpperCase() : "SYSTEM"}
                </Text>
                <Text style={{ fontSize: 12, color: "#7F1D1D", marginTop: 2 }}>
                  Timestamp: {formatCutoffDisplayIST(booking.cancelled_at)}
                </Text>
                {booking.cancellation_reason && (
                  <Text style={{ fontSize: 12, color: "#7F1D1D", marginTop: 2 }}>
                    Reason: {booking.cancellation_reason}
                  </Text>
                )}
              </View>
            )}

            {/* 6. Action Buttons */}
            <View style={styles.actionContainer}>
              {/* E-Ticket View */}
              {onOpenTicket && (
                <Pressable
                  onPress={() => onOpenTicket(booking.ticket_id)}
                  style={[styles.ticketBtn, { borderColor: PINK }]}
                >
                  <Ticket size={16} color={PINK} />
                  <Text style={[styles.ticketBtnText, { color: PINK }]}>View E-Ticket</Text>
                </Pressable>
              )}

              {/* Cancellation or Emergency button */}
              {booking.can_cancel ? (
                <Pressable
                  onPress={() => setShowCancelModal(true)}
                  style={styles.cancelActionBtn}
                >
                  <Text style={styles.cancelActionBtnText}>Cancel Booking</Text>
                </Pressable>
              ) : booking.booking_status === "confirmed" ? (
                <View style={styles.lockedActionsRow}>
                  <View style={styles.lockedNoticeBtn}>
                    <Lock size={14} color="#6B7280" />
                    <Text style={styles.lockedNoticeBtnText}>Cancellation Locked (≤ 5 Days)</Text>
                  </View>

                  <Pressable
                    onPress={() => setShowEmergencyModal(true)}
                    style={styles.emergencyBtn}
                  >
                    <AlertTriangle size={15} color="#FFFFFF" />
                    <Text style={styles.emergencyBtnText}>Report Emergency</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/* Cancellation Confirmation Modal */}
      {showCancelModal && booking && (
        <View style={styles.overlayBackdrop}>
          <View style={[styles.dialogBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={styles.dialogHeader}>
              <AlertTriangle size={22} color="#DC2626" />
              <Text style={[styles.dialogTitle, { color: palette.text }]}>Cancel Booking #{booking.ticket_id}?</Text>
            </View>

            <Text style={[styles.dialogDesc, { color: palette.muted }]}>
              {booking.advance_amount > 0
                ? `You are within the free cancellation window (more than 120 hours before event). Your 30% advance of ₹${booking.advance_amount.toLocaleString("en-IN")} will be automatically queued for a 72-hour refund to your original payment method.`
                : "Cancellation is permitted before the 5-day cutoff."}
            </Text>

            <Text style={[styles.inputLabel, { color: palette.muted, marginTop: 12 }]}>Reason for Cancellation *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CANCEL_REASONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setSelectedCancelReason(r)}
                  style={[
                    styles.reasonPill,
                    selectedCancelReason === r && { backgroundColor: PINK, borderColor: PINK },
                  ]}
                >
                  <Text style={[styles.reasonPillText, selectedCancelReason === r && { color: "#FFFFFF" }]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <TextInput
              value={customCancelNotes}
              onChangeText={setCustomCancelNotes}
              placeholder="Additional comments (optional)..."
              placeholderTextColor={palette.muted}
              style={[styles.dialogInput, { color: palette.text, borderColor: palette.border }]}
            />

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setShowCancelModal(false)}
                disabled={submittingCancel}
                style={[styles.dialogCancelBtn, { borderColor: palette.border }]}
              >
                <Text style={[styles.dialogCancelBtnText, { color: palette.text }]}>Keep Booking</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmCancel}
                disabled={submittingCancel}
                style={styles.dialogConfirmBtn}
              >
                {submittingCancel ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogConfirmBtnText}>Confirm Cancellation</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Emergency Reporting Modal */}
      {showEmergencyModal && booking && (
        <View style={styles.overlayBackdrop}>
          <View style={[styles.dialogBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
            <View style={styles.dialogHeader}>
              <ShieldAlert size={22} color="#DC2626" />
              <Text style={[styles.dialogTitle, { color: palette.text }]}>Report Booking Emergency</Text>
            </View>

            <Text style={[styles.dialogDesc, { color: palette.muted }]}>
              Normal cancellation is locked because the event starts within 5 days (120 hours). Use this form to escalate an urgent operational, vendor, or venue emergency directly to RoyalLagn Admins for immediate mediation.
            </Text>

            <Text style={[styles.inputLabel, { color: palette.muted, marginTop: 12 }]}>Emergency Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {EMERGENCY_REASONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setSelectedEmergencyReason(r)}
                  style={[
                    styles.reasonPill,
                    selectedEmergencyReason === r && { backgroundColor: "#DC2626", borderColor: "#DC2626" },
                  ]}
                >
                  <Text style={[styles.reasonPillText, selectedEmergencyReason === r && { color: "#FFFFFF" }]}>
                    {r}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: palette.muted }]}>Describe Situation & Required Action *</Text>
            <TextInput
              value={emergencyDescription}
              onChangeText={setEmergencyDescription}
              placeholder="Provide exact details of the issue..."
              placeholderTextColor={palette.muted}
              multiline
              numberOfLines={3}
              style={[styles.dialogTextArea, { color: palette.text, borderColor: palette.border }]}
            />

            <View style={styles.dialogActions}>
              <Pressable
                onPress={() => setShowEmergencyModal(false)}
                disabled={submittingEmergency}
                style={[styles.dialogCancelBtn, { borderColor: palette.border }]}
              >
                <Text style={[styles.dialogCancelBtnText, { color: palette.text }]}>Back</Text>
              </Pressable>

              <Pressable
                onPress={handleConfirmEmergency}
                disabled={submittingEmergency}
                style={[styles.dialogConfirmBtn, { backgroundColor: "#DC2626" }]}
              >
                {submittingEmergency ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dialogConfirmBtnText}>Submit Emergency Report</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  desktopSheet: {
    width: "100%",
    maxWidth: 620,
    borderRadius: 24,
    alignSelf: "center",
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ticketId: {
    fontSize: 18,
    fontWeight: "900",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
    gap: 14,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#DC2626",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: PINK,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  policyBanner: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
  },
  policyBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  policyBannerDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  emergencyAlertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  emergencyAlertTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DC2626",
  },
  emergencyAlertDesc: {
    fontSize: 11,
    color: "#991B1B",
    marginTop: 1,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  lockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lockedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#B45309",
    letterSpacing: 0.4,
  },
  unlockedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unlockedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#065F46",
    letterSpacing: 0.4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 12,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  miniActionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  lockedInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(217, 119, 6, 0.08)",
    padding: 10,
    borderRadius: 10,
    marginVertical: 4,
  },
  lockedInfoText: {
    flex: 1,
    fontSize: 11,
    color: "#B45309",
    lineHeight: 15,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  linkText: {
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  infoBlock: {
    marginTop: 8,
  },
  infoDesc: {
    fontSize: 12,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  priceLabel: {
    fontSize: 12,
  },
  priceVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  refundBadgeBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionContainer: {
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  ticketBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  ticketBtnText: {
    fontSize: 13,
    fontWeight: "800",
  },
  cancelActionBtn: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  cancelActionBtnText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "800",
  },
  lockedActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  lockedNoticeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: 12,
  },
  lockedNoticeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
  },
  emergencyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#DC2626",
    paddingVertical: 12,
    borderRadius: 12,
  },
  emergencyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  overlayBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 999,
  },
  dialogBox: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    elevation: 10,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  dialogDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  reasonPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginRight: 6,
  },
  reasonPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dialogInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  dialogTextArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    minHeight: 64,
    marginBottom: 16,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  dialogCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  dialogCancelBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dialogConfirmBtn: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  dialogConfirmBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
});

export { BookingDetailsModal };

