import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { CalendarDays, Send, X } from "lucide-react-native";
import { usePublicAuth } from "@/context/PublicAuthContext";
import type { VendorPackage } from "@/services/vendorPackages";
import { EnquiryService } from "@/services/enquiries";
import { typeScale } from "@/constants/typography";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

type Props = { visible: boolean; vendorId: string; vendorName: string; item: VendorPackage | null; dark?: boolean; onClose: () => void; onSignInRequired: () => void; onSent: () => void };

export default function PackageEnquiryModal({ visible, vendorId, vendorName, item, dark = false, onClose, onSignInRequired, onSent }: Props) {
  const { width } = useWindowDimensions();
  const { session, profile, loading: authLoading, isPublicAuthenticated } = usePublicAuth();
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const colors = { surface: dark ? "#0E141F" : "#FFF", background: dark ? "#171D28" : "#FFF8FA", text: dark ? "#FFF8FB" : "#21171C", muted: dark ? "#BEB2B8" : "#6E6268", border: dark ? "#303744" : "#EFDFE5" };

  useEffect(() => {
    if (!visible || !item) return;
    setPhone(profile?.phone ?? "");
    setEventDate("");
    setEventType("");
    setMessage(`Hi ${vendorName}, I would like more details and availability for the ${item.title} package.`);
  }, [item, profile?.phone, vendorName, visible]);

  const send = async () => {
    if (authLoading) return;
    if (!isPublicAuthenticated || !session?.user.id || !profile || !item) {
      onClose();
      onSignInRequired();
      return;
    }
    if (eventDate && !isValidDate(eventDate)) return Alert.alert("Check event date", "Enter a real date using YYYY-MM-DD.");
    if (message.trim().length < 10) return Alert.alert("Add a message", "Tell the vendor a little about your event.");
    if (sending) return;
    setSending(true);
    try {
      const tracked = await EnquiryService.createFormEnquiry({
        vendorId,
        packageId: item.id,
        source: "package",
        sourceRecordId: item.id,
        eventDate: eventDate || null,
        eventType: eventType || null,
        message,
        customerPhone: phone,
      });
      onClose();
      onSent();
      Alert.alert("Enquiry saved", `${vendorName} received your package enquiry. Reference: ${tracked.referenceCode}`);
    } catch (cause) {
      Alert.alert("Enquiry not sent", cause instanceof Error ? cause.message : "Please try again.");
    } finally { setSending(false); }
  };

  return <AnimatedBottomSheet
    visible={visible}
    onRequestClose={onClose}
    variant={width >= 700 ? "center" : "sheet"}
    sheetStyle={[styles.sheet, width >= 700 && styles.desktop, { backgroundColor: colors.surface, borderColor: colors.border }]}
  >
      <View style={styles.header}><View style={styles.icon}><Send size={20} color={PINK} /></View><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>Enquire about package</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{item?.title}</Text></View><Pressable onPress={onClose} accessibilityLabel="Close enquiry" style={[styles.close, { backgroundColor: colors.background }]}><X size={20} color={colors.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Your contact number" colors={colors} keyboardType="phone-pad" />
        <View style={styles.two}><Field label="Event date" value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" colors={colors} icon={<CalendarDays size={15} color={PINK} />} /><Field label="Event type" value={eventType} onChangeText={setEventType} placeholder="Wedding, reception…" colors={colors} /></View>
        <Field label="Message" value={message} onChangeText={setMessage} placeholder="Tell the vendor what you need" colors={colors} multiline />
      </ScrollView>
      <Pressable disabled={sending || authLoading} onPress={() => void send()} style={[styles.send, (sending || authLoading) && styles.disabled]}>{sending ? <ActivityIndicator color="#FFF" /> : <><Send size={16} color="#FFF" /><Text style={styles.sendText}>{isPublicAuthenticated ? "Send package enquiry" : "Sign in to enquire"}</Text></>}</Pressable>
  </AnimatedBottomSheet>;
}

function Field({ label, colors, icon, multiline, ...props }: any) { return <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>{label}</Text><View style={[styles.inputWrap, multiline && styles.textareaWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>{icon}{<TextInput {...props} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.textarea, { color: colors.text }]} />}</View></View>; }
function isValidDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
const styles = StyleSheet.create({
  sheet: { width: "100%", maxHeight: "92%", borderWidth: 1, padding: 18 }, desktop: { maxWidth: 620, borderRadius: 28, paddingBottom: 26 }, header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }, icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: brandPalette.light.actionTint, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, title: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" }, subtitle: { fontSize: typeScale.caption, marginTop: 2 }, close: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, form: { gap: 12 }, two: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, field: { flex: 1, minWidth: 190 }, label: { fontSize: typeScale.caption, fontWeight: "700", marginBottom: 6 }, inputWrap: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 }, textareaWrap: { minHeight: 110, alignItems: "flex-start", paddingTop: 11 }, input: { flex: 1, fontSize: typeScale.bodyCompact, minHeight: 44 }, textarea: { minHeight: 88, textAlignVertical: "top" }, send: { minHeight: 50, backgroundColor: PINK, borderRadius: 15, marginTop: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, sendText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" }, disabled: { opacity: .55 },
});
