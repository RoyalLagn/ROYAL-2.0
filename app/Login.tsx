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
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  getPublicAuthError,
  loginPublicUser,
  sendSignupOtp,
} from "@/services/publicAuth";
import {
  validateEmail,
  validateFullName,
  validatePhone,
} from "@/utils/authValidation";
import { SupportedLocationField } from "@/components/locations/SupportedLocationField";
import { useCustomerLocation } from "@/context/LocationContext";
import type { LocationPreference } from "@/locations/types";

type AuthTab = "login" | "signup";

function Input({
  icon: Icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  icon: React.ElementType;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "email-address" | "phone-pad";
}) {
  return (
    <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
      <Icon size={20} className="text-muted-foreground" />
      <TextInput
        className="flex-1 text-foreground py-4 ml-3"
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string }>();
  const { refreshProfile, isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const { locations, preference } = useCustomerLocation();
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupLocation, setSignupLocation] = useState<LocationPreference | null>(preference);

  const signupValid = useMemo(
    () => validateFullName(fullName) && validatePhone(phone) && validateEmail(email) && Boolean(signupLocation?.cityId),
    [email, fullName, phone, signupLocation?.cityId]
  );

  useEffect(() => {
    if (!authLoading && isPublicAuthenticated) {
      if (router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)");
    }
  }, [authLoading, isPublicAuthenticated, router]);

  const changeTab = (nextTab: AuthTab) => {
    setTab(nextTab);
    setError("");
  };

  const login = async () => {
    if (!validateEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginPublicUser(email, password);
      await refreshProfile();
      if (router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)");
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to log in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    if (!signupValid) return;
    setLoading(true);
    setError("");
    try {
      if (!signupLocation) return;
      const normalizedEmail = await sendSignupOtp({
        email,
        fullName,
        phone,
        preferredCityId: signupLocation.cityId,
        preferredAreaId: signupLocation.areaId,
      });
      router.replace({
        pathname: "/OtpVerification",
        params: {
          email: normalizedEmail,
          fullName: fullName.trim(),
          phone: phone.trim(),
          preferredCityId: signupLocation.cityId,
          preferredAreaId: signupLocation.areaId ?? "",
          purpose: "signup",
        },
      });
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to send the code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/DashboardCenter" />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-12"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-7">
            <Text className="text-primary font-bold text-4xl mb-2">
              Royal<Text className="text-foreground">Lagn</Text>
            </Text>
            <Text className="text-muted-foreground text-base">Welcome to your celebration journey</Text>
          </View>

          <View className="flex-row bg-muted rounded-2xl p-1 mb-5">
            {(["login", "signup"] as const).map((item) => (
              <Pressable
                key={item}
                className={`flex-1 rounded-xl py-3 items-center ${tab === item ? "bg-card" : ""}`}
                onPress={() => changeTab(item)}
                disabled={loading}
              >
                <Text className={tab === item ? "text-primary font-bold" : "text-muted-foreground font-semibold"}>
                  {item === "login" ? "Login" : "Sign Up"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="gap-4">
            {params.reset === "success" ? (
              <View className="bg-green-500/10 border border-green-500/25 rounded-xl px-4 py-3">
                <Text className="text-green-600 text-sm text-center">
                  Password updated successfully. Log in with your new password.
                </Text>
              </View>
            ) : null}
            {tab === "signup" ? (
              <>
                <Input
                  icon={User}
                  value={fullName}
                  onChangeText={(value) => { setFullName(value); setError(""); }}
                  placeholder="Full Name *"
                />
                <SupportedLocationField
                  label="Preferred browsing location"
                  required
                  locations={locations}
                  value={signupLocation}
                  onChange={(value) => { setSignupLocation(value); setError(""); }}
                  helper="Used only to prioritize nearby vendors. You can change it anytime."
                />
                <Input
                  icon={Phone}
                  value={phone}
                  onChangeText={(value) => { setPhone(value.replace(/\D/g, "")); setError(""); }}
                  placeholder="Phone Number *"
                  keyboardType="phone-pad"
                />
              </>
            ) : null}
            <Input
              icon={Mail}
              value={email}
              onChangeText={(value) => { setEmail(value); setError(""); }}
              placeholder="Email Address *"
              keyboardType="email-address"
            />
            {tab === "login" ? (
              <>
                <PasswordField
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(""); }}
                  placeholder="Password"
                  onSubmitEditing={login}
                />
                <Pressable
                  className="self-end active:opacity-70"
                  onPress={() => router.replace("/ForgotPassword")}
                  disabled={loading}
                >
                  <Text className="text-primary font-semibold text-sm">Forgot Password?</Text>
                </Pressable>
              </>
            ) : null}

            {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}

            <Pressable
              className={`rounded-2xl py-4 items-center ${
                loading || (tab === "signup" && !signupValid) ? "bg-primary/45" : "bg-primary active:opacity-90"
              }`}
              onPress={tab === "login" ? login : sendOtp}
              disabled={loading || (tab === "signup" && !signupValid)}
            >
              <Text className="text-primary-foreground font-semibold text-base">
                {loading
                  ? tab === "login" ? "Logging in…" : "Sending OTP…"
                  : tab === "login" ? "Login" : "Send Email OTP"}
              </Text>
            </Pressable>

            <Pressable
              className="items-center py-2 active:opacity-70"
              onPress={() => changeTab(tab === "login" ? "signup" : "login")}
              disabled={loading}
            >
              <Text className="text-muted-foreground text-sm">
                {tab === "login" ? "New to RoyalLagn? " : "Already have an account? "}
                <Text className="text-primary font-bold">{tab === "login" ? "Sign Up" : "Login"}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
