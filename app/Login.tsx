import React, { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mail, Phone, User } from "lucide-react-native";
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
  const [signupLocation, setSignupLocation] = useState<LocationPreference | null>(preference);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

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
      backRoute="/DashboardCenter"
      title={tab === "login" ? "Welcome back" : "Create your account"}
      subtitle={
        tab === "login"
          ? "Log in to plan your celebration with RoyalLagn."
          : "Join RoyalLagn and start building your wedding team."
      }
      footer={
        <AuthLinkButton onPress={() => changeTab(tab === "login" ? "signup" : "login")} disabled={loading}>
          <Text className="text-muted-foreground text-[13px]">
            {tab === "login" ? "New to RoyalLagn? " : "Already have an account? "}
            <Text className="text-primary font-bold">{tab === "login" ? "Sign Up" : "Login"}</Text>
          </Text>
        </AuthLinkButton>
      }
    >
      <AuthTabs tabs={TABS} active={tab} onChange={changeTab} disabled={loading} />

      <View className="gap-4 mt-5">
        {params.reset === "success" ? (
          <AuthAlert tone="success" message="Password updated successfully. Log in with your new password." />
        ) : null}

        {tab === "signup" ? (
          <>
            <AuthField
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
            />
            <SupportedLocationField
              label="Preferred browsing location"
              required
              locations={locations}
              value={signupLocation}
              onChange={(value) => { setSignupLocation(value); setError(""); }}
              helper="Used only to prioritize nearby vendors. You can change it anytime."
            />
            <AuthField
              ref={phoneRef}
              label="Phone number"
              required
              icon={Phone}
              value={phone}
              onChangeText={(value) => { setPhone(value.replace(/\D/g, "")); setError(""); }}
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          </>
        ) : null}

        <AuthField
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
        />

        {tab === "login" ? (
          <>
            <PasswordField
              ref={passwordRef}
              value={password}
              onChangeText={(value) => { setPassword(value); setError(""); }}
              placeholder="Enter your password"
              returnKeyType="done"
              onSubmitEditing={() => void login()}
            />
            <AuthLinkButton align="end" onPress={() => router.replace("/ForgotPassword")} disabled={loading}>
              <Text className="text-primary font-semibold text-[13px]">Forgot password?</Text>
            </AuthLinkButton>
          </>
        ) : null}

        {error ? <AuthAlert tone="error" message={error} /> : null}

        <AuthSubmitButton
          label={tab === "login" ? "Login" : "Send email OTP"}
          loadingLabel={tab === "login" ? "Logging in…" : "Sending OTP…"}
          loading={loading}
          disabled={tab === "signup" && !signupValid}
          onPress={() => void (tab === "login" ? login() : sendOtp())}
        />
      </View>
    </AuthScreenLayout>
  );
}
