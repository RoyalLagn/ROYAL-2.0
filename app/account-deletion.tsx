import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { CheckCircle2, ShieldCheck, Store, Trash2, UserRound } from "lucide-react-native";
import { useRouter } from "expo-router";
import Pressable from "@/components/InteropSafePressable";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { deleteVerifiedCustomerAccount, requestAccountDeletion, sendCustomerDeletionOtp, verifyCustomerDeletionOtp, type AccountDeletionType } from "@/services/accountDeletion";
import { clearInvalidSupabaseSession, supabase } from "@/services/supabase";
import { typeLeading, typeScale } from "@/constants/typography";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 8;

export default function AccountDeletion() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const { session, profile, loading: authLoading } = usePublicAuth();
  const colors = vendorTheme[colorScheme];
  const compact = width < 640;
  const isCustomer = Boolean(session?.user.id && profile?.role === "public_user");
  const [accountType, setAccountType] = useState<AccountDeletionType>("customer");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [successMode, setSuccessMode] = useState<"requested" | "deleted">("requested");
  const [otp, setOtp] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);

  const submitRequest = async () => {
    setError("");
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter the email address associated with your RoyalLagn account.");
    if (!confirmed) return setError("Confirm that you understand this request may permanently delete your account and data.");
    setSubmitting(true);
    try { setSuccessMode("requested"); setReference(await requestAccountDeletion({ accountType, email, fullName, phone, reason })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit the deletion request."); }
    finally { setSubmitting(false); }
  };

  const sendDeletionOtp = async () => {
    if (!session?.user.id || submitting) return;
    setError(""); setSubmitting(true);
    try { setOtpEmail(await sendCustomerDeletionOtp(session.user.id)); setOtp(""); setOtpVerified(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to send the deletion OTP."); }
    finally { setSubmitting(false); }
  };

  const verifyDeletionOtp = async () => {
    if (!session?.user.id || !otpEmail || otp.length !== OTP_LENGTH || submitting) return;
    setError(""); setSubmitting(true);
    try { await verifyCustomerDeletionOtp(session.user.id, otpEmail, otp); setOtpVerified(true); }
    catch (caught) { setOtp(""); setError(caught instanceof Error ? caught.message : "Unable to verify the deletion OTP."); }
    finally { setSubmitting(false); }
  };

  const confirmPermanentDeletion = () => Platform.OS === "web"
    ? Promise.resolve(globalThis.confirm?.("Permanently delete your RoyalLagn customer account? This cannot be undone.") === true)
    : new Promise<boolean>((resolve) => Alert.alert("Delete account permanently?", "Your customer account and personal profile cannot be recovered.", [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) }, { text: "Delete permanently", style: "destructive", onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }));

  const permanentlyDeleteCustomer = async () => {
    if (!otpVerified || !confirmed || submitting || !(await confirmPermanentDeletion())) return;
    setError(""); setSubmitting(true);
    try {
      setSuccessMode("deleted");
      setReference(await deleteVerifiedCustomerAccount());
      await supabase.auth.signOut({ scope: "local" }).catch(() => clearInvalidSupabaseSession());
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to delete your account."); }
    finally { setSubmitting(false); }
  };

  return <KeyboardAwareScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
    <View style={[styles.shell, { maxWidth: compact ? 560 : 760 }]}>
      <Pressable onPress={() => router.replace("/")} accessibilityRole="link" style={styles.brandLink}><Text style={[styles.brand, { color: colors.pink }]}>RoyalLagn</Text></Pressable>
      {authLoading ? <ActivityIndicator color={colors.pink} /> : reference ? <Success reference={reference} mode={successMode} colors={colors} onHome={() => router.replace("/")} /> : <>
        <View style={styles.heading}><View style={[styles.heroIcon, { backgroundColor: `${colors.warning}12` }]}><Trash2 size={26} color={colors.warning} /></View><Text style={[styles.title, { color: colors.text }]}>{isCustomer ? "Delete customer account" : "Request account deletion"}</Text><Text style={[styles.body, { color: colors.muted }]}>{isCustomer ? "Verify your account email before permanently deleting your RoyalLagn customer account." : "Use this public form to request deletion of a RoyalLagn customer account or vendor profile."}</Text></View>
        {isCustomer ? <CustomerDeletionCard colors={colors} email={session?.user.email ?? ""} otp={otp} otpSent={Boolean(otpEmail)} otpVerified={otpVerified} confirmed={confirmed} submitting={submitting} error={error} onOtpChange={(value: string) => { setOtp(value); setError(""); }} onConfirm={() => setConfirmed((value) => !value)} onSend={() => void sendDeletionOtp()} onVerify={() => void verifyDeletionOtp()} onDelete={() => void permanentlyDeleteCustomer()} /> : <RequestDeletionCard colors={colors} compact={compact} accountType={accountType} setAccountType={setAccountType} email={email} setEmail={setEmail} fullName={fullName} setFullName={setFullName} phone={phone} setPhone={setPhone} reason={reason} setReason={setReason} confirmed={confirmed} setConfirmed={setConfirmed} submitting={submitting} error={error} onSubmit={() => void submitRequest()} />}
        <View style={[styles.info, { borderColor: colors.border }]}><ShieldCheck size={20} color={colors.pink} /><Text style={[styles.note, { color: colors.muted }]}>{isCustomer ? "Only the signed-in customer can use this OTP-verified deletion flow. Vendor and administrator accounts are blocked." : "For security, RoyalLagn verifies ownership before processing. Vendor deletion includes the vendor workspace and public business profile associated with the verified account."}</Text></View>
      </>}
    </View>
  </KeyboardAwareScrollView>;
}

function CustomerDeletionCard({ colors, email, otp, otpSent, otpVerified, confirmed, submitting, error, onOtpChange, onConfirm, onSend, onVerify, onDelete }: any) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.text }]}>Account email</Text><View style={[styles.lockedEmail, { backgroundColor: colors.background, borderColor: colors.border }]}><Text selectable style={[styles.lockedEmailText, { color: colors.text }]}>{email}</Text><ShieldCheck size={18} color={colors.pink} /></View><Text style={[styles.note, { color: colors.muted }]}>We will send a fresh {OTP_LENGTH}-digit verification code to this email. It must be verified before deletion.</Text>
    {!otpSent ? <ActionButton label="Send deletion OTP" loadingLabel="Sending OTP…" loading={submitting} icon={ShieldCheck} color={colors.pink} onPress={onSend} /> : !otpVerified ? <><View style={styles.otpSection}><OtpCodeField length={OTP_LENGTH} value={otp} onChange={onOtpChange} disabled={submitting} /></View><ActionButton label="Verify OTP" loadingLabel="Verifying…" loading={submitting} disabled={otp.length !== OTP_LENGTH} icon={ShieldCheck} color={colors.pink} onPress={onVerify} /><Pressable disabled={submitting} onPress={onSend} style={styles.secondaryAction}><Text style={[styles.secondaryText, { color: colors.pink }]}>Resend OTP</Text></Pressable></> : <><View style={[styles.verified, { backgroundColor: `${colors.success}12` }]}><CheckCircle2 size={19} color={colors.success} /><Text style={[styles.verifiedText, { color: colors.success }]}>Email verified for account deletion</Text></View><Text style={[styles.warningTitle, { color: colors.warning }]}>This action cannot be undone</Text><Text style={[styles.note, { color: colors.muted }]}>Your customer profile, favourites, saved activity, notifications, push tokens and reviews will be removed. Retained enquiry records will be anonymized.</Text><Confirmation checked={confirmed} onPress={onConfirm} colors={colors} text="I understand that my customer account will be permanently deleted and cannot be recovered." /><ActionButton label="Delete my account permanently" loadingLabel="Deleting account…" loading={submitting} disabled={!confirmed} icon={Trash2} color={colors.warning} onPress={onDelete} /></>}
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.warning }]}>{error}</Text> : null}</View>;
}

function RequestDeletionCard({ colors, compact, accountType, setAccountType, email, setEmail, fullName, setFullName, phone, setPhone, reason, setReason, confirmed, setConfirmed, submitting, error, onSubmit }: any) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.text }]}>What should we delete?</Text><View style={[styles.typeRow, compact && styles.typeColumn]}><TypeButton active={accountType === "customer"} icon={UserRound} title="Customer account" detail="Profile, favourites and customer activity" onPress={() => setAccountType("customer")} colors={colors} /><TypeButton active={accountType === "vendor"} icon={Store} title="Vendor profile" detail="Vendor workspace and public business profile" onPress={() => setAccountType("vendor")} colors={colors} /></View><Field label="Account email" value={email} onChange={setEmail} placeholder="you@example.com" colors={colors} /><View style={[styles.twoUp, compact && styles.typeColumn]}><View style={styles.flex}><Field label="Full name (optional)" value={fullName} onChange={setFullName} placeholder="Your name" colors={colors} /></View><View style={styles.flex}><Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="Account phone" colors={colors} /></View></View><Field label="Reason (optional)" value={reason} onChange={setReason} placeholder="Tell us anything that helps us locate or process the account" colors={colors} multiline /><Confirmation checked={confirmed} onPress={() => setConfirmed((value: boolean) => !value)} colors={colors} text="I understand that verified deletion may be permanent and that legally required payment, security, fraud-prevention or dispute records may be retained." />{error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.warning }]}>{error}</Text> : null}<ActionButton label="Request deletion" loadingLabel="Submitting request…" loading={submitting} icon={Trash2} color={colors.pink} onPress={onSubmit} /></View>;
}

function Success({ reference, mode, colors, onHome }: any) { const deleted = mode === "deleted"; return <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.successIcon, { backgroundColor: `${colors.success}15` }]}><CheckCircle2 size={30} color={colors.success} /></View><Text style={[styles.title, { color: colors.text }]}>{deleted ? "Account deletion completed" : "Deletion request received"}</Text><Text style={[styles.body, { color: colors.muted }]}>{deleted ? "Your customer account has been permanently deleted. Keep this confirmation reference for your records." : "We will verify account ownership before processing this request. Keep the reference for your records."}</Text><Text selectable style={[styles.reference, { color: colors.text, borderColor: colors.border }]}>{reference}</Text><Pressable onPress={onHome} style={[styles.submit, { backgroundColor: colors.pink, paddingHorizontal: 24 }]}><Text style={styles.submitText}>Return home</Text></Pressable></View>; }
function Confirmation({ checked, onPress, colors, text }: any) { return <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.confirmRow}><View style={[styles.checkbox, { borderColor: checked ? colors.pink : colors.border, backgroundColor: checked ? colors.pink : "transparent" }]}>{checked ? <CheckCircle2 size={17} color="#FFF" /> : null}</View><Text style={[styles.confirmText, { color: colors.text }]}>{text}</Text></Pressable>; }
function ActionButton({ label, loadingLabel, loading, disabled, icon: Icon, color, onPress }: any) { return <Pressable disabled={loading || disabled} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.submit, { backgroundColor: color }, (pressed || loading || disabled) && styles.pressed]}>{loading ? <ActivityIndicator color="#FFF" /> : <Icon size={18} color="#FFF" />}<Text style={styles.submitText}>{loading ? loadingLabel : label}</Text></Pressable>; }
function TypeButton({ active, icon: Icon, title, detail, onPress, colors }: any) { return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.typeButton, { borderColor: active ? colors.pink : colors.border, backgroundColor: active ? `${colors.pink}0D` : colors.background }]}><Icon size={21} color={active ? colors.pink : colors.muted} /><View style={styles.flex}><Text style={[styles.typeTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.typeDetail, { color: colors.muted }]}>{detail}</Text></View></Pressable>; }
function Field({ label, value, onChange, placeholder, colors, multiline = false }: any) { return <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} multiline={multiline} autoCapitalize="none" style={[styles.input, multiline && styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} /></View>; }

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, paddingVertical: 32 }, shell: { width: "100%", alignSelf: "center" }, brandLink: { alignSelf: "center", padding: 8, marginBottom: 22 }, brand: { fontSize: typeScale.sectionTitle, fontWeight: "800" }, heading: { alignItems: "center", marginBottom: 22 }, heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 }, title: { fontSize: typeScale.metric, fontWeight: "800", textAlign: "center" }, body: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center", marginTop: 8, maxWidth: 620 }, card: { borderWidth: 1, borderRadius: 22, padding: 20 }, typeRow: { flexDirection: "row", gap: 12, marginTop: 9, marginBottom: 10 }, typeColumn: { flexDirection: "column" }, typeButton: { flex: 1, minHeight: 76, borderWidth: 1.5, borderRadius: 15, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, typeTitle: { fontSize: typeScale.metadata, fontWeight: "700" }, typeDetail: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 }, field: { marginTop: 13 }, label: { fontSize: typeScale.metadata, fontWeight: "700", marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: typeScale.body }, textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" }, twoUp: { flexDirection: "row", gap: 12 }, flex: { flex: 1, minWidth: 0 }, confirmRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 18 }, checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1.5, alignItems: "center", justifyContent: "center" }, confirmText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label }, error: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, fontWeight: "600", marginTop: 12 }, submit: { minHeight: 52, borderRadius: 15, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, submitText: { color: "#FFF", fontSize: typeScale.body, fontWeight: "700" }, pressed: { opacity: 0.55, transform: [{ scale: 0.99 }] }, info: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, note: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 8 }, successCard: { borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center" }, successIcon: { width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 }, reference: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, fontSize: typeScale.body, fontWeight: "800", letterSpacing: 1.2, marginVertical: 18 }, lockedEmail: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }, lockedEmailText: { flex: 1, minWidth: 0, fontSize: typeScale.body }, otpSection: { marginTop: 18 }, secondaryAction: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 }, secondaryText: { fontSize: typeScale.metadata, fontWeight: "700" }, verified: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 }, verifiedText: { flex: 1, fontSize: typeScale.metadata, fontWeight: "700" }, warningTitle: { fontSize: typeScale.body, fontWeight: "800", marginTop: 18, marginBottom: 6 },
});
