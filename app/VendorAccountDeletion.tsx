import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import { useRouter } from "expo-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Mail, RotateCcw, ShieldCheck, XCircle } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorAuth } from "@/context/VendorAuthContext";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { getVendorDeletionStatus, sendVendorDeletionOtp, submitVerifiedVendorDeletion, verifyVendorDeletionOtp, type VendorDeletionStatus } from "@/services/accountDeletion";
import { supabase } from "@/services/supabase";

type Step = "details" | "otp" | "verified" | "submitted";
const ScrollView = (props: React.ComponentProps<typeof KeyboardAwareScrollView>) => <KeyboardAwareScrollView {...props} avoidKeyboardOnAndroid />;

export default function VendorAccountDeletion() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { resolution } = useVendorAuth();
  const { data, loading } = useVendorWorkspace();
  const vendor = data.vendor;
  const userId = resolution?.vendor?.profile_id ?? "";
  const [step, setStep] = useState<Step>("details");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [requestStatus, setRequestStatus] = useState<VendorDeletionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => step === "verified" && reason.trim().length >= 5 && !busy, [busy, reason, step]);
  useEffect(() => { void supabase.auth.getUser().then(({ data: authData }) => setEmail(authData.user?.email?.trim().toLowerCase() ?? "")); }, []);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    setStatusLoading(true);
    void getVendorDeletionStatus()
      .then((status) => { if (active) setRequestStatus(status); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to check your deletion request status."); })
      .finally(() => { if (active) setStatusLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong."); }
    finally { setBusy(false); }
  };
  const sendOtp = () => run(async () => {
    if (!userId) throw new Error("Your vendor session is not ready. Please sign in again.");
    const destination = await sendVendorDeletionOtp(userId);
    setEmail(destination); setStep("otp");
  });
  const verifyOtp = () => run(async () => {
    if (otp.trim().length < 6) throw new Error("Enter the OTP sent to your registered email.");
    await verifyVendorDeletionOtp(userId, email, otp);
    setStep("verified");
  });
  const submit = () => run(async () => {
    const nextReference = await submitVerifiedVendorDeletion(reason.trim());
    setReference(nextReference); setRequestStatus({ reference: nextReference, status: "verified", requestedAt: new Date().toISOString(), decisionReason: null }); setStep("submitted");
  });

  if (step === "submitted") return <View style={[styles.page, { backgroundColor: colors.background }]}><VendorHeader unread={0} /><View style={styles.successWrap}><View style={[styles.successIcon, { backgroundColor: `${colors.success}18` }]}><CheckCircle2 size={34} color={colors.success} /></View><Text style={[styles.title, { color: colors.text }]}>Request sent to Admin</Text><Text style={[styles.center, { color: colors.muted }]}>Your vendor profile remains active until an administrator reviews and approves the request.</Text><View style={[styles.reference, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.muted }}>Request reference</Text><Text selectable style={[styles.refText, { color: colors.text }]}>{reference}</Text></View><Pressable onPress={() => router.replace("/VendorSettings")} style={[styles.primary, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Done</Text></Pressable></View></View>;

  if (statusLoading) return <View style={[styles.page, { backgroundColor: colors.background }]}><VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} /><View style={styles.statusLoading}><ActivityIndicator color={colors.pink} /><Text style={[styles.help, { color: colors.muted }]}>Checking deletion request status…</Text></View></View>;

  if (requestStatus && requestStatus.status !== "rejected") return <View style={[styles.page, { backgroundColor: colors.background }]}><VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} /><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={18} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "700" }}>Settings</Text></Pressable><View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.successIcon, { backgroundColor: `${colors.warning}12` }]}><Clock3 size={34} color={colors.warning} /></View><Text style={[styles.title, styles.stateTitle, { color: colors.text }]}>Deletion request pending</Text><Text style={[styles.center, { color: colors.muted }]}>Admin has not decided yet. Your account and vendor profile remain active while the request is reviewed.</Text><View style={[styles.reference, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}><Text style={{ color: colors.muted }}>Request reference</Text><Text selectable style={[styles.refText, { color: colors.text }]}>{requestStatus.reference}</Text><Text style={[styles.requestedAt, { color: colors.muted }]}>Submitted {new Date(requestStatus.requestedAt).toLocaleString()}</Text></View><Pressable onPress={() => router.replace("/VendorSettings")} style={[styles.primary, styles.statusAction, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Back to settings</Text></Pressable></View></ScrollView></View>;

  if (requestStatus?.status === "rejected") return <View style={[styles.page, { backgroundColor: colors.background }]}><VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} /><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={18} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "700" }}>Settings</Text></Pressable><View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.successIcon, { backgroundColor: `${colors.warning}12` }]}><XCircle size={34} color={colors.warning} /></View><Text style={[styles.title, styles.stateTitle, { color: colors.text }]}>Previous request rejected</Text><Text style={[styles.center, { color: colors.muted }]}>Your vendor account remains active. You can submit a new deletion request after verifying your email again.</Text>{requestStatus.decisionReason ? <View style={[styles.reference, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}><Text style={{ color: colors.muted }}>Admin reason</Text><Text selectable style={[styles.rejectionReason, { color: colors.text }]}>{requestStatus.decisionReason}</Text></View> : null}<Pressable accessibilityRole="button" onPress={() => { setRequestStatus(null); setStep("details"); setOtp(""); setReason(""); setError(""); }} style={[styles.primary, styles.statusAction, { backgroundColor: colors.pink }]}><RotateCcw size={17} color="#fff" /><Text style={[styles.primaryText, { marginLeft: 8 }]}>Submit a new request</Text></Pressable></View></ScrollView></View>;

  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={18} color={colors.text} /><Text style={{ color: colors.text, fontWeight: "700" }}>Settings</Text></Pressable>
      <Text style={[styles.eyebrow, { color: colors.warning }]}>ACCOUNT CONTROL</Text><Text style={[styles.title, { color: colors.text }]}>Delete vendor account</Text>
      <View style={[styles.warning, { backgroundColor: `${colors.warning}10`, borderColor: `${colors.warning}45` }]}><AlertTriangle size={22} color={colors.warning} /><Text style={[styles.warningText, { color: colors.text }]}>After Admin approval, the public profile, portfolio, services and vendor workspace are permanently removed. This cannot be undone.</Text></View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Vendor details</Text>
        {loading ? <ActivityIndicator color={colors.pink} /> : <>
          <Detail label="Business" value={vendor?.business_name} colors={colors} />
          <Detail label="Owner" value={vendor?.owner_name} colors={colors} />
          <Detail label="Registered email" value={email || "Loading registered email…"} colors={colors} />
          <Detail label="Phone" value={vendor?.contact_phone} colors={colors} />
          <Detail label="Plan status" value={data.subscription?.status || vendor?.subscription_status} colors={colors} />
        </>}
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.stepTitle}><Mail size={19} color={colors.pink} /><Text style={[styles.section, { color: colors.text }]}>Verify registered email</Text></View>
        {step === "details" && <Pressable disabled={busy || loading} onPress={sendOtp} style={[styles.primary, { backgroundColor: colors.pink, opacity: busy ? .65 : 1 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send email OTP</Text>}</Pressable>}
        {step === "otp" && <><Text style={[styles.help, { color: colors.muted }]}>Enter the code sent to {email}.</Text><TextInput value={otp} onChangeText={setOtp} keyboardType="number-pad" autoComplete="one-time-code" placeholder="Enter OTP" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} /><View style={styles.actions}><Pressable disabled={busy} onPress={sendOtp} style={[styles.secondary, { borderColor: colors.border }]}><Text style={{ color: colors.text, fontWeight: "700" }}>Resend</Text></Pressable><Pressable disabled={busy} onPress={verifyOtp} style={[styles.primary, styles.flexButton, { backgroundColor: colors.pink }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify OTP</Text>}</Pressable></View></>}
        {(step === "verified") && <View style={styles.verified}><ShieldCheck size={18} color={colors.success} /><Text style={{ color: colors.success, fontWeight: "700" }}>Email verified</Text></View>}
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: step === "verified" ? 1 : .58 }]}>
        <Text style={[styles.section, { color: colors.text }]}>Reason for deletion</Text><TextInput editable={step === "verified"} multiline value={reason} onChangeText={setReason} maxLength={1000} placeholder="Tell Admin why you want to delete this account" placeholderTextColor={colors.muted} style={[styles.reason, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft }]} />
        <Pressable disabled={!canSubmit} onPress={() => Alert.alert("Submit deletion request?", "Your account stays active until Admin approves it.", [{ text: "Cancel", style: "cancel" }, { text: "Submit request", style: "destructive", onPress: submit }])} style={[styles.danger, { backgroundColor: colors.warning, opacity: canSubmit ? 1 : .45 }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit deletion request</Text>}</Pressable>
      </View>
      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.warning }]}>{error}</Text>}
    </ScrollView>
  </View>;
}

function Detail({ label, value, colors }: { label: string; value?: string | null; colors: typeof vendorTheme.light }) { return <View style={[styles.detailRow, { borderTopColor: colors.border }]}><Text style={[styles.label, { color: colors.muted }]}>{label}</Text><Text style={[styles.value, { color: colors.text }]}>{value || "Not provided"}</Text></View>; }
const styles = StyleSheet.create({ page:{flex:1},content:{width:"100%",maxWidth:720,alignSelf:"center",padding:16,paddingBottom:40},back:{height:42,flexDirection:"row",alignItems:"center",gap:7,alignSelf:"flex-start"},eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.4,marginTop:8},title:{fontSize:28,fontWeight:"800",marginTop:5,marginBottom:14},warning:{borderWidth:1,borderRadius:18,padding:15,flexDirection:"row",alignItems:"flex-start",gap:11,marginBottom:14},warningText:{flex:1,fontSize:13,lineHeight:20},card:{borderWidth:1,borderRadius:20,padding:15,marginBottom:13},section:{fontSize:16,fontWeight:"800"},stepTitle:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:13},detailRow:{borderTopWidth:StyleSheet.hairlineWidth,paddingVertical:12,marginTop:10},label:{fontSize:11,fontWeight:"700",textTransform:"uppercase",letterSpacing:.7},value:{fontSize:14,fontWeight:"600",marginTop:4},help:{fontSize:13,lineHeight:19,marginBottom:10},input:{height:50,borderWidth:1,borderRadius:13,paddingHorizontal:14,fontSize:17,letterSpacing:4},reason:{minHeight:110,borderWidth:1,borderRadius:14,padding:13,textAlignVertical:"top",marginTop:12,marginBottom:12},primary:{minHeight:48,borderRadius:14,alignItems:"center",justifyContent:"center",paddingHorizontal:18},primaryText:{color:"#fff",fontWeight:"800"},secondary:{minHeight:48,borderRadius:14,borderWidth:1,alignItems:"center",justifyContent:"center",paddingHorizontal:16},actions:{flexDirection:"row",gap:10,marginTop:11},flexButton:{flex:1},verified:{minHeight:48,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},danger:{minHeight:48,borderRadius:14,alignItems:"center",justifyContent:"center"},error:{fontSize:13,lineHeight:19,fontWeight:"600",marginBottom:18},successWrap:{flex:1,maxWidth:540,width:"100%",alignSelf:"center",alignItems:"center",justifyContent:"center",padding:28},successIcon:{width:72,height:72,borderRadius:24,alignItems:"center",justifyContent:"center",marginBottom:8},center:{textAlign:"center",fontSize:14,lineHeight:21,marginBottom:18},reference:{width:"100%",borderWidth:1,borderRadius:16,padding:16,alignItems:"center",marginBottom:16},refText:{fontSize:17,fontWeight:"800",letterSpacing:1,marginTop:5},statusLoading:{flex:1,alignItems:"center",justifyContent:"center",gap:12,padding:24},stateCard:{width:"100%",maxWidth:540,alignSelf:"center",borderWidth:1,borderRadius:20,padding:22,alignItems:"center",marginTop:32},stateTitle:{textAlign:"center",marginTop:8},requestedAt:{fontSize:12,marginTop:8,textAlign:"center"},rejectionReason:{fontSize:14,lineHeight:21,fontWeight:"600",marginTop:7,textAlign:"center"},statusAction:{width:"100%",flexDirection:"row"} });
