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
const RESEND_SECONDS = 60;
const param = (value?: string | string[]) => Array.isArray(value) ? value[0] || "" : value || "";

export default function VendorOtpVerification() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; ownerName?: string; phone?: string; purpose?: VendorOtpPurpose }>();
  const email = param(params.email);
  const ownerName = param(params.ownerName);
  const phone = param(params.phone);
  const purpose: VendorOtpPurpose = param(params.purpose) === "recovery" ? "recovery" : "signup";
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const verify = async () => {
    if (loading) return;
    if (otp.length !== OTP_LENGTH) return setError(`Enter the complete ${OTP_LENGTH}-digit OTP.`);
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (purpose === "recovery") markRecoverySessionActive();
      else clearRecoverySession();
      await verifyVendorOtp(email, otp, purpose);
      router.replace({ pathname: "/VendorCreatePassword", params: { email, ownerName, phone, purpose } });
    } catch (caught) {
      if (purpose === "recovery") clearRecoverySession();
      setError(getVendorAuthError(caught, "Unable to verify the OTP."));
      setOtp("");
    } finally { setLoading(false); }
  };

  const resend = async () => {
    if (countdown || resending) return;
    setResending(true);
    setError("");
    setNotice("");
    try {
      if (purpose === "recovery") await sendVendorRecoveryOtp(email);
      else await sendVendorSignupOtp({ email, ownerName, phone });
      setOtp("");
      setCountdown(RESEND_SECONDS);
      setNotice("A new verification code is on its way.");
    } catch (caught) {
      setError(getVendorAuthError(caught, "Unable to resend the OTP."));
    } finally { setResending(false); }
  };

  return (
    <AuthScreenLayout
      backRoute={purpose === "recovery" ? "/VendorForgotPassword" : "/VendorAuth"}
      eyebrow="Vendor Portal"
      title="Verify business email"
      subtitle={
        <>
          Enter the {OTP_LENGTH}-digit code sent to{"\n"}
          <Text className="text-foreground font-semibold">{email}</Text>
        </>
      }
      footer={
        <AuthLinkButton onPress={() => void resend()} disabled={Boolean(countdown) || resending}>
          <Text className="text-primary font-semibold text-body">
            {resending ? "Sending…" : countdown ? `Resend code in ${countdown}s` : "Resend code"}
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
