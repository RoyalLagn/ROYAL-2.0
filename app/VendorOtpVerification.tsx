import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import {
  getVendorAuthError,
  sendVendorRecoveryOtp,
  sendVendorSignupOtp,
  verifyVendorOtp,
  type VendorOtpPurpose,
} from "@/services/vendorAuth";
import {
  clearRecoverySession,
  markRecoverySessionActive,
} from "@/services/authRecoverySession";

const OTP_LENGTH = 8;
const param = (value?: string | string[]) => Array.isArray(value) ? value[0] || "" : value || "";

export default function VendorOtpVerification() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; ownerName?: string; phone?: string; purpose?: VendorOtpPurpose }>();
  const email = param(params.email);
  const ownerName = param(params.ownerName);
  const phone = param(params.phone);
  const purpose: VendorOtpPurpose = param(params.purpose) === "recovery" ? "recovery" : "signup";
  const input = useRef<TextInput>(null);
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => setCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);
  const verify = async () => {
    if (otp.length !== OTP_LENGTH) return setError(`Enter the complete ${OTP_LENGTH}-digit OTP.`);
    setLoading(true); setError("");
    try {
      if (purpose === "recovery") markRecoverySessionActive();
      else clearRecoverySession();
      await verifyVendorOtp(email, otp);
      router.replace({ pathname: "/VendorCreatePassword", params: { email, ownerName, phone, purpose } });
    } catch (caught) {
      if (purpose === "recovery") clearRecoverySession();
      setError(getVendorAuthError(caught, "Unable to verify the OTP."));
      setOtp("");
    } finally { setLoading(false); }
  };
  const resend = async () => {
    if (countdown || resending) return;
    setResending(true); setError("");
    try {
      if (purpose === "recovery") await sendVendorRecoveryOtp(email);
      else await sendVendorSignupOtp({ email, ownerName, phone });
      setOtp(""); setCountdown(60);
    } catch (caught) { setError(getVendorAuthError(caught, "Unable to resend the OTP.")); }
    finally { setResending(false); }
  };
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <AuthBackButton fallbackRoute={purpose === "recovery" ? "/VendorForgotPassword" : "/VendorLogin"} />
    <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="items-center mb-9">
        <Text className="text-primary font-bold text-4xl">Royal<Text className="text-foreground">Lagn</Text></Text>
        <Text className="text-foreground text-xl font-bold mt-4">Verify Business Email</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">Enter the OTP sent to{"\n"}{email}</Text>
      </View>
      <Pressable className="flex-row justify-center gap-2 mb-5" onPress={() => input.current?.focus()}>
        {Array.from({ length: OTP_LENGTH }, (_, i) => <View key={i} className={`w-9 h-11 rounded-xl border items-center justify-center bg-card ${i === otp.length ? "border-primary" : "border-border"}`}>
          <Text className="text-foreground text-lg font-bold">{otp[i] || ""}</Text>
        </View>)}
        <TextInput ref={input} value={otp} onChangeText={(v) => { setOtp(v.replace(/\D/g, "").slice(0, OTP_LENGTH)); setError(""); }}
          keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={OTP_LENGTH}
          caretHidden style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} onSubmitEditing={verify} />
      </Pressable>
      <Pressable className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary"}`} onPress={verify} disabled={loading}>
        <Text className="text-white font-semibold">{loading ? "Verifying…" : "Verify OTP"}</Text>
      </Pressable>
      {error ? <Text className="text-red-500 text-sm text-center mt-4">{error}</Text> : null}
      <Pressable className="items-center py-4" onPress={resend} disabled={!!countdown || resending}>
        <Text className="text-primary font-semibold">{resending ? "Sending…" : countdown ? `Resend OTP in ${countdown}s` : "Resend OTP"}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
