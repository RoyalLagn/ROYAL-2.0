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
import { getPublicAuthError, sendRecoveryOtp } from "@/services/publicAuth";
import { validateEmail } from "@/utils/authValidation";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async () => {
    if (loading) return;
    if (!validateEmail(email)) {
      setError("Enter a valid registered email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const destination = await sendRecoveryOtp(email);
      router.replace({
        pathname: "/OtpVerification",
        params: { email: destination, purpose: "recovery" },
      });
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to send the recovery code."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      backRoute="/Login"
      title="Forgot password"
      subtitle="Enter your registered email and we’ll send you a verification code to reset your password."
      footer={
        <AuthLinkButton onPress={() => router.replace("/Login")} disabled={loading}>
          <Text className="text-muted-foreground text-body">
            Remembered it? <Text className="text-primary font-bold">Back to login</Text>
          </Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        <AuthField
          autoFocus
          label="Email address"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => void sendOtp()}
        />
        {error ? <AuthAlert tone="error" message={error} /> : null}
        <AuthSubmitButton
          label="Send email OTP"
          loadingLabel="Sending OTP…"
          loading={loading}
          onPress={() => void sendOtp()}
        />
      </View>
    </AuthScreenLayout>
  );
}
