import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { CreatePasswordForm } from "@/components/auth/CreatePasswordForm";
import {
  getAdminAuthError,
  updateAdminRecoveredPassword,
} from "@/services/adminAuth";
import { markRecoverySessionActive } from "@/services/authRecoverySession";

export default function AdminCreatePassword() {
  const router = useRouter();

  useEffect(() => {
    markRecoverySessionActive();
  }, []);

  return (
    <CreatePasswordForm
      recovery
      signupTitle="Create Administrator Password"
      backRoute="/AdminLogin"
      onSubmit={async (password) => {
        await updateAdminRecoveredPassword(password);
        router.replace({
          pathname: "/PasswordUpdated",
          params: { audience: "admin" },
        });
      }}
      getError={(error) =>
        getAdminAuthError(error, "Unable to update the administrator password.")}
    />
  );
}
