import React, { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Building2, ChevronRight, Mail, Phone, User } from "lucide-react-native";
import { AuthField } from "@/components/auth/AuthField";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
  AuthTabs,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  getPublicAuthError,
  sendSignupOtp,
} from "@/services/publicAuth";
import { loginMobileUser } from "@/services/authNavigation";
import {
  sanitizePhoneInput,
  validateEmail,
  validateFullName,
  validatePhone,
} from "@/utils/authValidation";
import { SupportedLocationField } from "@/components/locations/SupportedLocationField";
import { useCustomerLocation } from "@/context/LocationContext";
import type { LocationPreference } from "@/locations/types";

type AuthTab = "login" | "signup";

const TABS = [
  { id: "login", label: "Login" },
  { id: "signup", label: "Sign Up" },
] as const;

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string; tab?: string }>();
  const { refreshProfile, isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const { locations, preference } = useCustomerLocation();
  const [tab, setTab] = useState<AuthTab>(params.tab === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupAudience, setSignupAudience] = useState<"customer" | null>(null);
  const [signupLocation, setSignupLocation] = useState<LocationPreference | null>(preference);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const fullNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const signupValid = useMemo(
    () => validateFullName(fullName) && validatePhone(phone) && validateEmail(email) && Boolean(signupLocation?.cityId),
    [email, fullName, phone, signupLocation?.cityId]
  );

  useEffect(() => {
    if (!authLoading && isPublicAuthenticated) {
      if (Platform.OS !== "web" && router.canDismiss()) router.dismissAll();
      router.replace("/(tabs)");
    }
  }, [authLoading, isPublicAuthenticated, router]);

  const changeTab = (nextTab: AuthTab) => {
    setTab(nextTab);
    setSignupAudience(null);
    setError("");
  };

  const login = async () => {
    if (loading) return;
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
      const destination = await loginMobileUser(email, password);
      if (destination.pathname === "/(tabs)") await refreshProfile();
      if (Platform.OS !== "web" && router.canDismiss()) router.dismissAll();
      if (destination.pathname === "/BecomeVendor") {
        router.replace({ pathname: "/BecomeVendor", params: { source: "login" } });
      } else {
        router.replace(destination as never);
      }
    } catch (caught) {
      setError(getPublicAuthError(caught, "Unable to log in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const sendOtp = async () => {
    if (!signupValid || loading) return;
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
    <AuthScreenLayout
      backRoute="/(tabs)"
      title={tab === "login" ? "Welcome back" : signupAudience ? "Customer account" : "Create your account"}
      subtitle={tab === "login" ? "Plan your celebration with RoyalLagn." : undefined}
      variant="soft"
    >
      <AuthTabs tabs={TABS} active={tab} onChange={changeTab} disabled={loading} variant="soft" />

      <View className="gap-4 mt-5">
        {params.reset === "success" ? (
          <AuthAlert tone="success" message="Password updated successfully. Log in with your new password." />
        ) : null}

        {tab === "signup" && !signupAudience ? (
          <>
            <Text className="text-foreground text-title font-bold mb-1">Choose account type</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue as a customer"
              className="min-h-20 rounded-2xl border border-border bg-card px-4 py-4 flex-row items-center active:opacity-80"
              onPress={() => setSignupAudience("customer")}
            >
              <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mr-4">
                <User size={23} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-body font-bold">Public / Customer</Text>
              </View>
              <ChevronRight size={20} className="text-muted-foreground" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue as a vendor"
              className="min-h-20 rounded-2xl border border-border bg-card px-4 py-4 flex-row items-center active:opacity-80"
              onPress={() => router.push({ pathname: "/VendorAuth", params: { signup: "1" } })}
            >
              <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center mr-4">
                <Building2 size={23} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-body font-bold">Vendor</Text>
              </View>
              <ChevronRight size={20} className="text-muted-foreground" />
            </Pressable>
          </>
        ) : null}

        {tab === "signup" && signupAudience === "customer" ? (
          <>
            <AuthLinkButton align="start" onPress={() => setSignupAudience(null)} disabled={loading}>
              <View className="flex-row items-center gap-2">
                <ArrowLeft size={18} className="text-primary" />
                <Text className="text-primary font-semibold text-body">Choose another account type</Text>
              </View>
            </AuthLinkButton>
            <AuthField
              ref={fullNameRef}
              label="Full name"
              required
              icon={User}
              value={fullName}
              onChangeText={(value) => { setFullName(value); setError(""); }}
              placeholder="Your full name"
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              variant="soft"
            />
            <SupportedLocationField
              label="Preferred browsing location"
              required
              locations={locations}
              value={signupLocation}
              onChange={(value) => { setSignupLocation(value); setError(""); }}
              helper="Used only to prioritize nearby vendors. You can change it anytime."
              variant="soft"
            />
            <AuthField
              ref={phoneRef}
              label="Phone number"
              required
              icon={Phone}
              value={phone}
              onChangeText={(value) => { setPhone(sanitizePhoneInput(value)); setError(""); }}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={20}
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              variant="soft"
            />
          </>
        ) : null}

        {tab === "login" || signupAudience === "customer" ? <AuthField
          ref={emailRef}
          label="Email address"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType={tab === "login" ? "next" : "done"}
          onSubmitEditing={tab === "login" ? () => passwordRef.current?.focus() : () => { Keyboard.dismiss(); void sendOtp(); }}
          variant="soft"
        /> : null}

        {tab === "login" ? (
          <>
            <PasswordField
              ref={passwordRef}
              value={password}
              onChangeText={(value) => { setPassword(value); setError(""); }}
              placeholder="Enter your password"
              returnKeyType="done"
              onSubmitEditing={() => void login()}
              variant="soft"
            />
            <AuthLinkButton align="end" onPress={() => router.replace("/ForgotPassword")} disabled={loading}>
              <Text className="text-primary font-semibold text-body">Forgot password?</Text>
            </AuthLinkButton>
          </>
        ) : null}

        {error ? <AuthAlert tone="error" message={error} /> : null}

        {tab === "login" || signupAudience === "customer" ? <AuthSubmitButton
          label={tab === "login" ? "Login" : "Send email OTP"}
          loadingLabel={tab === "login" ? "Logging in…" : "Sending OTP…"}
          loading={loading}
          disabled={tab === "signup" && !signupValid}
          onPress={() => void (tab === "login" ? login() : sendOtp())}
          variant="soft"
        /> : null}
      </View>
    </AuthScreenLayout>
  );
}
