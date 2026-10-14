import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  Clock3,
  Gift,
  Lock,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  User,
  X,
  MapPin,
  Phone,
  MessageSquare,
  FileText,
  CheckSquare,
  Square,
  Info,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import BookingCalendarModal from "@/components/booking/BookingCalendarModal";
import Pressable from "@/components/InteropSafePressable";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { brandPalette } from "@/constants/brandPalette";
import { supabase } from "@/services/supabase";
import { openRazorpayCheckout } from "@/subscriptions/payments/RazorpayCheckout";
import type { VendorPackage } from "@/services/vendorPackages";
import {
  calculateBookingFinancials,
  VendorBookingService,
  type BookingAddOn,
  type SelectedPackageSummary,
} from "@/services/vendorBookings";
import {
  STANDARD_TIME_SLOTS,
  buildEventStartTimestamp,
  calculateCancellationCutoff,
  formatCutoffDisplayIST,
  validateIndianPhone,
  validateGoogleMapsUrl,
  validateBookingDescription,
} from "@/lib/bookingCancellationPolicy";

const PINK = brandPalette.light.primary;

const EVENT_TYPES = [
  "Wedding Ceremony",
  "Reception",
  "Engagement",
  "Sangeet & Mehendi",
  "Pre-Wedding Shoot",
  "Anniversary",
  "Other Celebration",
];

const money = (val: number) => `₹${Number(val || 0).toLocaleString("en-IN")}`;

type Props = {
  visible: boolean;
  vendorId: string;
  vendorName: string;
  vendorPhone?: string | null;
  vendorImage?: string | null;
  vendorCategory?: string | null;
  selectedPackage?: VendorPackage;
  selectedPackages?: VendorPackage[];
  initialAddOns?: Record<string, BookingAddOn>;
  initialDate?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialTotalDays?: number;
  dark?: boolean;
  onClose: () => void;
};

export default function BookingCheckoutModal({
  visible,
  vendorId,
  vendorName,
  vendorPhone,
  vendorImage,
  vendorCategory,
  selectedPackage,
  selectedPackages,
  initialAddOns,
  initialDate,
  initialStartDate,
  initialEndDate,
  initialTotalDays = 1,
  dark = false,
  onClose,
}: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 760;
  const { session, profile } = usePublicAuth();
  const user = session?.user;

  // Normalized list of packages to book
  const packagesList = useMemo(() => {
    if (selectedPackages && selectedPackages.length > 0) return selectedPackages;
    if (selectedPackage) return [selectedPackage];
    return [];
  }, [selectedPackage, selectedPackages]);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [eventType, setEventType] = useState("Wedding Ceremony");
  
  // 5-Day Cancellation Lock & Booking Details State
  const [eventStartTime, setEventStartTime] = useState<string>("10:00");
  const [contactNumber, setContactNumber] = useState("");
  const [sameAsContact, setSameAsContact] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [serviceMapUrl, setServiceMapUrl] = useState("");
  const [bookingDescription, setBookingDescription] = useState("");
  
  const [startDate, setStartDate] = useState(() => {
    if (initialStartDate) return initialStartDate;
    if (initialDate) return initialDate;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 14);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [totalDays, setTotalDays] = useState(initialTotalDays);
  const [specialNotes, setSpecialNotes] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, BookingAddOn>>(initialAddOns || {});
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const endDate = useMemo(() => {
    if (initialEndDate) return initialEndDate;
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.max(0, totalDays - 1));
    return d.toISOString().slice(0, 10);
  }, [startDate, totalDays, initialEndDate]);

  const estimatedCutoff = useMemo(() => {
    try {
      const startIso = buildEventStartTimestamp(startDate, eventStartTime);
      const cutoffIso = calculateCancellationCutoff(startIso);
      return formatCutoffDisplayIST(cutoffIso);
    } catch {
      return "—";
    }
  }, [startDate, eventStartTime]);

  const palette = useMemo(() => ({
    background: dark ? "#0F1623" : "#FFFFFF",
    surface: dark ? "#182234" : "#FFF9FB",
    surfaceSoft: dark ? "#222D42" : "#FFF0F5",
    text: dark ? "#FAF5F8" : "#171015",
    muted: dark ? "#B0A5AB" : "#6E6368",
    border: dark ? "#2B3548" : "#F3DFE7",
    cardBorder: dark ? "#4A2937" : "#F8CDDB",
  }), [dark]);

  // Autofill user details if signed in
  useEffect(() => {
    if (user || profile) {
      const fullName = profile?.full_name || user?.user_metadata?.full_name;
      if (fullName && !customerName) setCustomerName(fullName);
      const email = profile?.email || user?.email;
      if (email && !customerEmail) setCustomerEmail(email);
      const phone = profile?.phone || user?.phone;
      if (phone) {
        if (!customerPhone) setCustomerPhone(phone);
        if (!contactNumber) setContactNumber(phone);
      }
    }
  }, [user, profile]);

  const [isReferralLocked, setIsReferralLocked] = useState(false);

  // Check persisted attribution first (source of truth), then stored referral code
  useEffect(() => {
    let isMounted = true;
    async function loadAttribution() {
      if (user?.id) {
        try {
          const { data: attr } = await supabase
            .from("referral_attributions")
            .select("referral_code")
            .eq("referred_customer_id", user.id)
            .maybeSingle();
          if (attr?.referral_code && isMounted) {
            setReferralCode(attr.referral_code);
            setIsReferralLocked(true);
            return;
          }
        } catch {
          // ignore
        }
      }

      try {
        const stored = await AsyncStorage.getItem("royallagn_referral_code");
        if (stored && isMounted && !referralCode) {
          setReferralCode(stored);
        }
      } catch {}
    }
    void loadAttribution();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Update initial addons if changed
  useEffect(() => {
    if (initialAddOns) setSelectedAddOns(initialAddOns);
  }, [initialAddOns]);

  const addOnsList = useMemo(() => Object.values(selectedAddOns), [selectedAddOns]);

  // Financial calculations with multi-day days multiplier
  const financials = useMemo(() => {
    const pkgPrices = packagesList.map((p) => ({
      price: Number(p.discounted_price ?? p.price ?? 0),
    }));
    return calculateBookingFinancials(pkgPrices, totalDays, addOnsList);
  }, [packagesList, totalDays, addOnsList]);

  const validateInputs = (): boolean => {
    setErrorMessage("");
    if (!customerName.trim()) {
      setErrorMessage("Please enter your name.");
      return false;
    }
    const phoneRes = validateIndianPhone(contactNumber || customerPhone);
    if (!phoneRes.valid) {
      setErrorMessage(phoneRes.error || "Please enter a valid 10-digit personal contact number.");
      return false;
    }
    const waTarget = sameAsContact ? (contactNumber || customerPhone) : whatsappNumber;
    const waRes = validateIndianPhone(waTarget);
    if (!waRes.valid) {
      setErrorMessage(waRes.error || "Please enter a valid 10-digit WhatsApp number.");
      return false;
    }
    const mapRes = validateGoogleMapsUrl(serviceMapUrl);
    if (!mapRes.valid) {
      setErrorMessage(mapRes.error || "Please provide a valid Google Maps venue link.");
      return false;
    }
    const descRes = validateBookingDescription(bookingDescription);
    if (!descRes.valid) {
      setErrorMessage(descRes.error || "Please provide a booking description (event arrangements & instructions).");
      return false;
    }
    if (!startDate) {
      setErrorMessage("Please specify the event date.");
      return false;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (startDate <= todayStr) {
      setErrorMessage("Event date must be in the future.");
      return false;
    }
    const cleanRef = referralCode.trim().toUpperCase();
    if (cleanRef && (profile as any)?.referral_code) {
      if (cleanRef === String((profile as any).referral_code).trim().toUpperCase()) {
        setErrorMessage("Self-referral is not permitted. You cannot use your own referral code.");
        return false;
      }
    }
    return true;
  };

  const handlePayAdvance = async () => {
    if (submitting) return;

    if (!user) {
      Alert.alert(
        "Sign In Required",
        "Please sign in to your RoyalLagn account to book this vendor and secure your date.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign In",
            onPress: () => {
              onClose();
              router.push("/Login");
            },
          },
        ]
      );
      setErrorMessage("Please sign in or create an account to book this vendor.");
      return;
    }

    if (!validateInputs()) return;

    setSubmitting(true);
    setErrorMessage("");

    try {
      const phoneRes = validateIndianPhone(contactNumber || customerPhone);
      const waTarget = sameAsContact ? (contactNumber || customerPhone) : whatsappNumber;
      const waRes = validateIndianPhone(waTarget);
      const cleanPhone = phoneRes.cleaned;
      const cleanWa = waRes.cleaned;
      const eventStartAt = buildEventStartTimestamp(startDate, eventStartTime);

      // 1. Create booking order and obtain Razorpay Order ID from server (or zero fee direct booking)
      const orderRes = await VendorBookingService.createBookingOrder({
        vendorId,
        startDate,
        endDate,
        customerName: customerName.trim(),
        customerPhone: cleanPhone,
        customerEmail: customerEmail.trim() || null,
        customerId: user?.id || null,
        eventType,
        specialNotes: specialNotes.trim() || null,
        referralCode: referralCode.trim() || null,
        selectedPackageIds: packagesList.map((p) => p.id),
        addOns: addOnsList,
        eventStartAt,
        customerContactNumber: cleanPhone,
        customerWhatsappNumber: cleanWa,
        serviceMapUrl: serviceMapUrl.trim(),
        bookingDescription: bookingDescription.trim(),
      });

      // 2. If Zero-Fee (total under 2,999), bypass Razorpay entirely!
      if (orderRes.isZeroFee || (orderRes.bookingFeeAmount ?? orderRes.advanceAmount ?? 0) === 0) {
        onClose();
        if (Platform.OS === "web") {
          window.alert(
            `Booking Request Submitted!\n\nYour zero-fee booking request (Ticket #${orderRes.ticketId}) has been submitted for Admin Verification before being forwarded to the vendor.`
          );
          try {
            router.replace("/(tabs)/bookings");
          } catch {
            window.location.href = "/bookings";
          }
        } else {
          Alert.alert(
            "Booking Request Submitted",
            `Your zero-fee booking request (Ticket #${orderRes.ticketId}) has been submitted for admin verification and vendor confirmation.`,
            [{ text: "View Bookings", onPress: () => router.replace("/(tabs)/bookings") }]
          );
          router.replace("/(tabs)/bookings");
        }
        return;
      }

      // 3. Open Real Razorpay Test Checkout Gateway for the Booking Fee
      const checkoutResult = await openRazorpayCheckout({
        paymentRecordId: orderRes.bookingRecordId,
        orderId: orderRes.orderId!,
        amount: orderRes.amountMinor!,
        currency: orderRes.currency || "INR",
        keyId: orderRes.keyId!,
        planName: `Booking Fee - ${vendorName}`,
        vendorName: customerName.trim(),
        email: customerEmail.trim() || undefined,
        phone: cleanPhone,
      });

      // 4. Cryptographically verify payment on server & transition to ADMIN_PENDING
      const verifyRes = await VendorBookingService.verifyBookingPayment({
        bookingRecordId: orderRes.bookingRecordId,
        bookingId: orderRes.bookingId,
        razorpayOrderId: checkoutResult.razorpay_order_id,
        razorpayPaymentId: checkoutResult.razorpay_payment_id,
        razorpaySignature: checkoutResult.razorpay_signature,
      });

      const finalTicket = verifyRes.ticketId || orderRes.ticketId;

      // 5. Close modal, show payment successful message, and navigate to My Bookings tab
      onClose();
      if (Platform.OS === "web") {
        window.alert(
          `Payment Successful!\n\nYour booking fee has been received successfully. Your request (Ticket #${finalTicket}) is now under Admin Verification before being sent to the vendor.`
        );
        try {
          router.replace("/(tabs)/bookings");
        } catch {
          window.location.href = "/bookings";
        }
      } else {
        Alert.alert(
          "Payment Successful",
          `Your booking fee has been received. Your booking request (Ticket #${finalTicket}) is now under admin verification before being forwarded to the vendor.`,
          [{ text: "View Bookings", onPress: () => router.replace("/(tabs)/bookings") }]
        );
        router.replace("/(tabs)/bookings");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to complete booking payment. Please try again.";
      if (/cancel|dismiss|closed/i.test(msg)) {
        setErrorMessage("Payment was cancelled. You can complete your booking fee when ready.");
      } else {
        setErrorMessage(msg);
        Alert.alert("Payment Failed", msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
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
        <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
          <View style={styles.headerIcon}>
            <PackageCheck size={22} color={PINK} strokeWidth={2.2} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.headerTitle, { color: palette.text }]}>Book Vendor & Connect</Text>
            <Text numberOfLines={1} style={[styles.headerSubtitle, { color: palette.muted }]}>
              {vendorName} · {totalDays} {totalDays === 1 ? "Day" : "Days Duration"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close booking"
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: palette.surfaceSoft }]}
          >
            <X size={20} color={palette.text} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {!user ? (
            <View style={[styles.authNoticeCard, { backgroundColor: palette.surfaceSoft, borderColor: palette.cardBorder }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.authNoticeTitle, { color: palette.text }]}>Sign In Required</Text>
                <Text style={[styles.authNoticeSubtitle, { color: palette.muted }]}>
                  Please sign in to your RoyalLagn account to reserve your date and complete booking connection.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign in to book"
                onPress={() => {
                  onClose();
                  router.push("/Login");
                }}
                style={styles.authNoticeBtn}
              >
                <Text style={styles.authNoticeBtnText}>Sign In</Text>
              </Pressable>
            </View>
          ) : null}

          {/* 1. Selected Packages Summary */}
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.cardBorder }]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <Sparkles size={16} color={PINK} />
                <Text style={[styles.cardTitle, { color: palette.text }]}>Selected Packages</Text>
              </View>
              <View style={styles.pillGreen}>
                <Text style={styles.pillGreenText}>PLATFORM CONNECTION</Text>
              </View>
            </View>

            {packagesList.map((pkg) => (
              <View key={pkg.id} style={styles.packageItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.packageItemTitle, { color: palette.text }]}>{pkg.title}</Text>
                  {pkg.duration_label ? (
                    <Text style={[styles.packageItemMeta, { color: palette.muted }]}>{pkg.duration_label}</Text>
                  ) : null}
                </View>
                <Text style={[styles.packageItemPrice, { color: palette.text }]}>
                  {money(Number(pkg.discounted_price ?? pkg.price ?? 0))}
                  {totalDays > 1 ? ` × ${totalDays}d` : ""}
                </Text>
              </View>
            ))}

            <View style={[styles.divider, { backgroundColor: palette.border }]} />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change event dates"
              onPress={() => setCalendarModalVisible(true)}
              style={styles.dateDurationRow}
            >
              <CalendarDays size={15} color={PINK} />
              <Text style={[styles.dateDurationText, { color: palette.text, flex: 1 }]}>
                {startDate} {totalDays > 1 ? `to ${endDate} (${totalDays} Days)` : ""}
              </Text>
              <View style={[styles.miniChangeBtn, { borderColor: PINK }]}>
                <Text style={[styles.miniChangeBtnText, { color: PINK }]}>Change Dates</Text>
              </View>
            </Pressable>

            {/* Event Start Time Selector */}
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Clock3 size={15} color={PINK} />
                <Text style={[styles.inputLabel, { color: palette.text, fontWeight: "700", marginBottom: 0 }]}>
                  Event Start Time (IST) *
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventTypePills}>
                {STANDARD_TIME_SLOTS.map((slot) => {
                  const active = eventStartTime === slot.id;
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => setEventStartTime(slot.id)}
                      style={[
                        styles.eventPill,
                        {
                          backgroundColor: active ? PINK : palette.surfaceSoft,
                          borderColor: active ? PINK : palette.border,
                        },
                      ]}
                    >
                      <Text style={[styles.eventPillText, { color: active ? "#FFFFFF" : palette.text }]}>
                        {slot.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={{ fontSize: 11, color: palette.muted, marginTop: 5 }}>
                Exact start time in Asia/Kolkata timezone. Cancellation locks exactly 120 hours prior.
              </Text>
            </View>
          </View>

          {/* 2. Client Details & Booking Arrangements Form */}
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <Lock size={16} color={PINK} />
                <Text style={[styles.cardTitle, { color: palette.text }]}>Booking Details & Confidential Info</Text>
              </View>
              <View style={[styles.pillGreen, { backgroundColor: "rgba(236, 72, 153, 0.1)" }]}>
                <Text style={[styles.pillGreenText, { color: PINK }]}>SECURE ESCROW</Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: palette.muted }]}>Full Name *</Text>
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Bride / Groom / Organizer Name"
                placeholderTextColor={palette.muted}
                style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
              />
            </View>

            <View style={styles.fieldRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Phone size={13} color={PINK} />
                  <Text style={[styles.inputLabel, { color: palette.muted, marginBottom: 0 }]}>Personal Contact Number *</Text>
                </View>
                <TextInput
                  value={contactNumber}
                  onChangeText={setContactNumber}
                  placeholder="10-digit mobile"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 }]}
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: palette.muted }]}>Email Address</Text>
                <TextInput
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  placeholder="name@example.com"
                  placeholderTextColor={palette.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
                />
              </View>
            </View>

            {/* WhatsApp Number & Checkbox */}
            <View style={styles.fieldGroup}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MessageSquare size={13} color="#25D366" />
                <Text style={[styles.inputLabel, { color: palette.muted, marginBottom: 0 }]}>WhatsApp Number *</Text>
              </View>
              <Pressable
                onPress={() => setSameAsContact(!sameAsContact)}
                style={styles.checkboxRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sameAsContact }}
              >
                {sameAsContact ? (
                  <CheckSquare size={18} color={PINK} />
                ) : (
                  <Square size={18} color={palette.muted} />
                )}
                <Text style={[styles.checkboxText, { color: palette.text }]}>
                  Same as personal contact number ({contactNumber || customerPhone || "Not set"})
                </Text>
              </Pressable>

              {!sameAsContact && (
                <TextInput
                  value={whatsappNumber}
                  onChangeText={setWhatsappNumber}
                  placeholder="Enter 10-digit WhatsApp number"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 }]}
                />
              )}
            </View>

            {/* Service Location — Google Maps */}
            <View style={styles.fieldGroup}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={13} color={PINK} />
                <Text style={[styles.inputLabel, { color: palette.muted, marginBottom: 0 }]}>
                  Service Location — Google Maps *
                </Text>
              </View>
              <TextInput
                value={serviceMapUrl}
                onChangeText={setServiceMapUrl}
                placeholder="https://maps.app.goo.gl/... or https://maps.google.com/..."
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                keyboardType="url"
                style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 }]}
              />
              <Text style={{ fontSize: 11, color: palette.muted, marginTop: 3 }}>
                Paste the venue location link so the vendor can navigate accurately on event day.
              </Text>
            </View>

            {/* Booking Description */}
            <View style={styles.fieldGroup}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <FileText size={13} color={PINK} />
                  <Text style={[styles.inputLabel, { color: palette.muted, marginBottom: 0 }]}>
                    Booking Description *
                  </Text>
                </View>
                <Text style={[styles.charCounter, { color: bookingDescription.length > 2000 ? "#EF4444" : palette.muted }]}>
                  {bookingDescription.length}/2000
                </Text>
              </View>
              <TextInput
                value={bookingDescription}
                onChangeText={setBookingDescription}
                placeholder="Explain event arrangements, venue setup, ceremony schedule, and instructions for the vendor..."
                placeholderTextColor={palette.muted}
                multiline
                numberOfLines={3}
                maxLength={2000}
                style={[styles.textArea, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4, minHeight: 72 }]}
              />
            </View>

            {/* Occasion / Event Type Selector */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: palette.muted }]}>Wedding Occasion</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventTypePills}>
                {EVENT_TYPES.map((type) => {
                  const active = eventType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setEventType(type)}
                      style={[
                        styles.eventPill,
                        {
                          backgroundColor: active ? PINK : palette.surfaceSoft,
                          borderColor: active ? PINK : palette.border,
                        },
                      ]}
                    >
                      <Text style={[styles.eventPillText, { color: active ? "#FFFFFF" : palette.text }]}>
                        {type}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Special Requests */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: palette.muted }]}>Special Requests or Preferences (Optional)</Text>
              <TextInput
                value={specialNotes}
                onChangeText={setSpecialNotes}
                placeholder="Any special requests or notes..."
                placeholderTextColor={palette.muted}
                multiline
                numberOfLines={2}
                style={[styles.textArea, { color: palette.text, borderColor: palette.border, backgroundColor: palette.background }]}
              />
            </View>

            {/* Referral Code */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.inputLabel, { color: palette.muted }]}>
                {isReferralLocked ? "Referral Attribution (Locked to Inviter)" : "Referral Code (Optional)"}
              </Text>
              <TextInput
                value={referralCode}
                onChangeText={isReferralLocked ? undefined : setReferralCode}
                editable={!isReferralLocked}
                placeholder="e.g. RLROYAL500"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                style={[
                  styles.input,
                  {
                    color: isReferralLocked ? palette.muted : palette.text,
                    borderColor: isReferralLocked ? "#10B981" : palette.border,
                    backgroundColor: isReferralLocked ? (dark ? "#064E3B20" : "#ECFDF5") : palette.background,
                  },
                ]}
              />
              {isReferralLocked ? (
                <Text style={{ fontSize: 11, color: "#059669", marginTop: 4 }}>
                  ✓ Persisted first-touch referral linked to your account.
                </Text>
              ) : null}
            </View>

            {/* Contact Unlock Policy Box */}
            <View style={[styles.privacyBox, { backgroundColor: dark ? "#1E293B" : "#F8FAFC", borderColor: dark ? "#334155" : "#E2E8F0" }]}>
              <ShieldCheck size={18} color={PINK} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.privacyTitle, { color: palette.text }]}>
                  🔒 Contact Details Held & Unlocked Upon Acceptance
                </Text>
                <Text style={[styles.privacyDesc, { color: palette.muted }]}>
                  Direct phone numbers, WhatsApp, and Google Maps venue details are safely held and will unlock immediately once the vendor formally accepts your booking request. 100% booking fee refund is guaranteed if cancelled or rejected prior to vendor acceptance.
                </Text>
              </View>
            </View>
          </View>

          {/* 3. Transparent Financial Breakdown */}
          <View style={[styles.financialCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.cardHeaderLeft}>
              <ReceiptText size={16} color={PINK} />
              <Text style={[styles.cardTitle, { color: palette.text }]}>Payment & Fee Breakdown</Text>
            </View>

            <View style={styles.priceLine}>
              <Text style={[styles.priceLineLabel, { color: palette.muted }]}>
                Vendor Service Value ({totalDays} {totalDays === 1 ? "day" : "days"})
              </Text>
              <Text style={[styles.priceLineVal, { color: palette.text }]}>{money(financials.packagesTotal)}</Text>
            </View>

            {financials.addOnsTotal > 0 ? (
              <View style={styles.priceLine}>
                <Text style={[styles.priceLineLabel, { color: palette.muted }]}>Selected Add-ons</Text>
                <Text style={[styles.priceLineVal, { color: palette.text }]}>+{money(financials.addOnsTotal)}</Text>
              </View>
            ) : null}

            <View style={[styles.divider, { backgroundColor: palette.border }]} />

            <View style={styles.priceLine}>
              <Text style={[styles.totalLabel, { color: palette.text }]}>Total Service Amount</Text>
              <Text style={[styles.totalVal, { color: palette.text }]}>{money(financials.totalAmount)}</Text>
            </View>

            <View style={styles.highlightSplitRow}>
              {/* Payable Now (Booking Fee) */}
              <View style={[styles.splitBoxAdvance, { backgroundColor: dark ? "#064E3B" : "#ECFDF5", borderColor: "#10B981" }]}>
                <Text style={[styles.splitBoxHeading, { color: "#059669" }]}>PAYABLE NOW (BOOKING FEE)</Text>
                <Text style={[styles.splitBoxPrice, { color: "#059669" }]}>
                  {financials.bookingFee === 0 ? "₹0 (Free)" : money(financials.bookingFee)}
                </Text>
                <Text style={[styles.splitBoxSub, { color: "#047857" }]}>Platform connection & verification</Text>
              </View>

              {/* Direct to Vendor */}
              <View style={[styles.splitBoxDue, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]}>
                <Text style={[styles.splitBoxHeading, { color: palette.muted }]}>DIRECT TO VENDOR</Text>
                <Text style={[styles.splitBoxPrice, { color: palette.text }]}>
                  {money(financials.vendorPayableDirect ?? financials.dueAmount)}
                </Text>
                <Text style={[styles.splitBoxSub, { color: palette.muted }]}>Pay directly to vendor upon service</Text>
              </View>
            </View>

            {/* Platform Disclaimer */}
            <View style={[styles.disclaimerBox, { backgroundColor: dark ? "#1E293B" : "#FFF7ED", borderColor: dark ? "#7C2D12" : "#FFEDD5" }]}>
              <Info size={16} color="#D97706" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.disclaimerTitle, { color: dark ? "#FDE68A" : "#92400E" }]}>Platform Disclaimer</Text>
                <Text style={[styles.disclaimerText, { color: dark ? "#CBD5E1" : "#78350F" }]}>
                  The booking fee paid here is for RoyalLagn platform connection and verification services only. The full service amount is payable directly to the vendor according to your mutual agreement. RoyalLagn is not responsible for vendor service delivery or direct payments made to the vendor.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer with Pay CTA */}
        <View
          style={[
            styles.footer,
            !desktop && styles.footerMobile,
            { backgroundColor: palette.surface, borderTopColor: palette.border },
          ]}
        >
          <View style={[styles.footerInfo, !desktop && styles.footerInfoMobile]}>
            <Text
              style={[
                styles.footerSmall,
                !desktop && styles.footerSmallMobile,
                { color: palette.muted },
              ]}
              numberOfLines={1}
            >
              {financials.bookingFee === 0 ? "Zero Fee" : (!desktop ? "Booking Fee" : "Booking Fee Due Now")}
            </Text>
            <Text
              style={[
                styles.footerPrice,
                !desktop && styles.footerPriceMobile,
                { color: PINK },
              ]}
              numberOfLines={1}
            >
              {financials.bookingFee === 0 ? "₹0" : money(financials.bookingFee)}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={financials.bookingFee === 0 ? "Confirm booking free" : "Pay booking fee"}
            onPress={() => void handlePayAdvance()}
            disabled={submitting}
            style={[
              styles.payBtn,
              !desktop && styles.payBtnMobile,
              { backgroundColor: PINK, opacity: submitting ? 0.7 : 1 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <ShieldCheck size={!desktop ? 15 : 18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text
                  style={[
                    styles.payBtnText,
                    !desktop && styles.payBtnTextMobile,
                  ]}
                  numberOfLines={1}
                >
                  {!user
                    ? "Sign In to Book"
                    : financials.bookingFee === 0
                    ? "Confirm Booking (Free)"
                    : (!desktop ? `Pay Fee (${money(financials.bookingFee)})` : `Pay Booking Fee (${money(financials.bookingFee)})`)}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </AnimatedBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
  },
  desktopSheet: {
    width: 620,
    maxHeight: "88%",
    borderRadius: 24,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(233, 30, 99, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  flex: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    padding: 16,
    borderRadius: 18,
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
  pillGreen: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillGreenText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "800",
  },
  packageItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  packageItemTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  packageItemMeta: {
    fontSize: 11,
  },
  packageItemPrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  dateDurationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  dateDurationText: {
    fontSize: 13,
    fontWeight: "600",
  },
  miniChangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  miniChangeBtnText: {
    fontSize: 11,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 64,
  },
  eventTypePills: {
    gap: 8,
    paddingVertical: 4,
  },
  eventPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  eventPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  financialCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  priceLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 3,
  },
  priceLineLabel: {
    fontSize: 13,
  },
  priceLineVal: {
    fontSize: 13,
    fontWeight: "700",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  totalVal: {
    fontSize: 16,
    fontWeight: "800",
  },
  highlightSplitRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  splitBoxAdvance: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  splitBoxDue: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  splitBoxHeading: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  splitBoxPrice: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
    marginBottom: 2,
  },
  splitBoxSub: {
    fontSize: 10,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  footerMobile: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  footerInfo: {
    flex: 1,
  },
  footerInfoMobile: {
    flex: 0,
    minWidth: 96,
    flexShrink: 0,
    justifyContent: "center",
  },
  footerSmall: {
    fontSize: 11,
    fontWeight: "600",
  },
  footerSmallMobile: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  footerPrice: {
    fontSize: 20,
    fontWeight: "900",
  },
  footerPriceMobile: {
    fontSize: 18,
    fontWeight: "900",
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  payBtnMobile: {
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 12,
  },
  payBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  payBtnTextMobile: {
    fontSize: 13,
    fontWeight: "800",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  checkboxText: {
    fontSize: 13,
    fontWeight: "500",
  },
  privacyBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  privacyDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  disclaimerBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 2,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
  },
  charCounter: {
    fontSize: 11,
    textAlign: "right",
  },
  authNoticeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  authNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  authNoticeSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  authNoticeBtn: {
    backgroundColor: PINK,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  authNoticeBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});

