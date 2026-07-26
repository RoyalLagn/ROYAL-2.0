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
  getAdminAuthError,
  sendAdminRecoveryOtp,
  verifyAdminRecoveryOtp,
} from "@/services/adminAuth";
import {
  clearRecoverySession,
  markRecoverySessionActive,
} from "@/services/authRecoverySession";

const OTP_LENGTH = 8;
const param = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] || "" : value || "";

export default function AdminOtpVerification() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = param(params.email);
  const input = useRef<TextInput>(null);
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [countdown]);

  const verify = async () => {
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the complete ${OTP_LENGTH}-digit OTP.`);
      return;
    }
    setLoading(true);
    setError("");
    markRecoverySessionActive();
    try {
      await verifyAdminRecoveryOtp(email, otp);
      router.replace({ pathname: "/AdminCreatePassword", params: { email } });
    } catch (caught) {
      clearRecoverySession();
      setError(getAdminAuthError(caught, "Unable to verify the OTP."));
      setOtp("");
      input.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (countdown || resending) return;
    setResending(true);
    setError("");
    try {
      await sendAdminRecoveryOtp(email);
      setOtp("");
      setCountdown(60);
    } catch (caught) {
      setError(getAdminAuthError(caught, "Unable to resend the OTP."));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/AdminForgotPassword" />
      <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center mb-9">
          <Text className="text-primary font-bold text-4xl">Royal<Text className="text-foreground">Lagn</Text></Text>
          <Text className="text-foreground text-xl font-bold mt-4">Verify Administrator Email</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            Enter the {OTP_LENGTH}-digit code sent to{"\n"}{email}
          </Text>
        </View>
        <Pressable className="flex-row justify-between gap-1.5 mb-5" onPress={() => input.current?.focus()}>
          {Array.from({ length: OTP_LENGTH }, (_, index) => (
            <View key={index} className={`flex-1 max-w-11 aspect-square rounded-xl border items-center justify-center bg-card ${index === otp.length ? "border-primary" : "border-border"}`}>
              <Text className="text-foreground text-xl font-bold">{otp[index] || ""}</Text>
            </View>
          ))}
          <TextInput
            ref={input}
            value={otp}
            onChangeText={(value) => {
              setOtp(value.replace(/\D/g, "").slice(0, OTP_LENGTH));
              setError("");
            }}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            caretHidden
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onSubmitEditing={() => void verify()}
          />
        </Pressable>
        <Pressable className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary"}`} onPress={() => void verify()} disabled={loading}>
          <Text className="text-white font-semibold">{loading ? "Verifying…" : "Verify OTP"}</Text>
        </Pressable>
        {error ? <Text className="text-red-500 text-sm text-center mt-4">{error}</Text> : null}
        <Pressable className={`py-4 items-center ${countdown ? "opacity-60" : ""}`} onPress={() => void resend()} disabled={Boolean(countdown) || resending}>
          <Text className="text-primary font-semibold">
            {resending ? "Sending…" : countdown ? `Resend OTP in ${countdown}s` : "Resend OTP"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
