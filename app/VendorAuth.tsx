import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { supabase } from "@/services/supabase";
import {
  getVendorAuthError,
  loginVendor,
  logSupabaseError,
  resolveVendorDestination,
  sendVendorSignupOtp,
} from "@/services/vendorAuth";
import { validateEmail, validateFullName, validatePhone } from "@/utils/authValidation";

type Tab = "login" | "signup";

const TABS = [
  { id: "login", label: "Login" },
  { id: "signup", label: "Sign Up" },
] as const;

export default function VendorAuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string; tab?: string }>();
  const initialTab: Tab = params.tab === "signup" ? "signup" : "login";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error, setError] = useState("");
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const signupValid = useMemo(
    () => validateFullName(ownerName) && validatePhone(phone) && validateEmail(email),
    [email, ownerName, phone]
  );

  useEffect(() => {
    let active = true;
    // A vendor who is already signed in (e.g. came back to /VendorAuth via
    // a header back button) continues straight to their real destination --
    // never through DashboardCenter, and never straight into BecomeVendor
    // without the "you're signed in" banner below, which avoids surprising
    // a returning user with an unannounced form.
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active || !data.user) return;
      try {
        const resolution = await resolveVendorDestination(data.user);
        if (!active) return;
        if (resolution.state === "no_application") {
          setNeedsOnboarding(true);
          return;
        }
        if (resolution.state === "unauthenticated" || resolution.state === "not_vendor") return;
        if (router.canDismiss()) router.dismissAll();
        router.replace(resolution.destination as never);
      } catch (caught) {
        // Public/admin sessions must not be treated as Vendor sessions.
        logSupabaseError("VendorAuth.checkSession", caught);
      }
    }).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [router]);

  const login = async () => {
    if (loading) return;
    if (!validateEmail(email)) return setError("Enter a valid business email.");
    if (!password) return setError("Password is required.");
    setLoading(true);
    setError("");
    try {
      const user = await loginVendor(email, password);
      const resolution = await resolveVendorDestination(user);
      if (router.canDismiss()) router.dismissAll();
      if (resolution.destination.pathname === "/BecomeVendor") {
        router.replace({ pathname: "/BecomeVendor", params: { source: "login" } });
      } else {
        router.replace(resolution.destination as never);
      }
    } catch (caught) {
      logSupabaseError("VendorAuth.login", caught);
      setError(getVendorAuthError(caught, "Unable to log in."));
    } finally { setLoading(false); }
  };

  const sendOtp = async () => {
    if (!signupValid || loading) return;
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

  return (
    <AuthScreenLayout
      backRoute="/DashboardCenter"
      eyebrow="Vendor Portal"
      title={tab === "login" ? "Vendor sign in" : "Register your business"}
      subtitle={
        tab === "login"
          ? "Manage your listing, packages and enquiries."
          : "Create your vendor account to start listing on RoyalLagn."
      }
      footer={
        <AuthLinkButton
          onPress={() => { setTab(tab === "login" ? "signup" : "login"); setError(""); }}
          disabled={loading}
        >
          <Text className="text-muted-foreground text-body">
            {tab === "login" ? "New vendor? " : "Already registered? "}
            <Text className="text-primary font-bold">{tab === "login" ? "Sign Up" : "Login"}</Text>
          </Text>
        </AuthLinkButton>
      }
    >
      <AuthTabs
        tabs={TABS}
        active={tab}
        onChange={(next) => { setTab(next); setError(""); }}
        disabled={loading}
      />

      <View className="gap-4 mt-5">
        {params.reset === "success" ? (
          <AuthAlert tone="success" message="Password updated. Log in with your new password." />
        ) : null}

        {needsOnboarding ? (
          <>
            <AuthAlert
              tone="success"
              message="You’re signed in. Continue to finish your vendor application."
            />
            <AuthSubmitButton
              label="Continue registration"
              loading={false}
              onPress={() => {
                if (router.canDismiss()) router.dismissAll();
                router.replace({ pathname: "/BecomeVendor", params: { source: "login" } });
              }}
            />
          </>
        ) : null}

        {tab === "signup" ? (
          <>
            <AuthField
              label="Owner name"
              required
              icon={User}
              value={ownerName}
              onChangeText={(value) => { setOwnerName(value); setError(""); }}
              placeholder="Business owner’s full name"
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
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
          label="Business email"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="business@example.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType={tab === "login" ? "next" : "done"}
          onSubmitEditing={tab === "login" ? () => passwordRef.current?.focus() : () => void sendOtp()}
        />

        {tab === "login" ? (
          <>
            <PasswordField
              ref={passwordRef}
              value={password}
              onChangeText={(value) => { setPassword(value); setError(""); }}
              placeholder="Enter your password"
              onSubmitEditing={() => void login()}
            />
            <AuthLinkButton align="end" onPress={() => router.replace("/VendorForgotPassword")} disabled={loading}>
              <Text className="text-primary font-semibold text-body">Forgot password?</Text>
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
