import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { CheckCircle2, ShieldCheck, Trash2, UserRound, Store } from "lucide-react-native";
import { useRouter } from "expo-router";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { requestAccountDeletion, type AccountDeletionType } from "@/services/accountDeletion";
import { typeLeading, typeScale } from "@/constants/typography";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountDeletion() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const [accountType, setAccountType] = useState<AccountDeletionType>("customer");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const compact = width < 640;

  const submit = async () => {
    setError("");
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter the email address associated with your RoyalLagn account.");
    if (!confirmed) return setError("Confirm that you understand this request may permanently delete your account and data.");
    setSubmitting(true);
    try {
      setReference(await requestAccountDeletion({ accountType, email, fullName, phone, reason }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit the deletion request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <View style={[styles.shell, { maxWidth: compact ? 560 : 760 }]}>
        <Pressable onPress={() => router.replace("/")} accessibilityRole="link" style={styles.brandLink}>
          <Text style={[styles.brand, { color: colors.pink }]}>RoyalLagn</Text>
        </Pressable>

        {reference ? (
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.successIcon, { backgroundColor: `${colors.success}15` }]}><CheckCircle2 size={30} color={colors.success} /></View>
            <Text style={[styles.title, { color: colors.text }]}>Deletion request received</Text>
            <Text style={[styles.body, { color: colors.muted }]}>We will verify account ownership before deleting any data. Keep this reference for your records.</Text>
            <Text selectable style={[styles.reference, { color: colors.text, borderColor: colors.border }]}>{reference}</Text>
            <Text style={[styles.note, { color: colors.muted }]}>Submitting this form does not immediately delete the account. RoyalLagn may contact you using the account email to verify the request.</Text>
          </View>
        ) : (
          <>
            <View style={styles.heading}>
              <View style={[styles.heroIcon, { backgroundColor: `${colors.warning}12` }]}><Trash2 size={26} color={colors.warning} /></View>
              <Text style={[styles.title, { color: colors.text }]}>Request account deletion</Text>
              <Text style={[styles.body, { color: colors.muted }]}>Use this public form to request deletion of a RoyalLagn customer account or vendor profile.</Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>What should we delete?</Text>
              <View style={[styles.typeRow, compact && styles.typeColumn]}>
                <TypeButton active={accountType === "customer"} icon={UserRound} title="Customer account" detail="Profile, favourites and customer activity" onPress={() => setAccountType("customer")} colors={colors} />
                <TypeButton active={accountType === "vendor"} icon={Store} title="Vendor profile" detail="Vendor workspace and public business profile" onPress={() => setAccountType("vendor")} colors={colors} />
              </View>

              <Field label="Account email" value={email} onChange={setEmail} placeholder="you@example.com" colors={colors} />
              <View style={[styles.twoUp, compact && styles.typeColumn]}>
                <View style={styles.flex}><Field label="Full name (optional)" value={fullName} onChange={setFullName} placeholder="Your name" colors={colors} /></View>
                <View style={styles.flex}><Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="Account phone" colors={colors} /></View>
              </View>
              <Field label="Reason (optional)" value={reason} onChange={setReason} placeholder="Tell us anything that helps us locate or process the account" colors={colors} multiline />

              <Pressable onPress={() => setConfirmed((value) => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={styles.confirmRow}>
                <View style={[styles.checkbox, { borderColor: confirmed ? colors.pink : colors.border, backgroundColor: confirmed ? colors.pink : "transparent" }]}>{confirmed ? <CheckCircle2 size={17} color="#FFF" /> : null}</View>
                <Text style={[styles.confirmText, { color: colors.text }]}>I understand that verified deletion may be permanent and that legally required payment, security, fraud-prevention or dispute records may be retained.</Text>
              </Pressable>

              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.warning }]}>{error}</Text> : null}
              <Pressable disabled={submitting} onPress={submit} accessibilityRole="button" style={({ pressed }) => [styles.submit, { backgroundColor: colors.pink }, (pressed || submitting) && styles.pressed]}>
                {submitting ? <ActivityIndicator color="#FFF" /> : <Trash2 size={18} color="#FFF" />}
                <Text style={styles.submitText}>{submitting ? "Submitting request…" : "Request deletion"}</Text>
              </Pressable>
            </View>

            <View style={[styles.info, { borderColor: colors.border }]}>
              <ShieldCheck size={20} color={colors.pink} />
              <Text style={[styles.note, { color: colors.muted }]}>For security, RoyalLagn verifies ownership before processing. Vendor deletion includes the vendor workspace and public business profile associated with the verified account.</Text>
            </View>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

function TypeButton({ active, icon: Icon, title, detail, onPress, colors }: any) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.typeButton, { borderColor: active ? colors.pink : colors.border, backgroundColor: active ? `${colors.pink}0D` : colors.background }]}>
    <Icon size={21} color={active ? colors.pink : colors.muted} /><View style={styles.flex}><Text style={[styles.typeTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.typeDetail, { color: colors.muted }]}>{detail}</Text></View>
  </Pressable>;
}

function Field({ label, value, onChange, placeholder, colors, multiline = false }: any) {
  return <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} autoCapitalize="none" style={[styles.input, multiline && styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} /></View>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, paddingVertical: 32 }, shell: { width: "100%", alignSelf: "center" }, brandLink: { alignSelf: "center", padding: 8, marginBottom: 22 }, brand: { fontSize: typeScale.sectionTitle, fontWeight: "800" }, heading: { alignItems: "center", marginBottom: 22 }, heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 }, title: { fontSize: typeScale.metric, fontWeight: "800", textAlign: "center" }, body: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center", marginTop: 8, maxWidth: 620 }, card: { borderWidth: 1, borderRadius: 22, padding: 20 }, typeRow: { flexDirection: "row", gap: 12, marginTop: 9, marginBottom: 10 }, typeColumn: { flexDirection: "column" }, typeButton: { flex: 1, minHeight: 76, borderWidth: 1.5, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, typeTitle: { fontSize: typeScale.metadata, fontWeight: "700" }, typeDetail: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 }, field: { marginTop: 13 }, label: { fontSize: typeScale.metadata, fontWeight: "700", marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: typeScale.body }, textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" }, twoUp: { flexDirection: "row", gap: 12 }, flex: { flex: 1, minWidth: 0 }, confirmRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 18 }, checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, confirmText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label }, error: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, fontWeight: "600", marginTop: 12 }, submit: { minHeight: 52, borderRadius: 15, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, submitText: { color: "#FFF", fontSize: typeScale.body, fontWeight: "700" }, pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] }, info: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, note: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label }, successCard: { borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center" }, successIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 }, reference: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, fontSize: typeScale.body, fontWeight: "800", letterSpacing: 1.2, marginVertical: 18 },
});
