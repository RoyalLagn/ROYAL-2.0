import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Pressable from "@/components/InteropSafePressable";
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Lock,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react-native";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { brandPalette } from "@/constants/brandPalette";
import { EnquiryService } from "@/services/enquiries";
import type { VendorPackage } from "@/services/vendorPackages";
import { recordVendorProfileEvent } from "@/services/vendorPublicProfile";
import { useRouter } from "expo-router";
import { supabase } from "@/services/supabase";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

import BookingCalendarModal from "@/components/booking/BookingCalendarModal";

const PINK = brandPalette.light.primary;

export type CustomerEnquiryModalProps = {
  visible: boolean;
  vendorId: string;
  vendorName: string;
  vendorCategory?: string;
  selectedPackage?: VendorPackage | null;
  initialDate?: string | null;
  initialEndDate?: string | null;
  initialMessage?: string | null;
  dark?: boolean;
  onClose: () => void;
  onSuccess?: (referenceCode: string) => void;
};

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const EVENT_TYPES = [
  "Wedding",
  "Reception",
  "Engagement",
  "Pre-wedding",
  "Birthday",
  "Corporate",
  "Anniversary",
  "Other",
] as const;

export default function CustomerEnquiryModal({
  visible,
  vendorId,
  vendorName,
  vendorCategory,
  selectedPackage,
  initialDate,
  initialEndDate,
  initialMessage,
  dark = false,
  onClose,
  onSuccess,
}: CustomerEnquiryModalProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const { isPublicAuthenticated, profile, refreshProfile } = usePublicAuth();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [sameAsPhone, setSameAsPhone] = useState(false);

  // Calendar date range state (1 or multiple days)
  const [startDate, setStartDate] = useState(initialDate || "");
  const [endDate, setEndDate] = useState(initialEndDate || initialDate || "");
  const [totalDays, setTotalDays] = useState(1);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);

  const [eventType, setEventType] = useState<string>("");
  const [message, setMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successRef, setSuccessRef] = useState<string | null>(null);

  const eventDateDisplayText = useMemo(() => {
    if (!startDate) return "";
    const startFormatted = formatDateLabel(startDate);
    if (!endDate || endDate === startDate || totalDays <= 1) {
      return `${startFormatted} (1 Day)`;
    }
    const endFormatted = formatDateLabel(endDate);
    return `${startFormatted} – ${endFormatted} (${totalDays} Days)`;
  }, [startDate, endDate, totalDays]);

  useEffect(() => {
    if (visible) {
      setCustomerName(profile?.full_name || "");
      const cleanPhone = profile?.phone?.replace(/\D/g, "") || "";
      setCustomerPhone(cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone);
      setWhatsappPhone("");
      setSameAsPhone(false);

      if (initialDate) {
        setStartDate(initialDate);
        setEndDate(initialEndDate || initialDate);
        setTotalDays(1);
      } else {
        setStartDate("");
        setEndDate("");
        setTotalDays(1);
      }
      setCalendarPickerOpen(false);

      setEventType("");
      setMessage(
        initialMessage ||
          (selectedPackage
            ? `Hi, I need details, pricing and availability for the "${selectedPackage.title}" package for ${vendorName}.`
            : `Hi, I would like to inquire about services, pricing, and availability for ${vendorName}.`)
      );
      setErrorMessage("");
      setSuccessRef(null);
      setSubmitting(false);
    }
  }, [visible, profile, initialDate, initialEndDate, initialMessage, selectedPackage, vendorName]);

  const toggleSameAsPhone = () => {
    const next = !sameAsPhone;
    setSameAsPhone(next);
    if (next) {
      setWhatsappPhone(customerPhone);
    }
  };

  const handlePhoneChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 10);
    setCustomerPhone(digits);
    if (sameAsPhone) {
      setWhatsappPhone(digits);
    }
    if (errorMessage) setErrorMessage("");
  };

  const handleWhatsAppChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 10);
    setWhatsappPhone(digits);
    if (sameAsPhone && digits !== customerPhone) {
      setSameAsPhone(false);
    }
    if (errorMessage) setErrorMessage("");
  };

  const handleSubmit = async () => {
    if (submitting) return;

    if (!isPublicAuthenticated) {
      onClose();
      router.push("/Login");
      return;
    }

    const trimmedName = customerName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setErrorMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      setErrorMessage("Please provide an enquiry message of at least 10 characters.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      let finalMessage = trimmedMessage;
      if (whatsappPhone && whatsappPhone !== cleanPhone) {
        finalMessage += `\n\n[WhatsApp Contact: +91 ${whatsappPhone}]`;
      }
      if (eventType) {
        finalMessage += `\n[Event Type: ${eventType}]`;
      }
      if (startDate) {
        if (totalDays > 1 && endDate && endDate !== startDate) {
          finalMessage += `\n[Event Duration: ${formatDateLabel(startDate)} to ${formatDateLabel(endDate)} (${totalDays} Days)]`;
        } else {
          finalMessage += `\n[Event Date: ${formatDateLabel(startDate)}]`;
        }
      }

      const res = await EnquiryService.createFormEnquiry({
        vendorId,
        message: finalMessage,
        customerPhone: cleanPhone,
        packageId: selectedPackage?.id ?? null,
        source: selectedPackage?.id ? "package" : "vendor_profile",
        sourceRecordId: selectedPackage?.id ?? vendorId,
        eventDate: startDate.trim() || null,
        eventType: eventType || null,
      });

      if (profile?.id && (!profile.phone || !profile.full_name)) {
        void (async () => {
          try {
            await supabase
              .from("profiles")
              .update({
                phone: cleanPhone,
                full_name: trimmedName,
                updated_at: new Date().toISOString(),
              })
              .eq("id", profile.id);
            await refreshProfile?.();
          } catch {
            // Ignore background profile sync failures
          }
        })();
      }

      void recordVendorProfileEvent(vendorId, "enquiry").catch(() => {});

      setSuccessRef(res.referenceCode);
      onSuccess?.(res.referenceCode);
    } catch (err: any) {
      setErrorMessage(err?.message || "Unable to submit enquiry. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  const bg = dark ? "#120D12" : "#FFFFFF";
  const cardBg = dark ? "#1C141A" : "#FAFAFB";
  const textColor = dark ? "#FFF8FB" : "#181216";
  const mutedColor = dark ? "#B5A6AF" : "#6E6068";
  const borderColor = dark ? "#3D2A35" : "#EFE4EB";
  const inputBg = dark ? "#161015" : "#FFFFFF";

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={submitting ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : onClose}
          accessibilityLabel="Close modal backdrop"
        />
        <View
          style={[
            styles.modalContainer,
            desktop ? styles.modalContainerDesktop : styles.modalContainerMobile,
            { backgroundColor: bg, borderColor },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            <View style={styles.headerIconWrap}>
              <Sparkles size={20} color={PINK} />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.headerTitle, { color: textColor }]}>Send Enquiry</Text>
              <Text numberOfLines={1} style={[styles.headerSubtitle, { color: mutedColor }]}>
                RoyalLagn Admin will coordinate with {vendorName}
              </Text>
            </View>
            <Pressable
              disabled={submitting}
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: cardBg }]}
              accessibilityLabel="Close enquiry modal"
            >
              <X size={18} color={textColor} />
            </Pressable>
          </View>

          {/* Success Screen */}
          {successRef ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconCircle}>
                <CheckCircle2 size={44} color="#10B981" />
              </View>
              <Text style={[styles.successTitle, { color: textColor }]}>Enquiry Submitted!</Text>
              <View style={styles.refCodePill}>
                <Text style={styles.refCodeLabel}>REFERENCE CODE</Text>
                <Text style={styles.refCodeText}>{successRef}</Text>
              </View>
              <Text style={[styles.successNotice, { color: mutedColor }]}>
                Your enquiry has been submitted successfully. Our RoyalLagn team will contact you regarding your enquiry.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.successDoneBtn, { backgroundColor: PINK }]}
              >
                <Text style={styles.successDoneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <KeyboardAwareScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Not Logged In Banner */}
              {!isPublicAuthenticated ? (
                <View style={[styles.authNoticeCard, { borderColor: PINK }]}>
                  <Text style={[styles.authNoticeTitle, { color: textColor }]}>Sign In Required</Text>
                  <Text style={[styles.authNoticeDesc, { color: mutedColor }]}>
                    Please log in to your RoyalLagn account to submit an enquiry. Your enquiry details will be saved.
                  </Text>
                  <Pressable
                    style={[styles.loginBtn, { backgroundColor: PINK }]}
                    onPress={() => {
                      onClose();
                      router.push("/Login");
                    }}
                  >
                    <Text style={styles.loginBtnText}>Log In to Continue</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Vendor & Selected Package Info Banner */}
              <View style={[styles.vendorInfoCard, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.vendorInfoRow}>
                  <Building2 size={16} color={PINK} />
                  <Text style={[styles.vendorInfoName, { color: textColor }]}>{vendorName}</Text>
                  {vendorCategory ? (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryBadgeText}>{vendorCategory.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
                {selectedPackage ? (
                  <View style={styles.packageSelectedRow}>
                    <Text style={[styles.packageSelectedTitle, { color: PINK }]}>
                      Package: {selectedPackage.title}
                    </Text>
                    {selectedPackage.price ? (
                      <Text style={[styles.packageSelectedPrice, { color: textColor }]}>
                        ₹{Number(selectedPackage.price).toLocaleString("en-IN")}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {/* Customer Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Your Full Name *</Text>
                <View style={[styles.inputShell, { backgroundColor: inputBg, borderColor }]}>
                  <User size={16} color={mutedColor} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: textColor }]}
                    placeholder="Enter your full name"
                    placeholderTextColor={mutedColor}
                    value={customerName}
                    onChangeText={(val) => {
                      setCustomerName(val);
                      if (errorMessage) setErrorMessage("");
                    }}
                  />
                </View>
              </View>

              {/* Mobile Number */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Contact Mobile Number *</Text>
                <View style={[styles.inputShell, { backgroundColor: inputBg, borderColor }]}>
                  <Phone size={16} color={mutedColor} style={styles.inputIcon} />
                  <Text style={[styles.phonePrefix, { color: mutedColor }]}>+91</Text>
                  <TextInput
                    style={[styles.input, { color: textColor }]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={mutedColor}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={customerPhone}
                    onChangeText={handlePhoneChange}
                  />
                </View>
                <Text style={[styles.fieldHelp, { color: mutedColor }]}>
                  Our RoyalLagn team will call you to discuss your enquiry.
                </Text>
              </View>

              {/* WhatsApp Number (Optional) */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: textColor }]}>WhatsApp Number (Optional)</Text>
                  {customerPhone.length === 10 ? (
                    <Pressable
                      onPress={toggleSameAsPhone}
                      style={[
                        styles.sameAsPhoneBtn,
                        sameAsPhone && { backgroundColor: `${PINK}15`, borderColor: PINK },
                      ]}
                    >
                      <View style={[styles.checkbox, sameAsPhone && styles.checkboxActive]}>
                        {sameAsPhone ? <Check size={10} color="#FFFFFF" /> : null}
                      </View>
                      <Text style={[styles.sameAsPhoneText, { color: sameAsPhone ? PINK : mutedColor }]}>
                        Same as phone
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={[styles.inputShell, { backgroundColor: inputBg, borderColor }]}>
                  <MessageSquare size={16} color={mutedColor} style={styles.inputIcon} />
                  <Text style={[styles.phonePrefix, { color: mutedColor }]}>+91</Text>
                  <TextInput
                    style={[styles.input, { color: textColor }]}
                    placeholder="10-digit WhatsApp number"
                    placeholderTextColor={mutedColor}
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={whatsappPhone}
                    onChangeText={handleWhatsAppChange}
                  />
                </View>
              </View>

              {/* Event Date (Interactive Calendar Picker) */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: textColor }]}>Event Date (Optional)</Text>
                  {startDate ? (
                    <Pressable
                      onPress={() => {
                        setStartDate("");
                        setEndDate("");
                        setTotalDays(1);
                      }}
                      style={styles.clearDateBtn}
                      accessibilityLabel="Clear selected event date"
                    >
                      <Text style={[styles.clearDateBtnText, { color: PINK }]}>Clear Date</Text>
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={startDate ? `Change event date, currently ${eventDateDisplayText}` : "Select event date from calendar"}
                  onPress={() => setCalendarPickerOpen(true)}
                  style={({ pressed, hovered }) => [
                    styles.datePickerShell,
                    {
                      backgroundColor: inputBg,
                      borderColor: startDate ? PINK : borderColor,
                    },
                    hovered && Platform.OS === "web" && { borderColor: PINK },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.datePickerLeft}>
                    <View style={[styles.dateIconWrap, { backgroundColor: startDate ? `${PINK}15` : `${mutedColor}15` }]}>
                      <Calendar size={18} color={startDate ? PINK : mutedColor} />
                    </View>
                    <View style={styles.dateTextCol}>
                      {startDate ? (
                        <>
                          <Text style={[styles.dateValueText, { color: textColor }]}>
                            {eventDateDisplayText}
                          </Text>
                          <Text style={[styles.dateHintText, { color: mutedColor }]}>
                            Tap to change date or duration
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.datePlaceholderText, { color: mutedColor }]}>
                            Select event date (1 or multiple days)
                          </Text>
                          <Text style={[styles.dateHintText, { color: mutedColor }]}>
                            Tap to open availability calendar
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.dateActionBadge,
                      {
                        backgroundColor: startDate ? `${PINK}15` : cardBg,
                        borderColor: startDate ? PINK : borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateActionBadgeText,
                        { color: startDate ? PINK : mutedColor },
                      ]}
                    >
                      {startDate ? "Change" : "Choose Date"}
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Event Type (Optional Chips) */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Event Type (Optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {EVENT_TYPES.map((type) => {
                    const selected = eventType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setEventType(selected ? "" : type)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? PINK : cardBg,
                            borderColor: selected ? PINK : borderColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? "#FFFFFF" : textColor },
                          ]}
                        >
                          {type}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Requirements & Enquiry Message */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: textColor }]}>Your Requirements / Message *</Text>
                  <Text style={[styles.charCount, { color: message.trim().length >= 10 ? "#10B981" : mutedColor }]}>
                    {message.length} chars (min 10)
                  </Text>
                </View>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: inputBg,
                      borderColor: errorMessage && message.trim().length < 10 ? "#EF4444" : borderColor,
                      color: textColor,
                    },
                  ]}
                  placeholder="e.g. I need photography and videography for my wedding on 24 October. Please confirm package details, pricing and availability."
                  placeholderTextColor={mutedColor}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={message}
                  onChangeText={(val) => {
                    setMessage(val);
                    if (errorMessage) setErrorMessage("");
                  }}
                />
              </View>

              {/* Admin Trust Banner */}
              <View style={[styles.trustBanner, { backgroundColor: `${PINK}0C` }]}>
                <Lock size={14} color={PINK} style={{ marginTop: 2 }} />
                <Text style={[styles.trustBannerText, { color: textColor }]}>
                  Your enquiry is securely reviewed by the RoyalLagn Admin team. We coordinate quotations and availability directly with the vendor for you.
                </Text>
              </View>

              {/* Error Message */}
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <Pressable
                  disabled={submitting}
                  onPress={onClose}
                  style={[styles.cancelBtn, { borderColor }]}
                >
                  <Text style={[styles.cancelBtnText, { color: mutedColor }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={submitting || !isPublicAuthenticated}
                  onPress={handleSubmit}
                  style={[
                    styles.submitBtn,
                    { backgroundColor: PINK, opacity: submitting || !isPublicAuthenticated ? 0.7 : 1 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Send size={16} color="#FFFFFF" />
                      <Text style={styles.submitBtnText}>Submit Enquiry</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </KeyboardAwareScrollView>
          )}
        </View>
      </View>
    </Modal>

    <BookingCalendarModal
      visible={calendarPickerOpen}
      vendorId={vendorId}
      vendorName={vendorName}
      initialStartDate={startDate || undefined}
      initialEndDate={endDate || undefined}
      dark={dark}
      onClose={() => setCalendarPickerOpen(false)}
      onConfirmDates={(selected) => {
        setStartDate(selected.startDate);
        setEndDate(selected.endDate);
        setTotalDays(selected.totalDays);
        setCalendarPickerOpen(false);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContainer: {
    width: "100%",
    maxHeight: "92%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#E73C78",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalContainerDesktop: {
    maxWidth: 580,
    borderRadius: 24,
  },
  modalContainerMobile: {
    maxWidth: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(231, 60, 120, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  authNoticeCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(231, 60, 120, 0.08)",
    gap: 8,
  },
  authNoticeTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  authNoticeDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  loginBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loginBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  vendorInfoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  vendorInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  vendorInfoName: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(231, 60, 120, 0.12)",
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: PINK,
    letterSpacing: 0.5,
  },
  packageSelectedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(231, 60, 120, 0.2)",
  },
  packageSelectedTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  packageSelectedPrice: {
    fontSize: 12,
    fontWeight: "700",
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldHelp: {
    fontSize: 11,
    marginTop: 2,
  },
  charCount: {
    fontSize: 11,
    fontWeight: "500",
  },
  clearDateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clearDateBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  datePickerShell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
  },
  datePickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  dateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTextCol: {
    flex: 1,
    gap: 2,
  },
  dateValueText: {
    fontSize: 13,
    fontWeight: "700",
  },
  datePlaceholderText: {
    fontSize: 13,
    fontWeight: "500",
  },
  dateHintText: {
    fontSize: 11,
  },
  dateActionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateActionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  inputIcon: {
    marginRight: 2,
  },
  phonePrefix: {
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: "100%",
    paddingVertical: 0,
  },
  sameAsPhoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: PINK,
    borderColor: PINK,
  },
  sameAsPhoneText: {
    fontSize: 11,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    lineHeight: 19,
    minHeight: 100,
  },
  trustBanner: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    alignItems: "flex-start",
  },
  trustBannerText: {
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 10,
    padding: 10,
  },
  errorBannerText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  submitBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  successContainer: {
    padding: 32,
    alignItems: "center",
    gap: 16,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  refCodePill: {
    backgroundColor: "rgba(231, 60, 120, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
  },
  refCodeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: PINK,
    letterSpacing: 0.8,
  },
  refCodeText: {
    fontSize: 15,
    fontWeight: "800",
    color: PINK,
    marginTop: 2,
  },
  successNotice: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 400,
  },
  successDoneBtn: {
    marginTop: 8,
    width: "100%",
    maxWidth: 240,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  successDoneBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
