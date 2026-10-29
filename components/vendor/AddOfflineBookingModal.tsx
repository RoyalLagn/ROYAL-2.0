import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Calendar,
  CheckCircle2,
  IndianRupee,
  Package,
  Phone,
  Receipt,
  User,
  X,
} from "lucide-react-native";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, fonts } from "@/constants/typography";
import { VendorTransactionsService } from "@/services/vendorTransactions";
import { useAppFeedback } from "@/context/AppFeedbackContext";

const EVENT_TYPES = [
  "Wedding",
  "Reception",
  "Pre-Wedding",
  "Engagement",
  "Photography & Film",
  "Catering",
  "Makeup & Hair",
  "Decor & Stage",
  "DJ & Sound",
  "Birthday / Anniversary",
  "Corporate",
  "Other Event",
];

const PAYMENT_METHODS: ("Cash" | "UPI" | "Bank Transfer" | "Card" | "Cheque")[] = [
  "Cash",
  "UPI",
  "Bank Transfer",
  "Card",
  "Cheque",
];

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Props = {
  visible: boolean;
  vendorId: string;
  initialDate?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AddOfflineBookingModal({
  visible,
  vendorId,
  initialDate,
  onClose,
  onSuccess,
}: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 720;
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const { showSuccess } = useAppFeedback();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [eventDate, setEventDate] = useState(() => initialDate || isoToday());
  const [eventType, setEventType] = useState("Wedding");
  const [packageTitle, setPackageTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "UPI" | "Bank Transfer" | "Card" | "Cheque">("UPI");
  const [paymentStatus, setPaymentStatus] = useState<"paid_full" | "paid_advance" | "pending">("paid_advance");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialDate) setEventDate(initialDate);
      else setEventDate(isoToday());
    }
  }, [visible, initialDate]);

  const numTotal = Number(totalAmount) || 0;
  const numAdvance = Number(advanceAmount) || 0;
  const dueAmount = Math.max(0, numTotal - numAdvance);

  const applyPercent = (pct: number) => {
    if (!numTotal) return;
    const adv = Math.round((numTotal * pct) / 100);
    setAdvanceAmount(String(adv));
    if (pct === 100) setPaymentStatus("paid_full");
    else if (pct === 0) setPaymentStatus("pending");
    else setPaymentStatus("paid_advance");
  };

  const handleSave = async () => {
    if (!vendorId) {
      Alert.alert("Vendor Required", "Vendor session not found. Please log in.");
      return;
    }
    if (!customerName.trim()) {
      Alert.alert("Name Required", "Please enter the customer name.");
      return;
    }
    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      Alert.alert("Phone Required", "Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      Alert.alert("Invalid Date", "Please enter event date in YYYY-MM-DD format.");
      return;
    }
    if (numTotal <= 0) {
      Alert.alert("Amount Required", "Please enter the total agreed booking amount.");
      return;
    }
    if (numAdvance > numTotal) {
      Alert.alert("Invalid Advance", "Advance received cannot exceed total booking amount.");
      return;
    }

    setSubmitting(true);
    try {
      await VendorTransactionsService.createOfflineTransaction({
        vendorId,
        customerName: customerName.trim(),
        customerPhone: cleanPhone,
        eventDate,
        eventType,
        packageTitle: packageTitle.trim() || `${eventType} Package`,
        totalAmount: numTotal,
        advanceAmount: numAdvance,
        paymentMethod,
        paymentStatus,
        notes: notes.trim() || undefined,
      });

      showSuccess(`Offline booking for ${customerName.trim()} recorded successfully!`);
      // Reset form
      setCustomerName("");
      setCustomerPhone("");
      setPackageTitle("");
      setTotalAmount("");
      setAdvanceAmount("");
      setNotes("");
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert("Save Failed", err instanceof Error ? err.message : "Unable to record offline transaction.");
    } finally {
      setSubmitting(false);
    }
  };

  const colors = useMemo(() => ({
    background: isDark ? "#111827" : "#FFFFFF",
    surface: isDark ? "#1F2937" : "#F9FAFB",
    surfaceHighlight: isDark ? "#374151" : "#F3F4F6",
    text: isDark ? "#F9FAFB" : "#111827",
    muted: isDark ? "#9CA3AF" : "#6B7280",
    border: isDark ? "#374151" : "#E5E7EB",
    pink: brandPalette.light.primary,
    green: "#16A34A",
    amber: "#D97706",
  }), [isDark]);

  return (
    <AnimatedBottomSheet
      visible={visible}
      onRequestClose={onClose}
      variant={desktop ? "center" : "sheet"}
      sheetStyle={[
        styles.sheet,
        desktop && styles.sheetDesktop,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconWrap, { backgroundColor: `${colors.pink}1A` }]}>
            <Receipt size={20} color={colors.pink} />
          </View>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Record Offline Booking</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              Add direct offline customer transaction & sync to calendar
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
        >
          <X size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer Information Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.pink }]}>1. CLIENT DETAILS</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Customer Full Name *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <User size={18} color={colors.muted} />
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="e.g. Ramesh Kulkarni"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Mobile Phone Number *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Phone size={18} color={colors.muted} />
              <TextInput
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={12}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </View>
        </View>

        {/* Event Details Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.pink }]}>2. EVENT & SERVICE</Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Event Date (YYYY-MM-DD) *</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Calendar size={18} color={colors.muted} />
              <TextInput
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.muted}
                maxLength={10}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Event Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {EVENT_TYPES.map((type) => {
                const selected = eventType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setEventType(type)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.pink : colors.surface,
                        borderColor: selected ? colors.pink : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? "#FFFFFF" : colors.text },
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Service / Package Title</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Package size={18} color={colors.muted} />
              <TextInput
                value={packageTitle}
                onChangeText={setPackageTitle}
                placeholder="e.g. 2-Day Complete Coverage Package"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text }]}
              />
            </View>
          </View>
        </View>

        {/* Financial & Payment Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.pink }]}>3. PAYMENT & TRANSACTION</Text>

          <View style={styles.amountGrid}>
            <View style={[styles.amountCol, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Total Booking Amount (₹) *</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IndianRupee size={18} color={colors.text} />
                <TextInput
                  value={totalAmount}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setTotalAmount(clean);
                  }}
                  placeholder="50000"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { color: colors.text, fontWeight: "700" }]}
                />
              </View>
            </View>

            <View style={[styles.amountCol, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Amount Received / Advance (₹) *</Text>
              <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <IndianRupee size={18} color={colors.green} />
                <TextInput
                  value={advanceAmount}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, "");
                    setAdvanceAmount(clean);
                  }}
                  placeholder="15000"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={[styles.input, { color: colors.green, fontWeight: "700" }]}
                />
              </View>
            </View>
          </View>

          {/* Quick Percentage Chips */}
          <View style={styles.quickPercentRow}>
            <Pressable onPress={() => applyPercent(100)} style={[styles.percentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.percentChipText, { color: colors.text }]}>100% Full</Text>
            </Pressable>
            <Pressable onPress={() => applyPercent(50)} style={[styles.percentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.percentChipText, { color: colors.text }]}>50% Advance</Text>
            </Pressable>
            <Pressable onPress={() => applyPercent(30)} style={[styles.percentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.percentChipText, { color: colors.text }]}>30% Advance</Text>
            </Pressable>
            <View style={styles.duePreview}>
              <Text style={[styles.duePreviewLabel, { color: colors.muted }]}>Due Balance:</Text>
              <Text style={[styles.duePreviewValue, { color: dueAmount > 0 ? colors.amber : colors.green }]}>
                ₹{dueAmount.toLocaleString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Payment Method */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Payment Method Received</Text>
            <View style={styles.methodsRow}>
              {PAYMENT_METHODS.map((method) => {
                const selected = paymentMethod === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    style={[
                      styles.methodChip,
                      {
                        backgroundColor: selected ? `${colors.pink}1E` : colors.surface,
                        borderColor: selected ? colors.pink : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.methodChipText, { color: selected ? colors.pink : colors.text, fontWeight: selected ? "700" : "500" }]}>
                      {method}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Payment Status */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Payment Status</Text>
            <View style={styles.methodsRow}>
              {[
                { id: "paid_full", label: "Fully Paid" },
                { id: "paid_advance", label: "Advance Received" },
                { id: "pending", label: "Payment Pending" },
              ].map((st) => {
                const selected = paymentStatus === st.id;
                return (
                  <Pressable
                    key={st.id}
                    onPress={() => setPaymentStatus(st.id as any)}
                    style={[
                      styles.methodChip,
                      {
                        backgroundColor: selected ? (st.id === "paid_full" ? "#ECFDF5" : st.id === "paid_advance" ? "#FEF3C7" : "#FEE2E2") : colors.surface,
                        borderColor: selected ? (st.id === "paid_full" ? "#16A34A" : st.id === "paid_advance" ? "#D97706" : "#DC2626") : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.methodChipText,
                        {
                          color: selected ? (st.id === "paid_full" ? "#16A34A" : st.id === "paid_advance" ? "#B45309" : "#DC2626") : colors.text,
                          fontWeight: selected ? "700" : "500",
                        },
                      ]}
                    >
                      {st.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Notes / Reference */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Notes / Reference Number (Optional)</Text>
            <View style={[styles.inputWrap, styles.textAreaWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. UPI Ref #4092184, cash handed over at office..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={2}
                style={[styles.input, styles.textArea, { color: colors.text }]}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
        >
          <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancel</Text>
        </Pressable>

        <Pressable
          disabled={submitting}
          accessibilityRole="button"
          onPress={handleSave}
          style={({ pressed }) => [
            styles.submitBtn,
            { backgroundColor: colors.pink },
            pressed && { opacity: 0.85 },
            submitting && { opacity: 0.6 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Save Offline Booking</Text>
            </>
          )}
        </Pressable>
      </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  sheetDesktop: {
    maxWidth: 620,
    borderRadius: 24,
    alignSelf: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: typeScale.cardTitle,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: typeScale.caption,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    padding: 20,
    gap: 22,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.sans.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: typeScale.body,
    paddingVertical: 0,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: typeScale.caption,
    fontWeight: "600",
  },
  amountGrid: {
    flexDirection: "row",
    gap: 12,
  },
  amountCol: {
    gap: 6,
  },
  quickPercentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  percentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  percentChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  duePreview: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  duePreviewLabel: {
    fontSize: 12,
  },
  duePreviewValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  methodsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  methodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  methodChipText: {
    fontSize: typeScale.caption,
  },
  textAreaWrap: {
    height: 64,
    alignItems: "flex-start",
    paddingTop: 8,
  },
  textArea: {
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: typeScale.body,
    fontWeight: "700",
  },
});
