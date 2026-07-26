import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, Square } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  passwordRequirements,
  validatePassword,
} from "@/utils/authValidation";

type CreatePasswordFormProps = {
  recovery: boolean;
  signupTitle: string;
  backRoute: "/Login" | "/VendorLogin" | "/AdminLogin";
  onSubmit: (password: string) => Promise<void>;
  getError: (error: unknown) => string;
};

export function CreatePasswordForm({
  recovery,
  signupTitle,
  backRoute,
  onSubmit,
  getError,
}: CreatePasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  const matches = confirmPassword.length > 0 && password === confirmPassword;
  const validPassword = validatePassword(password);
  const canSubmit = validPassword && matches && (recovery || acceptedTerms);
  const strength = Object.values(requirements).filter(Boolean).length;
  const strengthLabel = ["Weak", "Weak", "Fair", "Good", "Strong"][strength];

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit(password);
    } catch (caught) {
      setError(getError(caught));
    } finally {
      setLoading(false);
    }
  };

  const checks = [
    ["Minimum 8 characters", requirements.minimumLength],
    ["One uppercase letter", requirements.uppercase],
    ["One lowercase letter", requirements.lowercase],
    ["One number", requirements.number],
    ["Passwords match", matches],
  ] as const;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute={backRoute} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-12" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-8">
            <Text className="text-primary font-bold text-4xl mb-2">
              Royal<Text className="text-foreground">Lagn</Text>
            </Text>
            <Text className="text-foreground text-xl font-bold">
              {recovery ? "Create New Password" : signupTitle}
            </Text>
          </View>

          <View className="gap-4">
            <PasswordField
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError("");
              }}
              placeholder="New Password"
              returnKeyType="next"
            />
            <PasswordField
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError("");
              }}
              placeholder="Confirm New Password"
              onSubmitEditing={submit}
            />

            <View className="bg-card border border-border rounded-2xl p-4">
              <View className="flex-row gap-2 mb-2">
                {[1, 2, 3, 4].map((level) => (
                  <View
                    key={level}
                    className={`h-1.5 flex-1 rounded-full ${strength >= level ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </View>
              <Text className="text-muted-foreground text-xs mb-3">
                Password strength: {strengthLabel}
              </Text>
              <View className="gap-2">
                {checks.map(([label, passed]) => (
                  <View key={label} className="flex-row items-center gap-2">
                    <View className={`w-5 h-5 rounded-full items-center justify-center ${passed ? "bg-primary" : "bg-muted"}`}>
                      {passed ? <Check size={13} color="#FFFFFF" /> : null}
                    </View>
                    <Text className={passed ? "text-foreground text-sm" : "text-muted-foreground text-sm"}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {!recovery ? (
              <Pressable
                className="flex-row items-start gap-3 py-1 active:opacity-75"
                onPress={() => setAcceptedTerms((current) => !current)}
              >
                <View className={`w-6 h-6 rounded-md border items-center justify-center ${acceptedTerms ? "bg-primary border-primary" : "border-border bg-card"}`}>
                  {acceptedTerms ? <Check size={16} color="#FFFFFF" /> : <Square size={0} />}
                </View>
                <Text className="text-muted-foreground text-sm leading-5 flex-1">
                  I agree to the{" "}
                  <Text className="text-primary font-semibold" onPress={() => router.push("/Terms")}>Terms &amp; Conditions</Text>
                  {" "}and{" "}
                  <Text className="text-primary font-semibold" onPress={() => router.push("/PrivacyPolicy")}>Privacy Policy</Text>.
                </Text>
              </Pressable>
            ) : null}

            {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
            <Pressable
              className={`rounded-2xl py-4 items-center ${canSubmit && !loading ? "bg-primary active:opacity-90" : "bg-primary/45"}`}
              onPress={submit}
              disabled={!canSubmit || loading}
            >
              <Text className="text-primary-foreground font-semibold text-base">
                {loading
                  ? recovery ? "Updating Password…" : "Creating Account…"
                  : recovery ? "Save Password" : "Create Account"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
