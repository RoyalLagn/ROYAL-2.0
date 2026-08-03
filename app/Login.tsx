import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
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

const Input = forwardRef<TextInput, {
  icon: React.ElementType;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "email-address" | "phone-pad";
  returnKeyType?: "done" | "next" | "go";
  onSubmitEditing?: () => void;
  onFocus?: (event: unknown) => void;
}>(function Input({
  icon: Icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
  onFocus,
}, ref) {
  return (
    <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
      <Icon size={20} className="text-muted-foreground" />
      <TextInput
        ref={ref}
        className="flex-1 text-foreground py-4 ml-3"
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        value={value}
        onChangeText={onChangeText}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        onFocus={onFocus}
      />
    </View>
  );
});

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

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const keyboardAnim = useRef(new Animated.Value(0)).current;

  const animateKeyboard = React.useCallback((toValue: number, duration = 220) => {
    Animated.timing(keyboardAnim, {
      toValue,
      duration,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [keyboardAnim]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) =>
      animateKeyboard(1, event?.duration || 220)
    );
    const hideSub = Keyboard.addListener(hideEvent, (event) =>
      animateKeyboard(0, event?.duration || 220)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [animateKeyboard]);

  // Starts the layout animation immediately on focus (before the keyboard has
  // finished opening — avoids a visible jump on Android) and scrolls the
  // focused input above the keyboard.
  const handleInputFocus = React.useCallback((event: unknown) => {
    if (Platform.OS === "web") return;
    animateKeyboard(1);
    const node = (event as { target?: number } | undefined)?.target;
    const responder = scrollRef.current?.getScrollResponder?.() as
      | { scrollResponderScrollNativeHandleToKeyboard?: (node: number, offset: number, animated: boolean) => void }
      | undefined;
    if (node != null && responder?.scrollResponderScrollNativeHandleToKeyboard) {
      setTimeout(() => {
        try {
          responder.scrollResponderScrollNativeHandleToKeyboard!(node, 120, true);
        } catch {
          // best-effort: native ScrollView + KeyboardAvoidingView still handle visibility
        }
      }, 60);
    }
  }, [animateKeyboard]);

  const logoSpacing = {
    paddingTop: keyboardAnim.interpolate({ inputRange: [0, 1], outputRange: [48, 8] }),
    marginBottom: keyboardAnim.interpolate({ inputRange: [0, 1], outputRange: [28, 12] }),
  };

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
          ref={scrollRef}
          contentContainerClassName="flex-grow justify-center px-6 pb-12"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View className="items-center" style={logoSpacing}>
            <Text className="text-primary font-bold text-4xl mb-2">
              Royal<Text className="text-foreground">Lagn</Text>
            </Text>
            <Text className="text-muted-foreground text-base">Welcome to your celebration journey</Text>
          </Animated.View>

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
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  onFocus={handleInputFocus}
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
                  ref={phoneRef}
                  icon={Phone}
                  value={phone}
                  onChangeText={(value) => { setPhone(value.replace(/\D/g, "")); setError(""); }}
                  placeholder="Phone Number *"
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  onFocus={handleInputFocus}
                />
              </>
            ) : null}
            <Input
              ref={emailRef}
              icon={Mail}
              value={email}
              onChangeText={(value) => { setEmail(value); setError(""); }}
              placeholder="Email Address *"
              keyboardType="email-address"
              returnKeyType={tab === "login" ? "next" : "done"}
              onSubmitEditing={tab === "login" ? () => passwordRef.current?.focus() : Keyboard.dismiss}
              onFocus={handleInputFocus}
            />
            {tab === "login" ? (
              <>
                <PasswordField
                  ref={passwordRef}
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(""); }}
                  placeholder="Password"
                  returnKeyType="done"
                  onSubmitEditing={login}
                  onFocus={handleInputFocus}
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
