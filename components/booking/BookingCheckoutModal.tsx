import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  Lock,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  X,
  MapPin,
  Phone,
  MessageSquare,
  FileText,
  CheckSquare,
  Square,
  Info,
  CheckCircle2,
  AlertCircle,
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
} from "@/services/vendorBookings";
import {
  STANDARD_TIME_SLOTS,
  buildEventStartTimestamp,
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

export type FieldErrorKey =
  | "startDate"
  | "eventStartTime"
  | "customerName"
  | "contactNumber"
  | "customerEmail"
  | "whatsappNumber"
  | "serviceMapUrl"
  | "bookingDescription"
  | "referralCode";

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

  // Enhanced form validation state
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});
  const [validationPopup, setValidationPopup] = useState<{
    visible: boolean;
    title: string;
    message: string;
    firstFieldKey?: FieldErrorKey;
  }>({
    visible: false,
    title: "",
    message: "",
  });

  // Reliable synchronous in-flight guard preventing duplicate Pay Now triggers
  const isSubmittingRef = useRef(false);

  // Verification retry state machine preventing duplicate payments & orders
  const pendingVerificationRef = useRef<{
    bookingRecordId: string;
    bookingId: string;
    ticketId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  } | null>(null);
  const [pendingVerification, setPendingVerification] = useState<{
    bookingRecordId: string;
    bookingId: string;
    ticketId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  } | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // ScrollView & field focus refs
  const scrollViewRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const waInputRef = useRef<TextInput>(null);
  const mapUrlInputRef = useRef<TextInput>(null);
  const descInputRef = useRef<TextInput>(null);
  const referralInputRef = useRef<TextInput>(null);

  // Layout Y positions for accurate content scrolling
  const card1Y = useRef(0);
  const card2Y = useRef(0);
  const fieldYCoords = useRef<Record<string, number>>({});

  const endDate = useMemo(() => {
    if (initialEndDate) return initialEndDate;
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.max(0, totalDays - 1));
    return d.toISOString().slice(0, 10);
  }, [startDate, totalDays, initialEndDate]);

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

  // Financial calculations with multi-day days multiplier & duration awareness
  const packageItemBreakdown = useMemo(() => {
    return packagesList.map((pkg, idx) => {
      const unitPrice = Number(pkg.discounted_price ?? pkg.price ?? 0);
      const duration = (pkg.duration_label || "").toLowerCase();
      const priceType = (pkg.price_type || "").toLowerCase();
      const isPerDay = duration.includes("day") || duration.includes("daily") || priceType === "starting" || !priceType;
      const daysApplied = isPerDay ? Math.max(1, totalDays) : 1;
      const subtotal = Math.round(unitPrice * daysApplied);
      return {
        id: pkg.id || `pkg_${idx}`,
        title: pkg.title,
        unitPrice,
        daysApplied,
        subtotal,
        isPerDay,
        durationLabel: pkg.duration_label,
      };
    });
  }, [packagesList, totalDays]);

  const financials = useMemo(() => {
    const pkgPrices = packagesList.map((p) => ({
      price: Number(p.discounted_price ?? p.price ?? 0),
      duration_label: p.duration_label || null,
      price_type: p.price_type || null,
    }));
    return calculateBookingFinancials(pkgPrices, totalDays, addOnsList);
  }, [packagesList, totalDays, addOnsList]);

  const getFieldScrollY = useCallback((fieldKey: FieldErrorKey): number => {
    if (fieldKey === "startDate" || fieldKey === "eventStartTime") {
      const childY = fieldYCoords.current[fieldKey] || 0;
      return Math.max(0, card1Y.current + childY - 16);
    }
    const childY = fieldYCoords.current[fieldKey] || 0;
    return Math.max(0, card2Y.current + childY - 16);
  }, []);

  const handleDismissAlert = useCallback(() => {
    const targetKey = validationPopup.firstFieldKey;
    setValidationPopup((prev) => ({ ...prev, visible: false }));

    if (!targetKey) return;

    const targetY = getFieldScrollY(targetKey);

    // Wait for popup dismissal transition to begin before scrolling
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });

      // Focus text input only after scroll animation has settled, avoiding unexpected keyboard pops
      const textInputMap: Partial<Record<FieldErrorKey, React.RefObject<TextInput | null>>> = {
        customerName: nameInputRef,
        contactNumber: phoneInputRef,
        customerEmail: emailInputRef,
        whatsappNumber: waInputRef,
        serviceMapUrl: mapUrlInputRef,
        bookingDescription: descInputRef,
        referralCode: referralInputRef,
      };

      const targetInputRef = textInputMap[targetKey];
      if (targetInputRef) {
        setTimeout(() => {
          targetInputRef.current?.focus();
        }, 350);
      }
    }, 150);
  }, [validationPopup.firstFieldKey, getFieldScrollY]);

  // Validates a field on change and clears its error ONLY when it becomes valid
  const validateFieldOnChange = useCallback((field: FieldErrorKey, value: string) => {
    if (!fieldErrors[field]) return;

    let isValid = false;
    if (field === "customerName") {
      isValid = value.trim().length > 0;
    } else if (field === "contactNumber") {
      isValid = validateIndianPhone(value).valid;
    } else if (field === "customerEmail") {
      isValid = !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    } else if (field === "whatsappNumber") {
      const target = sameAsContact ? (contactNumber || customerPhone) : value;
      isValid = validateIndianPhone(target).valid;
    } else if (field === "serviceMapUrl") {
      isValid = validateGoogleMapsUrl(value).valid;
    } else if (field === "bookingDescription") {
      isValid = validateBookingDescription(value).valid;
    } else if (field === "referralCode") {
      const clean = value.trim().toUpperCase();
      isValid = !clean || clean !== String((profile as any)?.referral_code || "").trim().toUpperCase();
    }

    if (isValid) {
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [fieldErrors, sameAsContact, contactNumber, customerPhone, profile]);

  const validateInputs = (): boolean => {
    setErrorMessage("");
    const errors: Partial<Record<FieldErrorKey, string>> = {};
    let firstError: { key: FieldErrorKey; title: string; message: string } | null = null;

    const recordError = (key: FieldErrorKey, title: string, message: string) => {
      errors[key] = message;
      if (!firstError) {
        firstError = { key, title, message };
      }
    };

    // 1. Event Date
    if (!startDate) {
      recordError("startDate", "Missing Event Date", "Please select an event date before proceeding with payment.");
    } else {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (startDate <= todayStr) {
        recordError("startDate", "Invalid Event Date", "Event date must be in the future.");
      }
    }

    // 2. Event Start Time
    if (!eventStartTime) {
      recordError("eventStartTime", "Missing Start Time", "Please select an event start time (IST).");
    }

    // 3. Customer Full Name
    if (!customerName.trim()) {
      recordError("customerName", "Missing Full Name", "Please enter your full name before proceeding with payment.");
    }

    // 4. Personal Contact Number
    const phoneRes = validateIndianPhone(contactNumber || customerPhone);
    if (!phoneRes.valid) {
      recordError("contactNumber", "Invalid Contact Number", phoneRes.error || "Please enter a valid 10-digit personal contact number.");
    }

    // 5. Customer Email (Optional, but if filled must be valid)
    if (customerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail.trim())) {
        recordError("customerEmail", "Invalid Email Address", "Please enter a valid email address (e.g. name@example.com).");
      }
    }

    // 6. WhatsApp Number
    const waTarget = sameAsContact ? (contactNumber || customerPhone) : whatsappNumber;
    const waRes = validateIndianPhone(waTarget);
    if (!waRes.valid) {
      recordError("whatsappNumber", "Invalid WhatsApp Number", waRes.error || "Please enter a valid 10-digit WhatsApp number.");
    }

    // 7. Service Location — Google Maps Link
    const mapRes = validateGoogleMapsUrl(serviceMapUrl);
    if (!mapRes.valid) {
      recordError(
        "serviceMapUrl",
        "Missing Service Location",
        mapRes.error || "Please enter your event location Google Maps link before proceeding with payment."
      );
    }

    // 8. Booking Description
    const descRes = validateBookingDescription(bookingDescription);
    if (!descRes.valid) {
      recordError(
        "bookingDescription",
        "Missing Booking Description",
        descRes.error || "Please provide a booking description explaining event arrangements & instructions for the vendor."
      );
    }

    // 9. Referral Code (Self-referral check)
    const cleanRef = referralCode.trim().toUpperCase();
    if (cleanRef && (profile as any)?.referral_code) {
      if (cleanRef === String((profile as any).referral_code).trim().toUpperCase()) {
        recordError("referralCode", "Invalid Referral Code", "Self-referral is not permitted. You cannot use your own referral code.");
      }
    }

    if (firstError) {
      setFieldErrors(errors);
      setValidationPopup({
        visible: true,
        title: (firstError as any).title,
        message: (firstError as any).message,
        firstFieldKey: (firstError as any).key,
      });
      return false;
    }

    setFieldErrors({});
    setValidationPopup({ visible: false, title: "", message: "" });
    return true;
  };

  const executePaymentVerification = async (txn: {
    bookingRecordId: string;
    bookingId: string;
    ticketId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) => {
    setIsVerifyingPayment(true);
    setVerificationError(null);
    setErrorMessage("");

    try {
      const verifyRes = await VendorBookingService.verifyBookingPayment({
        bookingRecordId: txn.bookingRecordId,
        bookingId: txn.bookingId,
        razorpayOrderId: txn.razorpayOrderId,
        razorpayPaymentId: txn.razorpayPaymentId,
        razorpaySignature: txn.razorpaySignature,
      });

      // Clear in-flight verification state on success
      pendingVerificationRef.current = null;
      setPendingVerification(null);
      setIsVerifyingPayment(false);

      // Canonical database identifiers:
      const canonicalRecordId = txn.bookingRecordId;
      const canonicalBookingId = verifyRes.bookingId || txn.bookingId;
      const finalTicket = verifyRes.ticketId || txn.ticketId;

      // Close modal before navigating away
      onClose();

      // Navigate to My Bookings and target exact booking card
      router.replace({
        pathname: "/(tabs)/bookings",
        params: {
          bookingRecordId: canonicalRecordId,
          bookingId: canonicalBookingId,
          ticketId: finalTicket,
          tab: "pending",
        },
      });
    } catch (err: any) {
      console.error("Payment verification delay or error:", err);
      setIsVerifyingPayment(false);
      setVerificationError(
        err?.message || "Payment was captured on gateway, but verification response timed out. Tap 'Retry Verification' to finalize your booking."
      );
    }
  };

  const handlePayAdvance = async () => {
    if (isSubmittingRef.current || submitting || isVerifyingPayment) return;

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

    isSubmittingRef.current = true;
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

      // 2. If Zero-Fee (total under 2,999), verify legitimate backend finalization before routing
      if (orderRes.isZeroFee || (orderRes.bookingFeeAmount ?? orderRes.advanceAmount ?? 0) === 0) {
        if (!orderRes.bookingRecordId && !orderRes.bookingId) {
          throw new Error("Zero-fee booking confirmation failed: Missing booking identifiers from server.");
        }

        const canonicalId = orderRes.bookingRecordId || orderRes.bookingId;
        const confirmedBooking = await VendorBookingService.getSecureBookingDetails(canonicalId, "customer");
        if (!confirmedBooking) {
          throw new Error("Unable to confirm zero-fee booking persistence with server. Please try again.");
        }

        onClose();
        router.replace({
          pathname: "/(tabs)/bookings",
          params: {
            bookingRecordId: orderRes.bookingRecordId,
            bookingId: orderRes.bookingId,
            ticketId: orderRes.ticketId,
            tab: "pending",
          },
        });
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

      // 4. Preserve transaction identifiers in ref and state (prevents duplicate orders/charges)
      const txn = {
        bookingRecordId: orderRes.bookingRecordId,
        bookingId: orderRes.bookingId,
        ticketId: orderRes.ticketId,
        razorpayOrderId: checkoutResult.razorpay_order_id,
        razorpayPaymentId: checkoutResult.razorpay_payment_id,
        razorpaySignature: checkoutResult.razorpay_signature,
      };
      pendingVerificationRef.current = txn;
      setPendingVerification(txn);

      // 5. Authoritative Server-side Verification
      await executePaymentVerification(txn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to complete booking payment. Please try again.";
      if (/cancel|dismiss|closed/i.test(msg)) {
        setErrorMessage("Payment was cancelled. You can complete your booking fee when ready.");
      } else {
        setErrorMessage(msg);
        Alert.alert("Booking Notice", msg);
      }
    } finally {
      isSubmittingRef.current = false;
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
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {pendingVerification ? (
            <View style={[styles.verificationAlertCard, { backgroundColor: dark ? "#2B1A24" : "#FEF3C7", borderColor: "#F59E0B" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ActivityIndicator size="small" color="#D97706" />
                <Text style={[styles.verificationAlertTitle, { color: dark ? "#FDE68A" : "#92400E" }]}>
                  Payment Captured on Gateway
                </Text>
              </View>
              <Text style={[styles.verificationAlertDesc, { color: dark ? "#F3F4F6" : "#78350F" }]}>
                {verificationError || "Your payment was captured by Razorpay. Finalizing your booking confirmation with server..."}
              </Text>
            </View>
          ) : null}

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
          <View
            onLayout={(e) => { card1Y.current = e.nativeEvent.layout.y; }}
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.cardBorder }]}
          >
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

            <View onLayout={(e) => { fieldYCoords.current.startDate = e.nativeEvent.layout.y; }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change event dates"
                onPress={() => setCalendarModalVisible(true)}
                style={[
                  styles.dateDurationRow,
                  fieldErrors.startDate && styles.cardErrorBorder,
                ]}
              >
                <CalendarDays size={15} color={fieldErrors.startDate ? "#DC2626" : PINK} />
                <Text style={[styles.dateDurationText, { color: palette.text, flex: 1 }]}>
                  {startDate} {totalDays > 1 ? `to ${endDate} (${totalDays} Days)` : ""}
                </Text>
                <View style={[styles.miniChangeBtn, { borderColor: fieldErrors.startDate ? "#DC2626" : PINK }]}>
                  <Text style={[styles.miniChangeBtnText, { color: fieldErrors.startDate ? "#DC2626" : PINK }]}>Change Dates</Text>
                </View>
              </Pressable>
              {fieldErrors.startDate ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.startDate}</Text>
                </View>
              ) : null}
            </View>

            {/* Event Start Time Selector */}
            <View
              onLayout={(e) => { fieldYCoords.current.eventStartTime = e.nativeEvent.layout.y; }}
              style={[{ marginTop: 12 }, fieldErrors.eventStartTime && styles.timeGroupError]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Clock3 size={15} color={fieldErrors.eventStartTime ? "#DC2626" : PINK} />
                <Text style={[styles.inputLabel, { color: fieldErrors.eventStartTime ? "#DC2626" : palette.text, fontWeight: "700", marginBottom: 0 }]}>
                  Event Start Time (IST) *
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventTypePills}>
                {STANDARD_TIME_SLOTS.map((slot) => {
                  const active = eventStartTime === slot.id;
                  return (
                    <Pressable
                      key={slot.id}
                      onPress={() => {
                        setEventStartTime(slot.id);
                        if (fieldErrors.eventStartTime) {
                          setFieldErrors((prev) => {
                            const next = { ...prev };
                            delete next.eventStartTime;
                            return next;
                          });
                        }
                      }}
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
              {fieldErrors.eventStartTime ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.eventStartTime}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: palette.muted, marginTop: 5 }}>
                  Exact start time in Asia/Kolkata timezone.
                </Text>
              )}
            </View>

            {/* Clean, Compact Price Breakdown */}
            <View style={[styles.divider, { backgroundColor: palette.border, marginTop: 14, marginBottom: 12 }]} />

            <View style={styles.priceBreakdownSection}>
              <View style={styles.priceBreakdownHeaderRow}>
                <ReceiptText size={15} color={PINK} />
                <Text style={[styles.priceBreakdownTitle, { color: palette.text }]}>PRICE BREAKDOWN</Text>
              </View>

              {/* Itemized Packages & Subtotals */}
              {packageItemBreakdown.map((item) => (
                <View key={item.id} style={styles.breakdownItemRow}>
                  <Text style={[styles.breakdownItemLabel, { color: palette.text }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.breakdownItemPrice, { color: palette.text }]}>
                    {money(item.subtotal)}
                  </Text>
                </View>
              ))}

              {/* Add-ons if any */}
              {addOnsList.length > 0 &&
                addOnsList.map((addon, idx) => (
                  <View key={addon.id || idx} style={styles.breakdownItemRow}>
                    <Text style={[styles.breakdownItemLabel, { color: palette.muted }]}>
                      + {addon.title} (Add-on)
                    </Text>
                    <Text style={[styles.breakdownItemPrice, { color: palette.text }]}>
                      {money(addon.price)}
                    </Text>
                  </View>
                ))}

              {/* Total Package Price Line */}
              <View style={[styles.breakdownDivider, { backgroundColor: palette.border }]} />
              <View style={styles.breakdownTotalRow}>
                <Text style={[styles.breakdownTotalLabel, { color: palette.text }]}>
                  Total Package Price
                </Text>
                <Text style={[styles.breakdownTotalVal, { color: palette.text }]}>
                  {money(financials.totalAmount)}
                </Text>
              </View>

              {/* The Two-Row Split: Pay Now vs Pay Vendor Directly */}
              <View style={styles.splitCardsContainer}>
                {/* Pay Now to RoyalLagn */}
                <View style={[styles.splitCardNow, { backgroundColor: dark ? "#064E3B20" : "#ECFDF5", borderColor: "#10B981" }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.splitCardNowTitle, { color: "#065F46" }]}>
                      Pay Now to RoyalLagn
                    </Text>
                    <Text style={[styles.splitCardSubtitle, { color: "#047857" }]}>
                      Booking & Connection Fee
                    </Text>
                  </View>
                  <Text style={[styles.splitCardNowPrice, { color: "#059669" }]}>
                    {financials.bookingFee === 0 ? "₹0 (Free)" : money(financials.bookingFee)}
                  </Text>
                </View>

                {/* Pay Vendor Directly */}
                <View style={[styles.splitCardVendor, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.splitCardVendorTitle, { color: palette.text }]}>
                      Pay Vendor Directly
                    </Text>
                    <Text style={[styles.splitCardSubtitle, { color: palette.muted }]}>
                      Remaining balance after booking
                    </Text>
                  </View>
                  <Text style={[styles.splitCardVendorPrice, { color: palette.text }]}>
                    {money(financials.vendorPayableDirect ?? financials.dueAmount)}
                  </Text>
                </View>
              </View>

              {/* Green check confirmation message */}
              <View style={[styles.includedFeeBanner, { backgroundColor: dark ? "#064E3B15" : "#F0FDF4", borderColor: dark ? "#065F46" : "#BBF7D0" }]}>
                <CheckCircle2 size={16} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
                <Text style={[styles.includedFeeText, { color: dark ? "#A7F3D0" : "#065F46" }]}>
                  RoyalLagn&apos;s booking fee is included in your total package price. No additional platform fee.
                </Text>
              </View>

              {/* Small explanation row */}
              <View style={styles.compactExplRow}>
                <Info size={13} color={palette.muted} style={{ marginTop: 1, flexShrink: 0 }} />
                <Text style={[styles.compactExplText, { color: palette.muted }]}>
                  Pay the booking fee now to receive your ticket and vendor contact details. Coordinate the remaining payment directly with the vendor.
                </Text>
              </View>
            </View>
          </View>

          {/* 2. Client Details & Booking Arrangements Form */}
          <View
            onLayout={(e) => { card2Y.current = e.nativeEvent.layout.y; }}
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <Lock size={16} color={PINK} />
                <Text style={[styles.cardTitle, { color: palette.text }]}>Booking Details & Confidential Info</Text>
              </View>
              <View style={[styles.pillGreen, { backgroundColor: "rgba(236, 72, 153, 0.1)" }]}>
                <Text style={[styles.pillGreenText, { color: PINK }]}>SECURE ESCROW</Text>
              </View>
            </View>

            <View
              onLayout={(e) => { fieldYCoords.current.customerName = e.nativeEvent.layout.y; }}
              style={styles.fieldGroup}
            >
              <Text style={[styles.inputLabel, { color: fieldErrors.customerName ? "#DC2626" : palette.muted }]}>
                Full Name *
              </Text>
              <TextInput
                ref={nameInputRef}
                value={customerName}
                onChangeText={(val) => {
                  setCustomerName(val);
                  validateFieldOnChange("customerName", val);
                }}
                placeholder="Bride / Groom / Organizer Name"
                placeholderTextColor={palette.muted}
                style={[
                  styles.input,
                  { color: palette.text, borderColor: palette.border, backgroundColor: palette.background },
                  fieldErrors.customerName && styles.inputErrorBorder,
                ]}
              />
              {fieldErrors.customerName ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.customerName}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldRow}>
              <View
                onLayout={(e) => { fieldYCoords.current.contactNumber = e.nativeEvent.layout.y; }}
                style={[styles.fieldGroup, { flex: 1 }]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Phone size={13} color={fieldErrors.contactNumber ? "#DC2626" : PINK} />
                  <Text style={[styles.inputLabel, { color: fieldErrors.contactNumber ? "#DC2626" : palette.muted, marginBottom: 0 }]}>
                    Personal Contact Number *
                  </Text>
                </View>
                <TextInput
                  ref={phoneInputRef}
                  value={contactNumber}
                  onChangeText={(val) => {
                    setContactNumber(val);
                    validateFieldOnChange("contactNumber", val);
                    if (sameAsContact) {
                      validateFieldOnChange("whatsappNumber", val);
                    }
                  }}
                  placeholder="10-digit mobile"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={[
                    styles.input,
                    { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 },
                    fieldErrors.contactNumber && styles.inputErrorBorder,
                  ]}
                />
                {fieldErrors.contactNumber ? (
                  <View style={styles.inlineErrorRow}>
                    <AlertCircle size={12} color="#DC2626" />
                    <Text style={styles.inlineErrorText}>{fieldErrors.contactNumber}</Text>
                  </View>
                ) : null}
              </View>

              <View
                onLayout={(e) => { fieldYCoords.current.customerEmail = e.nativeEvent.layout.y; }}
                style={[styles.fieldGroup, { flex: 1 }]}
              >
                <Text style={[styles.inputLabel, { color: fieldErrors.customerEmail ? "#DC2626" : palette.muted }]}>
                  Email Address
                </Text>
                <TextInput
                  ref={emailInputRef}
                  value={customerEmail}
                  onChangeText={(val) => {
                    setCustomerEmail(val);
                    validateFieldOnChange("customerEmail", val);
                  }}
                  placeholder="name@example.com"
                  placeholderTextColor={palette.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[
                    styles.input,
                    { color: palette.text, borderColor: palette.border, backgroundColor: palette.background },
                    fieldErrors.customerEmail && styles.inputErrorBorder,
                  ]}
                />
                {fieldErrors.customerEmail ? (
                  <View style={styles.inlineErrorRow}>
                    <AlertCircle size={12} color="#DC2626" />
                    <Text style={styles.inlineErrorText}>{fieldErrors.customerEmail}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* WhatsApp Number & Checkbox */}
            <View
              onLayout={(e) => { fieldYCoords.current.whatsappNumber = e.nativeEvent.layout.y; }}
              style={styles.fieldGroup}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MessageSquare size={13} color={fieldErrors.whatsappNumber ? "#DC2626" : "#25D366"} />
                <Text style={[styles.inputLabel, { color: fieldErrors.whatsappNumber ? "#DC2626" : palette.muted, marginBottom: 0 }]}>
                  WhatsApp Number *
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  const nextSame = !sameAsContact;
                  setSameAsContact(nextSame);
                  const target = nextSame ? (contactNumber || customerPhone) : whatsappNumber;
                  if (validateIndianPhone(target).valid) {
                    setFieldErrors((prev) => {
                      if (!prev.whatsappNumber) return prev;
                      const next = { ...prev };
                      delete next.whatsappNumber;
                      return next;
                    });
                  }
                }}
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
                  ref={waInputRef}
                  value={whatsappNumber}
                  onChangeText={(val) => {
                    setWhatsappNumber(val);
                    validateFieldOnChange("whatsappNumber", val);
                  }}
                  placeholder="Enter 10-digit WhatsApp number"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={[
                    styles.input,
                    { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 },
                    fieldErrors.whatsappNumber && styles.inputErrorBorder,
                  ]}
                />
              )}
              {fieldErrors.whatsappNumber ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.whatsappNumber}</Text>
                </View>
              ) : null}
            </View>

            {/* Service Location — Google Maps */}
            <View
              onLayout={(e) => { fieldYCoords.current.serviceMapUrl = e.nativeEvent.layout.y; }}
              style={styles.fieldGroup}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <MapPin size={13} color={fieldErrors.serviceMapUrl ? "#DC2626" : PINK} />
                <Text style={[styles.inputLabel, { color: fieldErrors.serviceMapUrl ? "#DC2626" : palette.muted, marginBottom: 0 }]}>
                  Service Location — Google Maps *
                </Text>
              </View>
              <TextInput
                ref={mapUrlInputRef}
                value={serviceMapUrl}
                onChangeText={(val) => {
                  setServiceMapUrl(val);
                  validateFieldOnChange("serviceMapUrl", val);
                }}
                placeholder="https://maps.app.goo.gl/... or https://maps.google.com/..."
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                keyboardType="url"
                style={[
                  styles.input,
                  { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4 },
                  fieldErrors.serviceMapUrl && styles.inputErrorBorder,
                ]}
              />
              {fieldErrors.serviceMapUrl ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.serviceMapUrl}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: palette.muted, marginTop: 3 }}>
                  Paste the venue location link so the vendor can navigate accurately on event day.
                </Text>
              )}
            </View>

            {/* Booking Description */}
            <View
              onLayout={(e) => { fieldYCoords.current.bookingDescription = e.nativeEvent.layout.y; }}
              style={styles.fieldGroup}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <FileText size={13} color={fieldErrors.bookingDescription ? "#DC2626" : PINK} />
                  <Text style={[styles.inputLabel, { color: fieldErrors.bookingDescription ? "#DC2626" : palette.muted, marginBottom: 0 }]}>
                    Booking Description *
                  </Text>
                </View>
                <Text style={[styles.charCounter, { color: bookingDescription.length > 2000 ? "#EF4444" : palette.muted }]}>
                  {bookingDescription.length}/2000
                </Text>
              </View>
              <TextInput
                ref={descInputRef}
                value={bookingDescription}
                onChangeText={(val) => {
                  setBookingDescription(val);
                  validateFieldOnChange("bookingDescription", val);
                }}
                placeholder="Explain event arrangements, venue setup, ceremony schedule, and instructions for the vendor..."
                placeholderTextColor={palette.muted}
                multiline
                numberOfLines={3}
                maxLength={2000}
                style={[
                  styles.textArea,
                  { color: palette.text, borderColor: palette.border, backgroundColor: palette.background, marginTop: 4, minHeight: 72 },
                  fieldErrors.bookingDescription && styles.inputErrorBorder,
                ]}
              />
              {fieldErrors.bookingDescription ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.bookingDescription}</Text>
                </View>
              ) : null}
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
            <View
              onLayout={(e) => { fieldYCoords.current.referralCode = e.nativeEvent.layout.y; }}
              style={styles.fieldGroup}
            >
              <Text style={[styles.inputLabel, { color: fieldErrors.referralCode ? "#DC2626" : palette.muted }]}>
                {isReferralLocked ? "Referral Attribution (Locked to Inviter)" : "Referral Code (Optional)"}
              </Text>
              <TextInput
                ref={referralInputRef}
                value={referralCode}
                onChangeText={
                  isReferralLocked
                    ? undefined
                    : (val) => {
                        setReferralCode(val);
                        validateFieldOnChange("referralCode", val);
                      }
                }
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
                  fieldErrors.referralCode && styles.inputErrorBorder,
                ]}
              />
              {fieldErrors.referralCode ? (
                <View style={styles.inlineErrorRow}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.inlineErrorText}>{fieldErrors.referralCode}</Text>
                </View>
              ) : isReferralLocked ? (
                <Text style={{ fontSize: 11, color: "#059669", marginTop: 4 }}>
                  ✓ Persisted first-touch referral linked to your account.
                </Text>
              ) : null}
            </View>

            {/* Contact Unlock Policy Box */}
            <View style={[styles.privacyBox, { backgroundColor: dark ? "#1E293B" : "#F8FAFC", borderColor: dark ? "#334155" : "#E2E8F0" }]}>
              <Lock size={16} color={PINK} style={{ marginTop: 2, flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.privacyTitle, { color: palette.text }]}>
                  When Will I Get Vendor Contact Details?
                </Text>
                <Text style={[styles.privacyDesc, { color: palette.muted }]}>
                  After you pay the RoyalLagn booking fee, your booking will be sent for vendor confirmation. Once the vendor accepts, their contact details will be unlocked on your booking ticket. If the vendor rejects your booking, you are eligible for a full refund of your RoyalLagn booking fee. Our team will process your refund, and you can track its status in My Bookings.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Improved Sticky Bottom Payment Bar */}
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
                styles.footerPayTodayLabel,
                { color: palette.muted },
              ]}
              numberOfLines={1}
            >
              PAY TODAY
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
            <Text
              style={[
                styles.footerIncludedSub,
                { color: palette.muted },
              ]}
              numberOfLines={1}
            >
              Included in {money(financials.totalAmount)} total
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              pendingVerification
                ? "Retry Payment Verification"
                : financials.bookingFee === 0
                ? "Confirm booking free"
                : "Pay booking fee"
            }
            onPress={() => {
              if (pendingVerification) {
                void executePaymentVerification(pendingVerification);
              } else {
                void handlePayAdvance();
              }
            }}
            disabled={submitting || isVerifyingPayment}
            style={[
              styles.payBtn,
              !desktop && styles.payBtnMobile,
              {
                backgroundColor: pendingVerification ? "#D97706" : PINK,
                opacity: submitting || isVerifyingPayment ? 0.7 : 1,
              },
            ]}
          >
            {submitting || isVerifyingPayment ? (
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
                  {pendingVerification
                    ? "Retry Verification"
                    : !user
                    ? "Sign In to Book"
                    : financials.bookingFee === 0
                    ? "Confirm Booking (Free)"
                    : `Pay ${money(financials.bookingFee)} Now`}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </AnimatedBottomSheet>

      {/* Booking Calendar Modal for Date Selection */}
      <BookingCalendarModal
        visible={calendarModalVisible}
        vendorId={vendorId}
        vendorName={vendorName}
        initialStartDate={startDate}
        initialEndDate={endDate}
        dark={dark}
        onClose={() => setCalendarModalVisible(false)}
        onConfirmDates={({ startDate: sDate, endDate: eDate, totalDays: days }) => {
          setStartDate(sDate);
          setTotalDays(days);
          setCalendarModalVisible(false);
          validateFieldOnChange("startDate", sDate);
        }}
      />

      {/* Viewport Validation Alert Modal */}
      <Modal
        visible={validationPopup.visible}
        transparent
        animationType="fade"
        onRequestClose={handleDismissAlert}
      >
        <View style={styles.alertModalBackdrop}>
          <View style={[styles.alertModalCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.alertIconCircle}>
              <AlertCircle size={28} color="#DC2626" />
            </View>
            <Text style={[styles.alertModalTitle, { color: palette.text }]}>
              {validationPopup.title || "Required Information"}
            </Text>
            <Text style={[styles.alertModalMessage, { color: palette.muted }]}>
              {validationPopup.message}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss validation alert"
              onPress={handleDismissAlert}
              style={[styles.alertModalBtn, { backgroundColor: PINK }]}
            >
              <Text style={styles.alertModalBtnText}>OK, Got It</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  priceBreakdownSection: {
    marginTop: 2,
  },
  priceBreakdownHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  priceBreakdownTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  breakdownItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 3,
  },
  breakdownItemLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  breakdownItemPrice: {
    fontSize: 13,
    fontWeight: "700",
  },
  breakdownDivider: {
    height: 1,
    marginVertical: 8,
  },
  breakdownTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  breakdownTotalVal: {
    fontSize: 16,
    fontWeight: "900",
  },
  splitCardsContainer: {
    gap: 8,
    marginVertical: 6,
  },
  splitCardNow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  splitCardNowTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  splitCardNowPrice: {
    fontSize: 16,
    fontWeight: "900",
  },
  splitCardVendor: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  splitCardVendorTitle: {
    fontSize: 12,
    fontWeight: "800",
  },
  splitCardVendorPrice: {
    fontSize: 15,
    fontWeight: "800",
  },
  splitCardSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  includedFeeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  includedFeeText: {
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
    flex: 1,
  },
  compactExplRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  compactExplText: {
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerMobile: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  footerInfo: {
    flexShrink: 0,
  },
  footerInfoMobile: {
    flexShrink: 0,
    justifyContent: "center",
  },
  footerPayTodayLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  footerIncludedSub: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
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
  inputErrorBorder: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
  },
  cardErrorBorder: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
  },
  timeGroupError: {
    borderColor: "#EF4444",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 4,
  },
  inlineErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
  },
  inlineErrorText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "600",
  },
  alertModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  alertModalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  alertIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  alertModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  alertModalMessage: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginBottom: 20,
  },
  alertModalBtn: {
    width: "100%",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  alertModalBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  verificationAlertCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  verificationAlertTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  verificationAlertDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
});

