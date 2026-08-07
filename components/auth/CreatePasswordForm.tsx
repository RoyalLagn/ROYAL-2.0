import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { AuthAlert, AuthSubmitButton } from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  passwordRequirements,
  validatePassword,
} from "@/utils/authValidation";

type CreatePasswordFormProps = {
  recovery: boolean;
  signupTitle: string;
  backRoute: "/Login" | "/VendorAuth" | "/VendorLogin" | "/AdminLogin";
  onSubmit: (password: string) => Promise<void>;
  getError: (error: unknown) => string;
};

const STRENGTH_LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"] as const;

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
  const strengthLabel = STRENGTH_LABELS[strength];

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
    <AuthScreenLayout
      backRoute={backRoute}
      title={recovery ? "Create new password" : signupTitle}
      subtitle={
        recovery
          ? "Choose a strong password you haven’t used before."
          : "Pick a password to finish setting up your account."
      }
    >
      <View className="gap-4">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChangeText={(text) => { setPassword(text); setError(""); }}
          placeholder="Create a password"
          returnKeyType="next"
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          onChangeText={(text) => { setConfirmPassword(text); setError(""); }}
          placeholder="Re-enter your password"
          onSubmitEditing={() => void submit()}
          error={confirmPassword.length > 0 && !matches ? "Passwords do not match." : undefined}
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
            Password strength: <Text className="text-foreground font-semibold">{strengthLabel}</Text>
          </Text>
          <View className="gap-2">
            {checks.map(([label, passed]) => (
              <View key={label} className="flex-row items-center gap-2">
                <View className={`w-5 h-5 rounded-full items-center justify-center ${passed ? "bg-primary" : "bg-muted"}`}>
                  {passed ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                </View>
                <Text className={passed ? "text-foreground text-[13px]" : "text-muted-foreground text-[13px]"}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {!recovery ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            accessibilityLabel="Accept the Terms and Conditions and Privacy Policy"
            className="flex-row items-start gap-3 py-1 active:opacity-75"
            onPress={() => setAcceptedTerms((current) => !current)}
          >
            <View className={`w-6 h-6 rounded-md border items-center justify-center ${acceptedTerms ? "bg-primary border-primary" : "border-border bg-card"}`}>
              {acceptedTerms ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
            <Text className="text-muted-foreground text-[13px] leading-5 flex-1">
              I agree to the{" "}
              <Text className="text-primary font-semibold" onPress={() => router.push("/Terms")}>Terms &amp; Conditions</Text>
              {" "}and{" "}
              <Text className="text-primary font-semibold" onPress={() => router.push("/PrivacyPolicy")}>Privacy Policy</Text>.
            </Text>
          </Pressable>
        ) : null}

        {error ? <AuthAlert tone="error" message={error} /> : null}

        <AuthSubmitButton
          label={recovery ? "Save password" : "Create account"}
          loadingLabel={recovery ? "Updating password…" : "Creating account…"}
          loading={loading}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </AuthScreenLayout>
  );
}
