import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  Hash,
  Heart,
  MessageCircle,
  PackageCheck,
  Phone,
  ReceiptText,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";
import {
  VendorBookingService,
  type VendorBooking,
} from "@/services/vendorBookings";

const PINK = brandPalette.light.primary;
const GOLD = "#F59E0B";
const GREEN = "#16A34A";
const INK = "#1B1317";
const MUTED = "#7A6F75";

const money = (value?: string | number | null) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const formatEventDate = (dateStr?: string) => {
  if (!dateStr) return "—";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

export default function RoyalLagnTicketScreen() {
  const params = useLocalSearchParams<{ booking_id?: string; ticket_id?: string }>();
  const reference = params.ticket_id || params.booking_id;
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const compact = width < 380;

  const [booking, setBooking] = useState<VendorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTicket = useCallback(async () => {
    if (!reference) {
      setError("Booking or Ticket reference is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await VendorBookingService.getBookingByIdOrTicket(reference);
      if (!data) {
        setError("Ticket not found. Please check your reference code.");
      } else {
        setBooking(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve ticket.");
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: dark ? "#070B14" : "#FDF4F7" }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, desktop && s.scrollContentDesktop]}
      >
        {loading ? (
          <View style={s.stateBox}>
            <ActivityIndicator color={PINK} size="large" />
            <Text style={[s.stateText, { color: dark ? "#AAA" : "#666" }]}>
              Retrieving RoyalLagn E-Ticket…
            </Text>
          </View>
        ) : error || !booking ? (
          <View style={s.stateBox}>
            <ReceiptText size={42} color={PINK} />
            <Text style={[s.stateTitle, { color: dark ? "#FFF" : INK }]}>Ticket Unavailable</Text>
            <Text style={[s.stateText, { color: dark ? "#AAA" : MUTED }]}>{error}</Text>
            <Pressable onPress={() => router.replace("/(tabs)/bookings")} style={s.actionBtn}>
              <Text style={s.actionBtnText}>Go to My Bookings</Text>
            </Pressable>
          </View>
        ) : (
          <ConfirmedRoyalTicket
            booking={booking}
            compact={compact}
            desktop={desktop}
            dark={dark}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfirmedRoyalTicket({
  booking,
  compact,
  desktop,
  dark,
}: {
  booking: VendorBooking;
  compact: boolean;
  desktop: boolean;
  dark: boolean;
}) {
  const isConfirmed = booking.booking_status === "confirmed";
  const isCancelled = booking.booking_status === "cancelled" || booking.booking_status === "cancelled_by_vendor" || booking.booking_status === "cancelled_by_customer";
  const heroImage = booking.vendor_image
    ? { uri: booking.vendor_image }
    : require("../assets/images/optimized/vendor-placeholder.webp");

  const vendorPhone = booking.vendor_phone?.replace(/\D/g, "") || "918806092609";

  const shareWhatsApp = () => {
    const lines = [
      "*👑 ROYALLAGN WEDDING E-TICKET*",
      `*Ticket ID:* #${booking.ticket_id}`,
      `*Vendor:* ${booking.vendor_name || "Wedding Vendor"}`,
      `*Client:* ${booking.customer_name}`,
      `*Occasion:* ${booking.event_type}`,
      `*Event Date:* ${formatEventDate(booking.event_date)}`,
      `*Package:* ${booking.package_title}`,
      ...(booking.add_ons && booking.add_ons.length > 0
        ? [`*Add-ons:* ${booking.add_ons.map((a) => a.title).join(", ")}`]
        : []),
      `*Total Booking Value:* ${money(booking.total_amount)}`,
      `*Paid (30% Advance):* ${money(booking.advance_amount)} ✅`,
      `*Due at Event (70%):* ${money(booking.due_amount)} 🪙`,
      `*Contact Vendor:* +${vendorPhone}`,
      "-------------------------",
      "Book verified wedding vendors on RoyalLagn",
    ];

    const message = lines.join("\n");
    void Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
  };

  return (
    <View style={[s.ticketWrap, desktop && s.ticketWrapDesktop]}>
      {/* Hero Header */}
      <View style={[s.hero, compact && s.heroCompact]}>
        <Image source={heroImage} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={["rgba(10,5,8,0.72)", "rgba(10,5,8,0.30)", "rgba(10,5,8,0.92)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Hero Top Bar */}
        <View style={s.heroTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to bookings"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/bookings");
            }}
            style={s.heroBack}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </Pressable>

          <View style={[s.statusBadge, isConfirmed ? s.statusConfirmed : isCancelled ? s.statusCancelled : s.statusPending]}>
            <ShieldCheck size={16} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={s.statusText}>{isConfirmed ? "CONFIRMED" : isCancelled ? "CANCELLED BY VENDOR" : "PENDING VENDOR CONFIRMATION"}</Text>
          </View>
        </View>

        {/* Hero Bottom Titles */}
        <View style={s.heroBottom}>
          <Text style={[s.heroTitle, compact && s.heroTitleCompact]}>
            {booking.vendor_name || "Wedding Vendor"}
          </Text>
          <Text style={s.heroBrand}>ROYALLAGN LUXURY WEDDING MARKETPLACE</Text>

          <View style={s.ticketPill}>
            <Hash size={16} color={GOLD} strokeWidth={2.8} />
            <Text selectable style={s.ticketPillText}>
              TICKET ID: {booking.ticket_id}
            </Text>
          </View>
        </View>
      </View>

      {/* Ticket Paper Body */}
      <View style={[s.paper, { backgroundColor: dark ? "#141C2B" : "#FFFFFF" }]}>
        <View style={s.paperInner}>
          {isCancelled ? (
            <View style={s.cancelledAlertBox}>
              <Text style={s.cancelledAlertTitle}>🔴 Booking Cancelled by Vendor</Text>
              <Text style={s.cancelledAlertReason}>
                Reason: {booking.rejection_reason || "Declined by vendor"}
              </Text>
              <View style={s.refundNoticeBox}>
                <Text style={s.refundNoticeText}>
                  {booking.refund_status === "refunded"
                    ? `✓ 30% Advance (${money(booking.advance_amount)}) has been refunded.`
                    : `Your paid amount of ${money(booking.advance_amount)} will be credited back to your payment method in next 72 hours.`}
                </Text>
              </View>
            </View>
          ) : !isConfirmed ? (
            <View style={s.pendingAlertBox}>
              <Text style={s.pendingAlertTitle}>⏳ Booking Request Pending Confirmation</Text>
              <Text style={s.pendingAlertText}>
                Your 30% advance deposit of {money(booking.advance_amount)} is safely secured. This E-Ticket will be confirmed once the vendor accepts your request.
              </Text>
            </View>
          ) : null}
          {/* Client & Contact Column */}
          <View style={[s.twoCols, compact && s.twoColsCompact]}>
            <View style={s.colCell}>
              <View style={s.colIconWrap}>
                <UserRound size={17} color={PINK} />
              </View>
              <View style={s.flex}>
                <Text style={s.cellLabel}>CLIENT NAME</Text>
                <Text style={[s.cellValue, { color: dark ? "#FFF" : INK }]}>
                  {booking.customer_name}
                </Text>
              </View>
            </View>

            <View style={[s.vDivider, compact && s.vDividerCompact]} />

            <View style={s.colCell}>
              <View style={s.colIconWrap}>
                <Phone size={17} color={PINK} />
              </View>
              <View style={s.flex}>
                <Text style={s.cellLabel}>CONTACT PHONE</Text>
                <Text style={[s.cellValue, { color: dark ? "#FFF" : INK }]}>
                  {booking.customer_phone}
                </Text>
              </View>
            </View>
          </View>

          {/* Notched Tear Line 1 */}
          <View style={s.tearLine}>
            <View style={s.notchLeft} />
            <View style={[s.dashedBar, { borderColor: dark ? "#2B3548" : "#EAD9E0" }]} />
            <View style={s.notchRight} />
          </View>

          {/* Event Date & Occasion */}
          <View style={[s.twoCols, compact && s.twoColsCompact]}>
            <View style={s.colCell}>
              <View style={[s.colIconWrap, { backgroundColor: "#FEF3C7" }]}>
                <CalendarDays size={17} color={GOLD} />
              </View>
              <View style={s.flex}>
                <Text style={s.cellLabel}>EVENT DATE</Text>
                <Text style={[s.cellValue, { color: dark ? "#FFF" : INK }]}>
                  {formatEventDate(booking.event_date)}
                </Text>
              </View>
            </View>

            <View style={[s.vDivider, compact && s.vDividerCompact]} />

            <View style={s.colCell}>
              <View style={[s.colIconWrap, { backgroundColor: "#FCE7EE" }]}>
                <Sparkles size={17} color={PINK} />
              </View>
              <View style={s.flex}>
                <Text style={s.cellLabel}>OCCASION</Text>
                <Text style={[s.cellValue, { color: dark ? "#FFF" : INK }]}>
                  {booking.event_type}
                </Text>
              </View>
            </View>
          </View>

          {/* Notched Tear Line 2 */}
          <View style={s.tearLine}>
            <View style={s.notchLeft} />
            <View style={[s.dashedBar, { borderColor: dark ? "#2B3548" : "#EAD9E0" }]} />
            <View style={s.notchRight} />
          </View>

          {/* Package Details */}
          <View style={s.packageSection}>
            <View style={s.packageHeaderRow}>
              <PackageCheck size={18} color={PINK} />
              <Text style={s.packageHeaderTitle}>PACKAGE & SERVICES BOOKED</Text>
            </View>
            <Text style={[s.packageTitle, { color: dark ? "#FFF" : INK }]}>
              {booking.package_title}
            </Text>
            {booking.add_ons && booking.add_ons.length > 0 ? (
              <View style={s.addonsContainer}>
                <Text style={s.addonsHeader}>Included Add-ons:</Text>
                {booking.add_ons.map((item, idx) => (
                  <Text key={idx} style={[s.addonItem, { color: dark ? "#DDD" : "#444" }]}>
                    • {item.title} ({money(item.price)})
                  </Text>
                ))}
              </View>
            ) : null}
            {booking.special_notes ? (
              <Text style={s.notesText}>Notes: {booking.special_notes}</Text>
            ) : null}
          </View>

          {/* Finance Panel */}
          <View style={[s.financePanel, { backgroundColor: dark ? "#0E1524" : "#FFF7FA", borderColor: dark ? "#303B52" : "#F7CDDC" }]}>
            <View style={s.financeTotalRow}>
              <View style={s.financeTotalLeft}>
                <ReceiptText size={18} color={PINK} />
                <Text style={s.financeTotalLabel}>FINAL BOOKING AMOUNT</Text>
              </View>
              <Text style={[s.financeTotalAmount, { color: dark ? "#FFF" : INK }]}>
                {money(booking.total_amount)}
              </Text>
            </View>

            <View style={[s.financeDivider, { backgroundColor: dark ? "#242E42" : "#F2D8E3" }]} />

            <View style={s.financeSplitRow}>
              {/* 30% Advance Paid */}
              <View style={[s.financeTile, s.tilePaid]}>
                <View style={s.financeIconPaid}>
                  <Check size={16} color="#FFFFFF" strokeWidth={3} />
                </View>
                <View style={s.flex}>
                  <Text style={s.tileLabelPaid}>PAID (30% ADVANCE)</Text>
                  <Text style={s.tileAmountPaid}>{money(booking.advance_amount)}</Text>
                </View>
              </View>

              {/* 70% Due at Event */}
              <View style={[s.financeTile, s.tileDue]}>
                <View style={s.financeIconDue}>
                  <Coins size={16} color={GOLD} strokeWidth={2.4} />
                </View>
                <View style={s.flex}>
                  <Text style={s.tileLabelDue}>DUE AT EVENT (70%)</Text>
                  <Text style={s.tileAmountDue}>{money(booking.due_amount)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Contact & Support Strip */}
          <View style={s.supportStrip}>
            <Text style={s.supportHeading}>NEED ASSISTANCE?</Text>
            <View style={s.supportButtonsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Call Vendor"
                onPress={() => void Linking.openURL(`tel:${vendorPhone}`)}
                style={[s.supportBtn, { backgroundColor: dark ? "#1E273A" : "#F5E6EC" }]}
              >
                <Phone size={16} color={PINK} />
                <Text style={[s.supportBtnText, { color: dark ? "#FFF" : INK }]}>Call Vendor</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="WhatsApp Vendor"
                onPress={() => void Linking.openURL(`https://api.whatsapp.com/send?phone=${vendorPhone}&text=Hi,%20regarding%20RoyalLagn%20ticket%20#${booking.ticket_id}`)}
                style={[s.supportBtn, { backgroundColor: "#DCFCE7" }]}
              >
                <MessageCircle size={16} color="#15803D" />
                <Text style={[s.supportBtnText, { color: "#15803D" }]}>WhatsApp</Text>
              </Pressable>
            </View>
          </View>

          {/* Share on WhatsApp Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share E-Ticket on WhatsApp"
            onPress={shareWhatsApp}
            style={s.shareTicketBtn}
          >
            <Share2 size={18} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={s.shareTicketBtnText}>Share E-Ticket on WhatsApp</Text>
          </Pressable>

          {/* Verified Guarantee */}
          <View style={s.securityBadgeRow}>
            <ShieldCheck size={16} color={GREEN} />
            <Text style={s.securityBadgeText}>
              Verified RoyalLagn Booking · 30% Advance Secured
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60, alignItems: "center" },
  scrollContentDesktop: { paddingVertical: 32 },
  flex: { flex: 1, minWidth: 0 },

  stateBox: { minHeight: 340, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  stateTitle: { fontSize: typeScale.sectionTitle, fontWeight: "800" },
  stateText: { fontSize: typeScale.metadata, textAlign: "center" },
  actionBtn: { backgroundColor: PINK, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  actionBtnText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },

  ticketWrap: { width: "100%", maxWidth: 540, borderRadius: 24, overflow: "hidden", elevation: 6, shadowColor: "#3C1020", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.16, shadowRadius: 20 },
  ticketWrapDesktop: { maxWidth: 620 },

  hero: { width: "100%", height: 260, position: "relative", justifyContent: "space-between", padding: 18 },
  heroCompact: { height: 240 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusConfirmed: { backgroundColor: GREEN },
  statusPending: { backgroundColor: GOLD },
  statusCancelled: { backgroundColor: "#DC2626" },
  cancelledAlertBox: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 14, padding: 14, marginBottom: 14, gap: 4 },
  cancelledAlertTitle: { color: "#991B1B", fontSize: 13, fontWeight: "800" },
  cancelledAlertReason: { color: "#7F1D1D", fontSize: 12 },
  refundNoticeBox: { backgroundColor: "#FEE2E2", padding: 8, borderRadius: 8, marginTop: 4 },
  refundNoticeText: { color: "#991B1B", fontSize: 11, fontWeight: "700", lineHeight: 16 },
  pendingAlertBox: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FCD34D", borderRadius: 14, padding: 14, marginBottom: 14, gap: 4 },
  pendingAlertTitle: { color: "#92400E", fontSize: 13, fontWeight: "800" },
  pendingAlertText: { color: "#78350F", fontSize: 11, lineHeight: 16 },

  statusText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },

  heroBottom: { gap: 4 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.6)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  heroTitleCompact: { fontSize: 20 },
  heroBrand: { color: "#FCE7EE", fontSize: 10, fontWeight: "700", letterSpacing: 1.1 },
  ticketPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: GOLD, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: "flex-start", marginTop: 6 },
  ticketPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },

  paper: { width: "100%" },
  paperInner: { padding: 20, gap: 16 },

  twoCols: { flexDirection: "row", alignItems: "center" },
  twoColsCompact: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  colCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  colIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFF0F5", alignItems: "center", justifyContent: "center" },
  cellLabel: { fontSize: 10, fontWeight: "800", color: MUTED, letterSpacing: 0.6 },
  cellValue: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  vDivider: { width: 1, height: 38, backgroundColor: "#EAD9E0", marginHorizontal: 12 },
  vDividerCompact: { display: "none" },

  tearLine: { flexDirection: "row", alignItems: "center", position: "relative", height: 20, marginVertical: -2 },
  notchLeft: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FDF4F7", marginLeft: -29 },
  notchRight: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FDF4F7", marginRight: -29 },
  dashedBar: { flex: 1, borderBottomWidth: 1.5, borderStyle: "dashed" },

  packageSection: { gap: 6 },
  packageHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  packageHeaderTitle: { fontSize: 11, fontWeight: "800", color: PINK, letterSpacing: 0.6 },
  packageTitle: { fontSize: 17, fontWeight: "800" },
  addonsContainer: { marginTop: 4, gap: 2 },
  addonsHeader: { fontSize: 11, fontWeight: "700", color: MUTED },
  addonItem: { fontSize: 12 },
  notesText: { fontSize: 11, fontStyle: "italic", marginTop: 4, color: MUTED },

  financePanel: { padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 10 },
  financeTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  financeTotalLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  financeTotalLabel: { fontSize: 11, fontWeight: "800", color: PINK, letterSpacing: 0.6 },
  financeTotalAmount: { fontSize: 19, fontWeight: "900" },
  financeDivider: { height: 1, width: "100%" },

  financeSplitRow: { flexDirection: "row", gap: 10 },
  financeTile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12 },
  tilePaid: { backgroundColor: "#DCFCE7" },
  financeIconPaid: { width: 28, height: 28, borderRadius: 8, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  tileLabelPaid: { fontSize: 9, fontWeight: "800", color: "#15803D" },
  tileAmountPaid: { fontSize: 15, fontWeight: "900", color: "#15803D", marginTop: 2 },

  tileDue: { backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA" },
  financeIconDue: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#FFEDD5", alignItems: "center", justifyContent: "center" },
  tileLabelDue: { fontSize: 9, fontWeight: "800", color: "#9A3412" },
  tileAmountDue: { fontSize: 15, fontWeight: "900", color: "#C2410C", marginTop: 2 },

  supportStrip: { alignItems: "center", gap: 8, marginTop: 4 },
  supportHeading: { fontSize: 10, fontWeight: "800", color: MUTED, letterSpacing: 0.8 },
  supportButtonsRow: { flexDirection: "row", gap: 10, width: "100%" },
  supportBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, borderRadius: 12 },
  supportBtnText: { fontSize: 12, fontWeight: "700" },

  shareTicketBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: PINK, minHeight: 50, borderRadius: 16, shadowColor: PINK, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4 },
  shareTicketBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  securityBadgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  securityBadgeText: { fontSize: 11, color: MUTED, fontWeight: "600" },
});
