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
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/AdminLogin" />
      <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="items-center mb-9">
          <Text className="text-primary font-bold text-4xl mb-2">Royal<Text className="text-foreground">Lagn</Text></Text>
          <Text className="text-foreground text-xl font-bold">Admin Password Recovery</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2">
            We’ll send a verification code to your registered administrator email.
          </Text>
        </View>
        <View className="gap-4">
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
            <Mail size={20} className="text-muted-foreground" />
            <TextInput
              autoFocus
              className="flex-1 text-foreground py-4 ml-3"
              placeholder="Administrator Email"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={(value) => { setEmail(value); setError(""); }}
              onSubmitEditing={() => void sendOtp()}
            />
          </View>
          {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
          <Pressable className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary"}`} onPress={() => void sendOtp()} disabled={loading}>
            <Text className="text-white font-semibold">{loading ? "Sending OTP…" : "Send Email OTP"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
