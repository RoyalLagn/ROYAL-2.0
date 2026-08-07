import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { AuthField } from "@/components/auth/AuthField";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { getVendorAuthError, sendVendorRecoveryOtp } from "@/services/vendorAuth";
import { validateEmail } from "@/utils/authValidation";

export default function VendorForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (loading) return;
    if (!validateEmail(email)) return setError("Enter a valid business email.");
    setLoading(true);
    setError("");
    try {
      const destination = await sendVendorRecoveryOtp(email);
      router.replace({ pathname: "/VendorOtpVerification", params: { email: destination, purpose: "recovery" } });
    } catch (caught) {
      setError(getVendorAuthError(caught, "Unable to send the recovery OTP."));
    } finally { setLoading(false); }
  };

  return (
    <AuthScreenLayout
      backRoute="/VendorAuth"
      eyebrow="Vendor Portal"
      title="Password recovery"
      subtitle="We’ll send a verification code to your registered business email."
      footer={
        <AuthLinkButton onPress={() => router.replace("/VendorAuth")} disabled={loading}>
          <Text className="text-muted-foreground text-body">
            Remembered it? <Text className="text-primary font-bold">Back to login</Text>
          </Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        <AuthField
          autoFocus
          label="Business email"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="business@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
        />
        {error ? <AuthAlert tone="error" message={error} /> : null}
        <AuthSubmitButton
          label="Send email OTP"
          loadingLabel="Sending OTP…"
          loading={loading}
          onPress={() => void submit()}
        />
      </View>
    </AuthScreenLayout>
  );
}
