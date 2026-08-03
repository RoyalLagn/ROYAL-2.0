import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Mail } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { PasswordField } from "@/components/auth/PasswordField";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  getAdminAuthError,
  loginAdmin,
} from "@/services/adminAuth";
import { validateEmail } from "@/utils/authValidation";

export default function AdminLoginScreen() {
  const router = useRouter();
  const { isAdminAuthenticated, loading: restoring, refreshAdmin } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  React.useEffect(() => {
    if (!restoring && isAdminAuthenticated) {
      if (router.canDismiss()) router.dismissAll();
      router.replace("/admin-dashboard");
    }
  }, [isAdminAuthenticated, restoring, router]);

  const handleLogin = async () => {
    if (loading) return;
    if (!validateEmail(email) || !password) {
      setError("Invalid email or password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const identity = await loginAdmin(email, password);
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
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/DashboardCenter" />
      <KeyboardAvoidingView
        className="flex-1 justify-center px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="items-center mb-10">
          <Text className="text-primary font-bold text-4xl mb-2">
            Royal<Text className="text-foreground">Lagn</Text>
          </Text>
          <Text className="text-muted-foreground text-base">Sign in to continue</Text>
        </View>

        <View className="gap-4">
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
            <Mail size={20} className="text-muted-foreground" />
            <TextInput
              className="flex-1 text-foreground py-4 ml-3"
              placeholder="Email address"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
          </View>
          <PasswordField
            value={password}
            onChangeText={(value) => { setPassword(value); setError(""); }}
            placeholder="Password"
            onSubmitEditing={() => void handleLogin()}
          />
          <Pressable
            className="self-end py-1 active:opacity-70"
            onPress={() => router.push("/AdminForgotPassword")}
          >
            <Text className="text-primary text-sm font-semibold">Forgot Password?</Text>
          </Pressable>
          {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
          <Pressable
            className={`rounded-2xl py-4 items-center ${loading || restoring ? "bg-primary/45" : "bg-primary active:opacity-90"}`}
            onPress={() => void handleLogin()}
            disabled={loading || restoring}
          >
            <Text className="text-primary-foreground font-semibold text-base">
              {loading || restoring ? "Verifying…" : "Login"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
