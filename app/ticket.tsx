import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Crown,
  Hash,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  PackageCheck,
  Phone,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale } from "@/constants/typography";
import {
  VendorBookingService,
  getRefundStatusInfo,
  type VendorBooking,
} from "@/services/vendorBookings";
import { exportAndShareTicketPdf } from "@/services/ticketPdfExport";
import TicketPdfFallbackModal from "@/components/booking/TicketPdfFallbackModal";

const FLOWER_ORNAMENT = require("../assets/images/optimized/flowersvg.webp");
const VENDOR_FALLBACK = require("../assets/images/optimized/vendor-placeholder.webp");
const PINK = brandPalette.light.primary;
const SERIF_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  web: "Georgia, 'Times New Roman', serif",
  default: "serif",
});

const money = (value?: string | number | null) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;

const formatEventDate = (dateStr?: string) => {
  if (!dateStr) return "—";
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
      const day = d.getDate();
      const month = d.toLocaleDateString("en-US", { month: "short" });
      const year = d.getFullYear();
      return `${weekday}, ${day} ${month}, ${year}`;
    }
  } catch {}
  return dateStr;
};

export default function RoyalLagnTicketScreen() {
  const params = useLocalSearchParams<{ booking_id?: string; ticket_id?: string }>();
  const ticketRef = typeof params.ticket_id === "string" ? params.ticket_id.trim() : "";
  const bookingRef = typeof params.booking_id === "string" ? params.booking_id.trim() : "";
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const desktop = width >= 760;

  const [booking, setBooking] = useState<VendorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadTicket = useCallback(async (isPull = false) => {
    if (!ticketRef && !bookingRef) {
      setError("Booking or Ticket reference is missing.");
      setLoading(false);
      return;
    }
    if (isPull) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const data = await VendorBookingService.getBookingByIdOrTicket(ticketRef, bookingRef);
      if (!data) {
        setError("Ticket not found. Please check your reference code.");
      } else {
        setBooking(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to retrieve ticket.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticketRef, bookingRef]);

  useEffect(() => {
    void loadTicket(false);
  }, [loadTicket]);

  const handleRefresh = useCallback(() => {
    void loadTicket(true);
  }, [loadTicket]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: dark ? "#070B14" : "#FFF2F5" }]}>
      {/* Wedding Background Gradient */}
      <LinearGradient
        colors={
          dark
            ? ["#080C16", "#140D17", "#0A101D"]
            : ["#FFF2F5", "#FDE8EE", "#FCEFE6", "#FFF5F7"]
        }
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Wedding Floral Watermark Accents */}
      <Image
        source={FLOWER_ORNAMENT}
        resizeMode="contain"
        style={[s.bgFloralTopRight, { opacity: dark ? 0.04 : 0.12 }]}
      />
      <Image
        source={FLOWER_ORNAMENT}
        resizeMode="contain"
        style={[s.bgFloralBottomLeft, { opacity: dark ? 0.04 : 0.12 }]}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, desktop && s.scrollContentDesktop]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[PINK]}
            tintColor={PINK}
          />
        }
      >
        {loading && !refreshing ? (
          <View style={s.stateBox}>
            <ActivityIndicator color={PINK} size="large" />
            <Text style={[s.stateText, { color: dark ? "#AAA" : "#666" }]}>
              Retrieving RoyalLagn E-Ticket…
            </Text>
          </View>
        ) : error || !booking ? (
          <View style={s.stateBox}>
            <ReceiptText size={42} color={PINK} />
            <Text style={[s.stateTitle, { color: dark ? "#FFF" : "#1F2937" }]}>Ticket Unavailable</Text>
            <Text style={[s.stateText, { color: dark ? "#AAA" : "#6B7280" }]}>{error}</Text>
            <Pressable onPress={() => router.replace("/(tabs)/bookings")} style={s.actionBtn}>
              <Text style={s.actionBtnText}>Go to My Bookings</Text>
            </Pressable>
          </View>
        ) : (
          <ConfirmedRoyalTicket
            booking={booking}
            desktop={desktop}
            dark={dark}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConfirmedRoyalTicket({
  booking,
  desktop,
  dark,
  onRefresh,
  refreshing,
}: {
  booking: VendorBooking;
  desktop: boolean;
  dark: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const isAccepted =
    booking.booking_status === "ACCEPTED" ||
    booking.booking_status === "confirmed" ||
    booking.booking_status === "accepted";

  const isPaymentVerified = [
    "paid_advance",
    "paid_booking_fee",
    "free_zero_fee",
    "paid",
  ].includes(booking.payment_status);

  const isCancelledOrRejected =
    booking.booking_status === "cancelled" ||
    booking.booking_status === "cancelled_by_vendor" ||
    booking.booking_status === "cancelled_by_customer" ||
    booking.booking_status === "CUSTOMER_CANCELLED" ||
    booking.booking_status === "ADMIN_CANCELLED" ||
    booking.booking_status === "VENDOR_REJECTED" ||
    booking.booking_status === "vendor_rejected";

  const contactsUnlocked = isAccepted && isPaymentVerified && !isCancelledOrRejected;
  const refundInfo = getRefundStatusInfo(booking.refund_status);

  const ticketCardRef = useRef<View>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [fallbackModal, setFallbackModal] = useState<{ visible: boolean; fileName: string }>({
    visible: false,
    fileName: "",
  });
  const [shareError, setShareError] = useState<string | null>(null);

  const heroImage = booking.vendor_image
    ? { uri: booking.vendor_image }
    : VENDOR_FALLBACK;

  const servicesList = useMemo(() => {
    if (booking.add_ons && booking.add_ons.length > 0) {
      const addOnTotal = booking.add_ons.reduce(
        (sum, a) => sum + (Number(a.price) || 0),
        0
      );
      const basePrice = Math.max(0, (Number(booking.total_amount) || 0) - addOnTotal);
      return [
        {
          title: booking.package_title || "Wedding Package",
          price: basePrice > 0 ? basePrice : (Number(booking.total_amount) || 0),
        },
        ...booking.add_ons.map((a) => ({
          title: a.title,
          price: Number(a.price) || 0,
        })),
      ];
    }
    return [
      {
        title: booking.package_title || "Wedding Shoot",
        price: Number(booking.total_amount) || 0,
      },
    ];
  }, [booking]);

  const handleSharePdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setShareError(null);
    await new Promise((r) => setTimeout(r, 80));
    try {
      const result = await exportAndShareTicketPdf(ticketCardRef, booking);
      if (result.success) {
        if (result.method === "download-fallback") {
          setFallbackModal({
            visible: true,
            fileName: result.fileName,
          });
        }
      } else if ("error" in result && result.error) {
        setShareError(result.error);
      }
    } catch (err: any) {
      console.warn("Could not export ticket PDF", err);
      setShareError(err?.message || "Unable to generate ticket PDF. Please try again.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <View style={[s.ticketWrap, desktop && s.ticketWrapDesktop]}>
      {/* 3D Physical Ticket Pass Card */}
      <View ref={ticketCardRef} collapsable={false} style={[s.passBezel, dark && s.passBezelDark]}>
        {/* === TICKET PASS SECTION 1: HERO HEADER === */}
        <View style={s.passHero}>
          <Image source={heroImage} resizeMode="cover" style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={["rgba(15,8,12,0.72)", "rgba(15,8,12,0.35)", "rgba(15,8,12,0.94)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Hero Top Bar */}
          <View style={s.heroTopBar}>
            {!isExportingPdf ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to bookings"
                  onPress={() => {
                    if (router.canGoBack()) router.back();
                    else router.replace("/(tabs)/bookings");
                  }}
                  style={s.heroBack}
                >
                  <ArrowLeft size={16} color="#FFFFFF" strokeWidth={2.5} />
                </Pressable>
                {onRefresh ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Refresh ticket status"
                    onPress={onRefresh}
                    disabled={refreshing}
                    style={s.heroBack}
                  >
                    <RefreshCw size={13} color="#FFFFFF" strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={{ width: 28 }} />
            )}

            {/* Status Badge Pill */}
            <View
              style={[
                s.statusBadge,
                contactsUnlocked
                  ? s.statusConfirmed
                  : isCancelledOrRejected
                  ? s.statusCancelled
                  : s.statusPending,
              ]}
            >
              {isCancelledOrRejected ? (
                <ShieldAlert size={11} color="#B91C1C" strokeWidth={2.4} />
              ) : (
                <ShieldCheck
                  size={11}
                  color={contactsUnlocked ? "#15803D" : "#B45309"}
                  strokeWidth={2.4}
                />
              )}
              <Text
                style={[
                  s.statusText,
                  contactsUnlocked
                    ? s.statusTextConfirmed
                    : isCancelledOrRejected
                    ? s.statusTextCancelled
                    : s.statusTextPending,
                ]}
              >
                {contactsUnlocked
                  ? "LUXURY E-TICKET CONFIRMED"
                  : isCancelledOrRejected
                  ? "BOOKING DECLINED"
                  : "PENDING VENDOR CONFIRMATION"}
              </Text>
            </View>
          </View>

          {/* Hero Bottom Info */}
          <View style={s.heroBottom}>
            <Text style={s.heroTitle}>
              {booking.vendor_name || "Wedding Vendor"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Crown size={11} color="#FDE047" strokeWidth={2.4} />
              <Text style={s.heroSubtitle}>ROYALLAGN LUXURY WEDDING MARKETPLACE</Text>
            </View>

            <View style={s.ticketPill}>
              <Hash size={11} color="#F59E0B" strokeWidth={2.8} />
              <Text style={s.ticketPillText}>
                TICKET ID: {booking.ticket_id}
              </Text>
            </View>
          </View>
        </View>

        {/* === PHYSICAL PERFORATED NOTCH 1 === */}
        <View style={[s.notchRow, { backgroundColor: dark ? "#131A28" : "#FFFDFE" }]}>
          <View style={[s.notchCircle, s.notchLeft]} />
          <View style={[s.perforatedLine, { borderColor: dark ? "#2B3A52" : "#F4D2DE" }]} />
          <View style={[s.notchCircle, s.notchRight]} />
        </View>

        {/* === TICKET PASS SECTION 2: BODY (SILK IVORY) === */}
        <View style={[s.passBody, { backgroundColor: dark ? "#131A28" : "#FFFDFE" }]}>
          {/* Subtle Floral Watermark */}
          <Image
            source={FLOWER_ORNAMENT}
            resizeMode="contain"
            style={[s.bodyWatermark, { opacity: dark ? 0.04 : 0.08 }]}
          />

          {/* Status Alert Banner */}
          <View
            style={[
              s.alertBanner,
              contactsUnlocked
                ? s.alertBannerConfirmed
                : isCancelledOrRejected
                ? s.alertBannerCancelled
                : s.alertBannerPending,
            ]}
          >
            <View style={s.alertRow}>
              <View
                style={[
                  s.alertIconCircle,
                  contactsUnlocked
                    ? s.alertIconCircleConfirmed
                    : isCancelledOrRejected
                    ? s.alertIconCircleCancelled
                    : s.alertIconCirclePending,
                ]}
              >
                {isCancelledOrRejected ? (
                  <ShieldAlert size={13} color="#B91C1C" strokeWidth={2.4} />
                ) : (
                  <ShieldCheck
                    size={13}
                    color={contactsUnlocked ? "#15803D" : "#B45309"}
                    strokeWidth={2.4}
                  />
                )}
              </View>
              <View style={s.alertTextWrap}>
                <Text
                  style={[
                    s.alertTitle,
                    contactsUnlocked
                      ? s.alertTitleConfirmed
                      : isCancelledOrRejected
                      ? s.alertTitleCancelled
                      : s.alertTitlePending,
                  ]}
                >
                  {contactsUnlocked
                    ? "Booking Confirmed by Vendor"
                    : isCancelledOrRejected
                    ? "Booking Declined by Vendor"
                    : "Pending Vendor Confirmation"}
                </Text>
                <Text style={[s.alertBody, { color: dark ? "#D1D5DB" : "#4B5563" }]}>
                  {contactsUnlocked
                    ? "Your booking has been confirmed. Contact your vendor directly to coordinate service details and the remaining payment."
                    : isCancelledOrRejected
                    ? `Reason: ${booking.rejection_reason || "Declined by vendor"}\n${
                        refundInfo.status === "completed"
                          ? `Status: ${refundInfo.label} · Full 100% refund of ${money(booking.refund_amount ?? booking.booking_fee_amount ?? booking.advance_amount)} has been completed.`
                          : refundInfo.status === "processing"
                          ? `Status: ${refundInfo.label} · Our team is processing your booking fee refund.`
                          : refundInfo.status === "failed"
                          ? `Status: ${refundInfo.label} · Please contact RoyalLagn support for ticket #${booking.ticket_id}.`
                          : `Status: ${refundInfo.label} · If the vendor rejects your booking, you are eligible for a full refund of your RoyalLagn booking fee. Our team will process your refund, and you can track its status in My Bookings.`
                      }`
                    : "Your booking fee payment was successful. Your booking is awaiting vendor confirmation. Vendor contact details will be available here once the vendor accepts your booking."}
                </Text>
              </View>
            </View>
          </View>

          {/* Booking Details (3-Columns) */}
          <View style={[s.detailsCard, { backgroundColor: dark ? "#192234" : "#FFF7FA", borderColor: dark ? "#2B3B54" : "#FCE2EC" }]}>
            <View style={s.sectionHeader}>
              <ClipboardList size={12} color="#E11D48" strokeWidth={2.4} />
              <Text style={s.sectionHeaderText}>BOOKING DETAILS</Text>
            </View>

            <View style={s.bookingDetailsRow}>
              {/* Client Name */}
              <View style={s.detailCol}>
                <View style={s.detailIconCircle}>
                  <UserRound size={12} color="#E11D48" strokeWidth={2.2} />
                </View>
                <Text style={s.detailLabel}>CLIENT NAME</Text>
                <Text
                  style={[s.detailValue, { color: dark ? "#F9FAFB" : "#111827" }]}
                >
                  {booking.customer_name}
                </Text>
              </View>

              <View style={[s.detailDivider, { backgroundColor: dark ? "#2A364E" : "#F8D4E2" }]} />

              {/* Event Date */}
              <View style={s.detailCol}>
                <View style={s.detailIconCircle}>
                  <CalendarDays size={12} color="#E11D48" strokeWidth={2.2} />
                </View>
                <Text style={s.detailLabel}>EVENT DATE</Text>
                <Text
                  style={[s.detailValue, { color: dark ? "#F9FAFB" : "#111827" }]}
                >
                  {formatEventDate(booking.event_date)}
                </Text>
              </View>

              <View style={[s.detailDivider, { backgroundColor: dark ? "#2A364E" : "#F8D4E2" }]} />

              {/* Occasion */}
              <View style={s.detailCol}>
                <View style={s.detailIconCircle}>
                  <Sparkles size={12} color="#E11D48" strokeWidth={2.2} />
                </View>
                <Text style={s.detailLabel}>OCCASION</Text>
                <Text
                  style={[s.detailValue, { color: dark ? "#F9FAFB" : "#111827" }]}
                >
                  {booking.event_type || "Wedding Ceremony"}
                </Text>
              </View>
            </View>
          </View>

          {/* Package & Services Booked */}
          <View style={[s.detailsCard, { backgroundColor: dark ? "#192234" : "#FFF7FA", borderColor: dark ? "#2B3B54" : "#FCE2EC" }]}>
            <View style={s.sectionHeader}>
              <PackageCheck size={12} color="#E11D48" strokeWidth={2.4} />
              <Text style={s.sectionHeaderText}>PACKAGE & SERVICES BOOKED</Text>
            </View>

            <View style={s.packageRow}>
              <Text style={[s.packageLabel, { color: dark ? "#9CA3AF" : "#6B7280" }]}>
                Package:
              </Text>
              <Text style={[s.packageValue, { color: dark ? "#F9FAFB" : "#111827" }]}>
                {booking.package_title || "Wedding Shoot"}
              </Text>
            </View>

            <Text style={s.servicesIncludedTitle}>Services Included:</Text>

            <View style={s.servicesList}>
              {servicesList.map((item, idx) => (
                <View
                  key={idx}
                  style={[
                    s.serviceItemRow,
                    idx < servicesList.length - 1 && [
                      s.serviceItemBorder,
                      { borderBottomColor: dark ? "#2B3B54" : "#FCE2EC" },
                    ],
                  ]}
                >
                  <View style={s.serviceItemLeft}>
                    <View style={s.checkCircleBadge}>
                      <Check size={8} color="#FFFFFF" strokeWidth={3} />
                    </View>
                    <Text
                      style={[
                        s.serviceItemName,
                        { color: dark ? "#E5E7EB" : "#1F2937" },
                      ]}
                    >
                      {item.title}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.serviceItemPrice,
                      { color: dark ? "#F9FAFB" : "#111827" },
                    ]}
                  >
                    {money(item.price)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Vendor Contact Details Section */}
          <View style={[s.detailsCard, { backgroundColor: dark ? "#192234" : "#FFF7FA", borderColor: dark ? "#2B3B54" : "#FCE2EC", marginTop: 12 }]}>
            <View style={s.sectionHeader}>
              {contactsUnlocked ? (
                <Phone size={12} color="#E11D48" strokeWidth={2.4} />
              ) : (
                <Lock size={12} color="#D97706" strokeWidth={2.4} />
              )}
              <Text style={s.sectionHeaderText}>VENDOR CONTACT DETAILS</Text>
            </View>

            {contactsUnlocked ? (
              <View style={s.unlockedContactWrap}>
                <View style={s.contactInfoRow}>
                  <Text style={[s.contactVendorName, { color: dark ? "#F9FAFB" : "#111827" }]}>
                    {booking.vendor_name || "Wedding Vendor"}
                  </Text>
                  {booking.vendor_phone ? (
                    <Text style={[s.contactVendorPhone, { color: dark ? "#E5E7EB" : "#374151" }]}>
                      {booking.vendor_phone}
                    </Text>
                  ) : null}
                  {booking.vendor_city ? (
                    <View style={s.contactCityRow}>
                      <MapPin size={11} color={dark ? "#9CA3AF" : "#6B7280"} />
                      <Text style={[s.contactCityText, { color: dark ? "#9CA3AF" : "#6B7280" }]}>
                        {booking.vendor_city}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Direct Action Buttons: Call & WhatsApp */}
                <View style={s.contactBtnRow}>
                  {booking.vendor_phone ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Call ${booking.vendor_name || "Vendor"}`}
                        onPress={() => void Linking.openURL(`tel:${booking.vendor_phone}`)}
                        style={[s.contactActionBtn, s.contactCallBtn]}
                      >
                        <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={s.contactCallBtnText}>Call Vendor</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`WhatsApp ${booking.vendor_name || "Vendor"}`}
                        onPress={() => {
                          const clean = (booking.vendor_phone || "").replace(/\D/g, "");
                          const phone = clean.startsWith("91") ? clean : `91${clean}`;
                          void Linking.openURL(
                            `https://api.whatsapp.com/send?phone=${phone}&text=Hi%20${encodeURIComponent(booking.vendor_name || "")},%20regarding%20my%20confirmed%20RoyalLagn%20booking%20#${booking.ticket_id}`
                          );
                        }}
                        style={[s.contactActionBtn, s.contactWhatsAppBtn]}
                      >
                        <MessageSquare size={13} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={s.contactWhatsAppBtnText}>WhatsApp Vendor</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={[s.lockedContactDesc, { color: dark ? "#9CA3AF" : "#6B7280" }]}>
                      Contact information is unlocked for this confirmed booking.
                    </Text>
                  )}
                </View>
              </View>
            ) : isCancelledOrRejected ? (
              <View style={[s.lockedContactBox, { backgroundColor: dark ? "#2E1A1A" : "#FEF2F2", borderColor: dark ? "#5C2626" : "#FECACA" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ShieldAlert size={14} color="#B91C1C" />
                    <Text style={[s.lockedContactTitle, { color: "#B91C1C" }]}>Booking Cancelled / Declined</Text>
                  </View>
                  <View style={{ backgroundColor: refundInfo.bgColor, borderColor: refundInfo.borderColor, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: refundInfo.textColor }}>● {refundInfo.label}</Text>
                  </View>
                </View>
                <Text style={[s.lockedContactDesc, { color: dark ? "#D1D5DB" : "#6B7280" }]}>
                  Vendor contact details are inaccessible for declined bookings. {
                    refundInfo.status === "completed"
                      ? "Your platform booking fee refund has been completed."
                      : "If the vendor rejects your booking, you are eligible for a full refund of your RoyalLagn booking fee. Our team will process your refund, and you can track its status in My Bookings."
                  }
                </Text>
              </View>
            ) : (
              <View style={[s.lockedContactBox, { backgroundColor: dark ? "#2E220C" : "#FFFBEB", borderColor: dark ? "#634915" : "#FDE68A" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Lock size={13} color="#B45309" strokeWidth={2.5} />
                  <Text style={[s.lockedContactTitle, { color: "#B45309" }]}>Locked — Awaiting Vendor Acceptance</Text>
                </View>
                <Text style={[s.lockedContactDesc, { color: dark ? "#D1D5DB" : "#78350F" }]}>
                  Vendor phone number, WhatsApp, and location will unlock here immediately once the vendor confirms your booking.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* === PHYSICAL PERFORATED NOTCH 2: RECEIPT STUB === */}
        <View style={[s.notchRow, { backgroundColor: dark ? "#131A28" : "#FFFDFE" }]}>
          <View style={[s.notchCircle, s.notchLeft]} />
          <View style={[s.perforatedLine, { borderColor: dark ? "#2B3A52" : "#F4D2DE" }]} />
          <View style={[s.notchCircle, s.notchRight]} />
        </View>

        {/* === TICKET PASS SECTION 3: FINANCIAL STUB & CTA === */}
        <View style={[s.passStub, { backgroundColor: dark ? "#101622" : "#FFF7FA" }]}>
          <View style={s.sectionHeader}>
            <ReceiptText size={12} color="#E11D48" strokeWidth={2.4} />
            <Text style={s.sectionHeaderText}>PAYMENT SUMMARY</Text>
          </View>

          {/* Final Booking Amount */}
          <View
            style={[
              s.finalAmountBanner,
              {
                backgroundColor: dark ? "#22141E" : "#FFF0F5",
                borderColor: dark ? "#482335" : "#FBCFE8",
              },
            ]}
          >
            <View style={s.finalAmountLeft}>
              <CreditCard size={12} color="#E11D48" strokeWidth={2.2} />
              <Text style={s.finalAmountLabel}>FINAL BOOKING AMOUNT</Text>
            </View>
            <Text style={s.finalAmountValue}>{money(booking.total_amount)}</Text>
          </View>

          {/* 2-Box Metric Split */}
          <View style={s.splitMetricRow}>
            {/* Paid */}
            <View
              style={[
                s.metricBox,
                {
                  backgroundColor: dark ? "#0C281E" : "#F0FDF4",
                  borderColor: dark ? "#155E42" : "#BBF7D0",
                },
              ]}
            >
              <View style={s.metricHeader}>
                <View style={[s.metricBadge, { backgroundColor: "#059669" }]}>
                  <Check size={8} color="#FFFFFF" strokeWidth={3} />
                </View>
                <Text style={[s.metricLabel, { color: "#059669" }]}>
                  BOOKING FEE
                </Text>
              </View>
              <Text style={[s.metricValue, { color: "#059669" }]}>
                {(booking.booking_fee_amount ?? booking.advance_amount ?? 0) === 0 ? "₹0 (Free)" : money(booking.booking_fee_amount ?? booking.advance_amount)}
              </Text>
            </View>

            {/* Due */}
            <View
              style={[
                s.metricBox,
                {
                  backgroundColor: dark ? "#2E220C" : "#FFFBEB",
                  borderColor: dark ? "#634915" : "#FDE68A",
                },
              ]}
            >
              <View style={s.metricHeader}>
                <View style={[s.metricBadge, { backgroundColor: "#F59E0B" }]}>
                  <Clock3 size={8} color="#FFFFFF" strokeWidth={2.6} />
                </View>
                <Text style={[s.metricLabel, { color: "#B45309" }]}>
                  DIRECT TO VENDOR
                </Text>
              </View>
              <Text style={[s.metricValue, { color: "#B45309" }]}>
                {money(booking.due_amount)}
              </Text>
            </View>
          </View>

          {/* Trust Seal */}
          <View style={s.trustFooter}>
            <View style={s.trustHeaderRow}>
              <ShieldCheck size={13} color="#059669" strokeWidth={2.4} />
              <Text style={[s.trustTitle, { color: dark ? "#F3F4F6" : "#1F2937" }]}>
                Verified RoyalLagn Booking · Contact Details Protected
              </Text>
            </View>
            <Text style={[s.trustMuted, { color: dark ? "#6B7280" : "#9CA3AF" }]}>
              A safe and trusted wedding marketplace experience.
            </Text>
          </View>
        </View>
      </View>

      {/* Share Action Button (Outside Ticket Pass - Never Captured in PDF) */}
      <View style={s.cardActionsWrap}>
        {shareError ? (
          <View style={s.errorBanner}>
            <Text style={s.errorBannerText}>{shareError}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forward E-Ticket on WhatsApp in PDF format"
          onPress={handleSharePdf}
          disabled={isExportingPdf}
          style={[s.shareWhatsAppBtn, isExportingPdf && { opacity: 0.8 }]}
        >
          <View style={s.shareWhatsAppContent}>
            {isExportingPdf ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MessageCircle size={16} color="#FFFFFF" strokeWidth={2.4} />
            )}
            <Text style={s.shareWhatsAppText}>
              {isExportingPdf ? "Generating PDF & Opening WhatsApp…" : "Forward Ticket on WhatsApp (PDF)"}
            </Text>
          </View>
          <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.4} />
        </Pressable>
      </View>

      {/* Desktop Web Fallback Guidance Modal */}
      <TicketPdfFallbackModal
        visible={fallbackModal.visible}
        fileName={fallbackModal.fileName}
        ticketId={booking?.ticket_id}
        onClose={() => setFallbackModal({ visible: false, fileName: "" })}
        dark={dark}
      />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  bgFloralTopRight: {
    position: "absolute",
    top: -15,
    right: -25,
    width: 170,
    height: 170,
    transform: [{ rotate: "15deg" }],
  },
  bgFloralBottomLeft: {
    position: "absolute",
    bottom: 30,
    left: -25,
    width: 160,
    height: 160,
    transform: [{ rotate: "195deg" }],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  scrollContentDesktop: { paddingVertical: 28 },

  stateBox: {
    minHeight: 340,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
  },
  stateTitle: { fontSize: typeScale.sectionTitle, fontWeight: "800" },
  stateText: { fontSize: typeScale.metadata, textAlign: "center" },
  actionBtn: {
    backgroundColor: PINK,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  actionBtnText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },

  ticketWrap: {
    width: "100%",
    maxWidth: 395,
  },
  ticketWrapDesktop: {
    maxWidth: 430,
  },

  /* 3D Physical Pass Bezel */
  passBezel: {
    borderRadius: 22,
    backgroundColor: "#FFFDFE",
    borderWidth: 1.5,
    borderColor: "rgba(245, 158, 11, 0.55)",
    overflow: "hidden",
    elevation: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.42,
    shadowRadius: 26,
  },
  passBezelDark: {
    backgroundColor: "#131A28",
    borderColor: "rgba(245, 158, 11, 0.45)",
    shadowColor: "#000000",
  },

  /* Hero Section */
  passHero: {
    width: "100%",
    height: 220,
    position: "relative",
    justifyContent: "space-between",
    padding: 14,
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroBack: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderWidth: 1,
    borderColor: "rgba(253, 224, 71, 0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  brandPillText: {
    color: "#FDE047",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusConfirmed: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  statusCancelled: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
  },
  statusText: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statusTextConfirmed: {
    color: "#15803D",
  },
  statusTextPending: {
    color: "#B45309",
  },
  statusTextCancelled: {
    color: "#B91C1C",
  },

  heroBottom: {
    gap: 1.5,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    lineHeight: 28,
    paddingBottom: 4,
    fontWeight: "800",
    fontFamily: SERIF_FONT,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    color: "#FCE7EE",
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 1,
  },
  ticketPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
    backgroundColor: "#161118",
    borderWidth: 1.2,
    borderColor: "#F59E0B",
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  ticketPillText: {
    color: "#FEF3C7",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  /* Physical Notches */
  notchRow: {
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    marginVertical: -1,
    overflow: "hidden",
  },
  notchCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFF2F5",
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  notchLeft: {
    left: -11,
  },
  notchRight: {
    right: -11,
  },
  perforatedLine: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderStyle: "dashed",
    marginHorizontal: 16,
  },

  /* Pass Body */
  passBody: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 7,
    position: "relative",
  },
  bodyWatermark: {
    position: "absolute",
    right: -20,
    bottom: -20,
    width: 130,
    height: 130,
    transform: [{ rotate: "15deg" }],
  },

  /* Status Alert */
  alertBanner: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  alertBannerPending: {
    backgroundColor: "#FFFDF7",
    borderColor: "#FDE68A",
  },
  alertBannerConfirmed: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  alertBannerCancelled: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  alertIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  alertIconCirclePending: {
    backgroundColor: "#FEF3C7",
  },
  alertIconCircleConfirmed: {
    backgroundColor: "#DCFCE7",
  },
  alertIconCircleCancelled: {
    backgroundColor: "#FEE2E2",
  },
  alertTextWrap: {
    flex: 1,
    gap: 1,
  },
  alertTitle: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: SERIF_FONT,
  },
  alertTitlePending: {
    color: "#78350F",
  },
  alertTitleConfirmed: {
    color: "#14532D",
  },
  alertTitleCancelled: {
    color: "#991B1B",
  },
  alertBody: {
    fontSize: 9.5,
    lineHeight: 13,
  },

  /* Base Details Card inside Ticket */
  detailsCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 5,
  },
  sectionHeaderText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#E11D48",
    letterSpacing: 0.6,
  },

  /* Booking Details Row */
  bookingDetailsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  detailCol: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  detailIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  detailLabel: {
    fontSize: 7.5,
    fontWeight: "700",
    color: "#9CA3AF",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  detailValue: {
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 15,
    paddingBottom: 2,
  },
  detailDivider: {
    width: 1,
    height: 38,
    marginTop: 8,
  },

  /* Package Row */
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 3,
  },
  packageLabel: {
    fontSize: 10.5,
    fontWeight: "500",
  },
  packageValue: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  servicesIncludedTitle: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#E11D48",
    marginBottom: 3,
  },
  servicesList: {
    gap: 1,
  },
  serviceItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2.5,
  },
  serviceItemBorder: {
    borderBottomWidth: 1,
  },
  serviceItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    marginRight: 6,
  },
  checkCircleBadge: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#E11D48",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceItemName: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  serviceItemPrice: {
    fontSize: 11,
    fontWeight: "800",
  },

  /* Financial Stub */
  passStub: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  finalAmountBanner: {
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  finalAmountLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  finalAmountLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#E11D48",
    letterSpacing: 0.4,
  },
  finalAmountValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#E11D48",
  },
  splitMetricRow: {
    flexDirection: "row",
    gap: 7,
  },
  metricBox: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
  },
  metricBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 7.5,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  metricValue: {
    fontSize: 12.5,
    fontWeight: "900",
    marginTop: 2,
  },

  cardActionsWrap: {
    width: "100%",
    marginTop: 10,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorBannerText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  /* WhatsApp CTA */
  shareWhatsAppBtn: {
    width: "100%",
    height: 36,
    backgroundColor: "#059669",
    borderRadius: 11,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
    elevation: 2,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  shareWhatsAppContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shareWhatsAppText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "800",
  },

  /* Trust Seal */
  trustFooter: {
    alignItems: "center",
    gap: 1.5,
    paddingVertical: 2,
  },
  trustHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trustTitle: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  trustMuted: {
    fontSize: 8.5,
    textAlign: "center",
  },

  /* Unlocked & Locked Contact Section */
  unlockedContactWrap: {
    paddingVertical: 2,
  },
  contactInfoRow: {
    marginBottom: 8,
  },
  contactVendorName: {
    fontSize: 13.5,
    fontWeight: "800",
  },
  contactVendorPhone: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  contactCityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  contactCityText: {
    fontSize: 11,
    fontWeight: "500",
  },
  contactBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  contactActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    elevation: 2,
  },
  contactCallBtn: {
    backgroundColor: "#10B981",
  },
  contactCallBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  contactWhatsAppBtn: {
    backgroundColor: "#25D366",
  },
  contactWhatsAppBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  lockedContactBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  lockedContactTitle: {
    fontSize: 11.5,
    fontWeight: "800",
  },
  lockedContactDesc: {
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 2,
  },
});
