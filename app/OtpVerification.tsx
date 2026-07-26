import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import {
  getPublicAuthError,
  sendRecoveryOtp,
  sendSignupOtp,
  verifyPublicEmailOtp,
  type OtpPurpose,
} from "@/services/publicAuth";
import {
  clearRecoverySession,
  markRecoverySessionActive,
} from "@/services/authRecoverySession";

// Keep this aligned with the hosted Supabase Auth email OTP setting.
const OTP_LENGTH = 8;

export default function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    fullName?: string;
    phone?: string;
    purpose?: OtpPurpose;
  }>();
  const value = (item?: string | string[]) => Array.isArray(item) ? item[0] || "" : item || "";
  const email = value(params.email);
  const fullName = value(params.fullName);
  const phone = value(params.phone);
  const purpose: OtpPurpose = value(params.purpose) === "recovery" ? "recovery" : "signup";
  const inputRef = useRef<TextInput>(null);
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const verify = async () => {
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the complete ${OTP_LENGTH}-digit verification code.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (purpose === "recovery") markRecoverySessionActive();
      else clearRecoverySession();
      await verifyPublicEmailOtp(email, otp);
      router.replace({
        pathname: "/CreatePassword",
        params: { email, fullName, phone, purpose },
      });
    } catch (caught) {
      if (purpose === "recovery") clearRecoverySession();
      setError(getPublicAuthError(caught, "Unable to verify the code. Please try again."));
      setOtp("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      if (purpose === "recovery") await sendRecoveryOtp(email);
      else await sendSignupOtp({ email, fullName, phone });
      setOtp("");
      setCountdown(60);
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to resend the code."));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute={purpose === "recovery" ? "/ForgotPassword" : "/Login"} />
      <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center mb-10">
          <Text className="text-primary font-bold text-4xl mb-2">
            Royal<Text className="text-foreground">Lagn</Text>
          </Text>
          <Text className="text-foreground text-xl font-bold">Verify your email</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Enter the {OTP_LENGTH}-digit code sent to{"\n"}{email}
          </Text>
        </View>
        <Pressable onPress={() => inputRef.current?.focus()} className="flex-row justify-between gap-1.5 mb-5">
          {Array.from({ length: OTP_LENGTH }, (_, index) => (
            <View key={index} className={`flex-1 max-w-11 aspect-square rounded-xl border items-center justify-center ${index === otp.length ? "border-primary" : "border-border"} bg-card`}>
              <Text className="text-foreground text-xl font-bold">{otp[index] || ""}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(text) => { setOtp(text.replace(/\D/g, "").slice(0, OTP_LENGTH)); setError(""); }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            caretHidden
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onSubmitEditing={verify}
          />
        </Pressable>
        <Pressable className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary active:opacity-90"}`} onPress={verify} disabled={loading}>
          <Text className="text-primary-foreground font-semibold text-base">{loading ? "Verifying…" : "Verify OTP"}</Text>
        </Pressable>
        {error ? <Text className="text-red-500 text-sm text-center mt-4">{error}</Text> : null}
        <Pressable className={`py-4 items-center ${countdown > 0 ? "opacity-60" : "active:opacity-70"}`} onPress={resend} disabled={countdown > 0 || resending}>
          <Text className="text-primary font-semibold text-sm">
            {resending ? "Sending…" : countdown > 0 ? `Resend OTP in ${countdown}s` : "Resend OTP"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
