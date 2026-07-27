import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CreatePasswordForm } from "@/components/auth/CreatePasswordForm";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  completePublicSignup,
  getPublicAuthError,
  updateRecoveredPassword,
  type OtpPurpose,
} from "@/services/publicAuth";
import { markRecoverySessionActive } from "@/services/authRecoverySession";

const param = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] || "" : value || "";

export default function CreatePasswordScreen() {
  const router = useRouter();
  const { refreshProfile } = usePublicAuth();
  const params = useLocalSearchParams<{
    email?: string;
    fullName?: string;
    phone?: string;
    purpose?: OtpPurpose;
  }>();
  const email = param(params.email);
  const fullName = param(params.fullName);
  const phone = param(params.phone);
  const recovery = param(params.purpose) === "recovery";

  useEffect(() => {
    if (recovery) markRecoverySessionActive();
  }, [recovery]);

  return (
    <CreatePasswordForm
      recovery={recovery}
      signupTitle="Create Password"
      backRoute="/Login"
      onSubmit={async (password) => {
        if (recovery) {
          await updateRecoveredPassword(password);
          router.replace({
            pathname: "/PasswordUpdated",
            params: { audience: "public" },
          });
          return;
        }
        await completePublicSignup({ email, fullName, phone }, password);
        await refreshProfile();
        router.dismissAll();
        router.replace("/(tabs)");
      }}
      getError={(error) =>
        getPublicAuthError(error, "Unable to save your password. Please try again.")}
    />
  );
}
