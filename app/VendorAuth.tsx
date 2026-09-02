import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Mail, Phone, User } from "lucide-react-native";
import { AuthField } from "@/components/auth/AuthField";
import { AuthAlert, AuthSubmitButton } from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { supabase } from "@/services/supabase";
import {
  getVendorAuthError,
  logSupabaseError,
  resolveVendorDestination,
  sendVendorSignupOtp,
} from "@/services/vendorAuth";
import { sanitizePhoneInput, validateEmail, validateFullName, validatePhone } from "@/utils/authValidation";
import { getVendorRegistrationEnabled } from "@/services/vendorRegistration";

export default function VendorAuthScreen() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [registrationCheckError, setRegistrationCheckError] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error, setError] = useState("");
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const ownerNameRef = useRef<TextInput>(null);

  const signupValid = useMemo(
    () => validateFullName(ownerName) && validatePhone(phone) && validateEmail(email),
    [email, ownerName, phone],
  );

  useFocusEffect(useCallback(() => {
    let active = true;
    setRegistrationCheckError("");
    getVendorRegistrationEnabled()
      .then((enabled) => { if (active) setRegistrationEnabled(enabled); })
      .catch(() => {
        if (!active) return;
        setRegistrationEnabled(null);
        setRegistrationCheckError("Unable to check registration availability. Try again.");
      });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    let active = true;
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
        logSupabaseError("VendorAuth.checkSession", caught);
      }
    }).finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [router]);

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
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession || (registrationEnabled === null && !registrationCheckError)) {
    return <SafeAreaView className="flex-1 bg-background" />;
  }

  if (registrationEnabled === false) {
    return (
      <AuthScreenLayout
        backRoute="/VendorLogin"
        title="Vendor registration paused"
        subtitle="Vendor registrations are temporarily unavailable."
      >
        <View className="gap-5">
          <Text className="text-muted-foreground text-body leading-6 text-center">
            We are currently onboarding selected vendors manually while we improve the RoyalLagn experience.{"\n\n"}
            Please check back soon.
          </Text>
          <AuthSubmitButton
            label="Back to Vendor Login"
            onPress={() => router.replace("/VendorLogin")}
          />
        </View>
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout
      backRoute="/Login"
      title="Register your business"
      subtitle="Showcase and manage your wedding services with RoyalLagn."
    >
      <View className="gap-4">
        {registrationCheckError ? <AuthAlert tone="error" message={registrationCheckError} /> : null}
        {needsOnboarding ? (
          <>
            <AuthAlert tone="success" message="You’re signed in. Continue to finish your vendor application." />
            <AuthSubmitButton
              label="Continue registration"
              onPress={() => {
                if (router.canDismiss()) router.dismissAll();
                router.replace({ pathname: "/BecomeVendor", params: { source: "login" } });
              }}
            />
          </>
        ) : null}

        <AuthField
          ref={ownerNameRef}
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
          onChangeText={(value) => { setPhone(sanitizePhoneInput(value)); setError(""); }}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          maxLength={20}
          textContentType="telephoneNumber"
          autoComplete="tel"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
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
          returnKeyType="done"
          onSubmitEditing={() => void sendOtp()}
        />

        {error ? <AuthAlert tone="error" message={error} /> : null}
        <AuthSubmitButton
          label="Send email OTP"
          loadingLabel="Sending OTP…"
          loading={loading}
          disabled={!signupValid}
          onPress={() => void sendOtp()}
        />
      </View>
    </AuthScreenLayout>
  );
}
