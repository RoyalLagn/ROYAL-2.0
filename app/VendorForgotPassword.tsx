import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { getVendorAuthError, sendVendorRecoveryOtp } from "@/services/vendorAuth";
import { validateEmail } from "@/utils/authValidation";

export default function VendorForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!validateEmail(email)) return setError("Enter a valid business email.");
    setLoading(true); setError("");
    try {
      const destination = await sendVendorRecoveryOtp(email);
      router.replace({ pathname: "/VendorOtpVerification", params: { email: destination, purpose: "recovery" } });
    } catch (caught) {
      setError(getVendorAuthError(caught, "Unable to send the recovery OTP."));
    } finally { setLoading(false); }
  };
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <AuthBackButton fallbackRoute="/VendorLogin" />
    <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="items-center mb-9">
        <Text className="text-primary font-bold text-4xl">Royal<Text className="text-foreground">Lagn</Text></Text>
        <Text className="text-foreground text-xl font-bold mt-4">Vendor Password Recovery</Text>
        <Text className="text-muted-foreground text-sm text-center mt-2">We’ll send an OTP to your registered business email.</Text>
      </View>
      <View className="gap-4">
        <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
          <Mail size={20} className="text-muted-foreground" />
          <TextInput autoFocus className="flex-1 text-foreground py-4 ml-3" value={email}
            onChangeText={(v) => { setEmail(v); setError(""); }} placeholder="Business Email"
            placeholderTextColor="#A8A29E" keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} onSubmitEditing={submit} returnKeyType="send" />
        </View>
        {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
        <Pressable className={`rounded-2xl py-4 items-center ${loading ? "bg-primary/45" : "bg-primary"}`} onPress={submit} disabled={loading}>
          <Text className="text-white font-semibold">{loading ? "Sending OTP…" : "Send Email OTP"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
