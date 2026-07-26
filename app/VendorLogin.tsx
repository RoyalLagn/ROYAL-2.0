import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mail, Phone, User } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { supabase } from "@/services/supabase";
import {
  getVendorAuthError,
  loginVendor,
  resolveVendorDestination,
  sendVendorSignupOtp,
} from "@/services/vendorAuth";
import { validateEmail, validateFullName, validatePhone } from "@/utils/authValidation";

type Tab = "login" | "signup";

export default function VendorLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string }>();
  const [tab, setTab] = useState<Tab>("login");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");
  const signupValid = useMemo(
    () => validateFullName(ownerName) && validatePhone(phone) && validateEmail(email),
    [email, ownerName, phone]
  );

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      try {
        const destination = await resolveVendorDestination(data.user);
        if (active) router.replace(destination as never);
      } catch {
        // A public/admin session must not be treated as a Vendor session.
      }
    }).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [router]);

  const login = async () => {
    if (!validateEmail(email)) return setError("Enter a valid business email.");
    if (!password) return setError("Password is required.");
    setLoading(true);
    setError("");
    try {
      const destination = await loginVendor(email, password);
      router.replace(destination as never);
    } catch (caught) {
      setError(getVendorAuthError(caught, "Unable to log in."));
    } finally { setLoading(false); }
  };

  const sendOtp = async () => {
    if (!signupValid) return;
    setLoading(true);
    setError("");
    try {
      const destination = await sendVendorSignupOtp({ email, ownerName, phone });
      router.replace({
        pathname: "/VendorOtpVerification",
        params: { email: destination, ownerName: ownerName.trim(), phone, purpose: "signup" },
      });
    } catch (caught) {
      setError(getVendorAuthError(caught, "Unable to send the OTP."));
    } finally { setLoading(false); }
  };

  if (checkingSession) {
    return <SafeAreaView className="flex-1 bg-background" />;
  }

  const input = (
    icon: React.ElementType,
    value: string,
    change: (value: string) => void,
    placeholder: string,
    keyboardType?: "email-address" | "phone-pad",
  ) => {
    const Icon = icon;
    return <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
      <Icon size={20} className="text-muted-foreground" />
      <TextInput className="flex-1 text-foreground py-4 ml-3" value={value}
        onChangeText={change} placeholder={placeholder} placeholderTextColor="#A8A29E"
        autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} />
    </View>;
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/DashboardCenter" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-12" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-7">
            <Text className="text-primary font-bold text-4xl mb-2">Royal<Text className="text-foreground">Lagn</Text></Text>
            <Text className="text-muted-foreground text-base">Vendor Portal</Text>
          </View>
          <View className="flex-row bg-muted rounded-2xl p-1 mb-5">
            {(["login", "signup"] as const).map((item) => (
              <Pressable key={item} className={`flex-1 rounded-xl py-3 items-center ${tab === item ? "bg-card" : ""}`}
                onPress={() => { setTab(item); setError(""); }} disabled={loading}>
                <Text className={tab === item ? "text-primary font-bold" : "text-muted-foreground font-semibold"}>
                  {item === "login" ? "Login" : "Sign Up"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="gap-4">
            {params.reset === "success" ? <Text className="text-green-600 text-sm text-center bg-green-500/10 rounded-xl p-3">Password updated. Log in with your new password.</Text> : null}
            {tab === "signup" ? <>
              {input(User, ownerName, (v) => { setOwnerName(v); setError(""); }, "Owner Name *")}
              {input(Phone, phone, (v) => { setPhone(v.replace(/\D/g, "")); setError(""); }, "Phone Number *", "phone-pad")}
            </> : null}
            {input(Mail, email, (v) => { setEmail(v); setError(""); }, "Business Email *", "email-address")}
            {tab === "login" ? <>
              <PasswordField value={password} onChangeText={(v) => { setPassword(v); setError(""); }} placeholder="Password" onSubmitEditing={login} />
              <Pressable className="self-end" onPress={() => router.replace("/VendorForgotPassword")} disabled={loading}>
                <Text className="text-primary font-semibold text-sm">Forgot Password?</Text>
              </Pressable>
            </> : null}
            {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
            <Pressable className={`rounded-2xl py-4 items-center ${loading || (tab === "signup" && !signupValid) ? "bg-primary/45" : "bg-primary"}`}
              disabled={loading || (tab === "signup" && !signupValid)} onPress={tab === "login" ? login : sendOtp}>
              <Text className="text-white font-semibold">{loading ? "Please wait…" : tab === "login" ? "Login" : "Send Email OTP"}</Text>
            </Pressable>
            <Pressable className="items-center py-2" onPress={() => { setTab(tab === "login" ? "signup" : "login"); setError(""); }}>
              <Text className="text-muted-foreground text-sm">{tab === "login" ? "New Vendor? " : "Already registered? "}
                <Text className="text-primary font-bold">{tab === "login" ? "Sign Up" : "Login"}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
