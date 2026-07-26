import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { getPublicAuthError, sendRecoveryOtp } from "@/services/publicAuth";
import { validateEmail } from "@/utils/authValidation";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async () => {
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
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/Login" />
      <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center mb-9">
          <Text className="text-primary font-bold text-4xl mb-2">
            Royal<Text className="text-foreground">Lagn</Text>
          </Text>
          <Text className="text-foreground text-xl font-bold">Forgot Password</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            We’ll send a verification code to your registered email.
          </Text>
        </View>
        <View className="gap-4">
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
            <Mail size={20} className="text-muted-foreground" />
            <TextInput
              autoFocus
              className="flex-1 text-foreground py-4 ml-3"
              placeholder="Registered Email Address"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={(value) => { setEmail(value); setError(""); }}
              onSubmitEditing={sendOtp}
              returnKeyType="send"
            />
          </View>
          {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
          <Pressable
            className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary active:opacity-90"}`}
            onPress={sendOtp}
            disabled={loading}
          >
            <Text className="text-primary-foreground font-semibold text-base">
              {loading ? "Sending OTP…" : "Send Email OTP"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
