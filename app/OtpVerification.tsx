import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
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
const RESEND_SECONDS = 60;

export default function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    fullName?: string;
    phone?: string;
    preferredCityId?: string;
    preferredAreaId?: string;
    purpose?: OtpPurpose;
  }>();
  const value = (item?: string | string[]) => Array.isArray(item) ? item[0] || "" : item || "";
  const email = value(params.email);
  const fullName = value(params.fullName);
  const phone = value(params.phone);
  const preferredCityId = value(params.preferredCityId);
  const preferredAreaId = value(params.preferredAreaId);
  const purpose: OtpPurpose = value(params.purpose) === "recovery" ? "recovery" : "signup";
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const verify = async () => {
    if (loading) return;
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the complete ${OTP_LENGTH}-digit verification code.`);
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (purpose === "recovery") markRecoverySessionActive();
      else clearRecoverySession();
      await verifyPublicEmailOtp(email, otp);
      router.replace({
        pathname: "/CreatePassword",
        params: { email, fullName, phone, preferredCityId, preferredAreaId, purpose },
      });
    } catch (caught) {
      if (purpose === "recovery") clearRecoverySession();
      setError(getPublicAuthError(caught, "Unable to verify the code. Please try again."));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError("");
    setNotice("");
    try {
      if (purpose === "recovery") await sendRecoveryOtp(email);
      else await sendSignupOtp({
        email,
        fullName,
        phone,
        preferredCityId,
        preferredAreaId: preferredAreaId || null,
      });
      setOtp("");
      setCountdown(RESEND_SECONDS);
      setNotice("A new verification code is on its way.");
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to resend the code."));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthScreenLayout
      backRoute={purpose === "recovery" ? "/ForgotPassword" : "/Login"}
      title="Verify your email"
      subtitle={
        <>
          Enter the {OTP_LENGTH}-digit code sent to{"\n"}
          <Text className="text-foreground font-semibold">{email}</Text>
        </>
      }
      footer={
        <AuthLinkButton onPress={() => void resend()} disabled={countdown > 0 || resending}>
          <Text className="text-primary font-semibold text-body">
            {resending ? "Sending…" : countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
          </Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        <OtpCodeField
          length={OTP_LENGTH}
          value={otp}
          onChange={(next) => { setOtp(next); setError(""); }}
          onSubmit={() => void verify()}
          disabled={loading}
        />
        {error ? <AuthAlert tone="error" message={error} /> : null}
        {notice && !error ? <AuthAlert tone="success" message={notice} /> : null}
        <AuthSubmitButton
          label="Verify code"
          loadingLabel="Verifying…"
          loading={loading}
          disabled={otp.length !== OTP_LENGTH}
          onPress={() => void verify()}
        />
      </View>
    </AuthScreenLayout>
  );
}
