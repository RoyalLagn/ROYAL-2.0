import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { AuthField } from "@/components/auth/AuthField";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  getAdminAuthError,
  loginAdmin,
} from "@/services/adminAuth";
import { getAdminMfaState } from "@/services/adminMfa";
import { validateEmail } from "@/utils/authValidation";

export default function AdminLoginScreen() {
  if (Platform.OS !== "web") return <Redirect href="/Login" />;
  return <WebAdminLoginScreen />;
}

function WebAdminLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string }>();
  const { isAdminAuthenticated, loading: restoring, refreshAdmin } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!restoring && isAdminAuthenticated) {
      if (router.canDismiss()) router.dismissAll();
      router.replace("/admin-dashboard");
    }
  }, [isAdminAuthenticated, restoring, router]);

  const handleLogin = async () => {
    if (loading) return;
    if (!validateEmail(email)) {
      setError("Enter a valid administrator email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const identity = await loginAdmin(email, password);
      const mfa = await getAdminMfaState();
      if (mfa.requirement) {
        router.replace(
          mfa.requirement === "setup" ? "/AdminMfaSetup" : "/AdminMfaVerify",
        );
        return;
      }
      await refreshAdmin(identity.session);
      if (router.canDismiss()) router.dismissAll();
      router.replace("/admin-dashboard");
    } catch (caught) {
      setError(getAdminAuthError(caught, "Unable to sign in."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout
      backRoute="/(tabs)"
      eyebrow="Admin Console"
      title="Administrator sign in"
      subtitle="Restricted access. Use your administrator credentials."
    >
      <View className="gap-4">
        {params.reset === "success" ? (
          <AuthAlert tone="success" message="Password updated. Sign in with your new password." />
        ) : null}
        <AuthField
          label="Email address"
          required
          icon={Mail}
          value={email}
          onChangeText={(value) => { setEmail(value); setError(""); }}
          placeholder="royallagn@gmail.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <PasswordField
          ref={passwordRef}
          value={password}
          onChangeText={(value) => { setPassword(value); setError(""); }}
          placeholder="Enter your password"
          onSubmitEditing={() => void handleLogin()}
        />
        <AuthLinkButton align="end" onPress={() => router.replace("/AdminForgotPassword")} disabled={loading}>
          <Text className="text-primary font-semibold text-body">Forgot password?</Text>
        </AuthLinkButton>

        {error ? <AuthAlert tone="error" message={error} /> : null}

        <AuthSubmitButton
          label="Login"
          loadingLabel="Verifying…"
          loading={loading || restoring}
          onPress={() => void handleLogin()}
        />
      </View>
    </AuthScreenLayout>
  );
}
