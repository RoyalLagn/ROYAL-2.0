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
import {
  getAdminAuthError,
  sendAdminRecoveryOtp,
} from "@/services/adminAuth";
import { validateEmail } from "@/utils/authValidation";

export default function AdminForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async () => {
    if (loading) return;
    if (!validateEmail(email)) {
      setError("Enter a valid registered administrator email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const destination = await sendAdminRecoveryOtp(email);
      router.replace({
        pathname: "/AdminOtpVerification",
        params: { email: destination },
      });
    } catch (caught) {
      setError(getAdminAuthError(caught, "Unable to send the recovery code."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      backRoute="/AdminLogin"
      eyebrow="Admin Console"
      title="Password recovery"
      subtitle="We’ll send a verification code to your registered administrator email."
      footer={
        <AuthLinkButton onPress={() => router.replace("/AdminLogin")} disabled={loading}>
          <Text className="text-muted-foreground text-[13px]">
            Remembered it? <Text className="text-primary font-bold">Back to login</Text>
          </Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        <AuthField
          autoFocus
          label="Administrator email"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="admin@royallagn.com"
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
