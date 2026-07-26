import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CreatePasswordForm } from "@/components/auth/CreatePasswordForm";
import {
  completeVendorSignup,
  getVendorAuthError,
  updateVendorRecoveredPassword,
  type VendorOtpPurpose,
} from "@/services/vendorAuth";
import { markRecoverySessionActive } from "@/services/authRecoverySession";

const param = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] || "" : value || "";

export default function VendorCreatePassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    email?: string;
    ownerName?: string;
    phone?: string;
    purpose?: VendorOtpPurpose;
  }>();
  const email = param(params.email);
  const ownerName = param(params.ownerName);
  const phone = param(params.phone);
  const recovery = param(params.purpose) === "recovery";

  useEffect(() => {
    if (recovery) markRecoverySessionActive();
  }, [recovery]);

  return (
    <CreatePasswordForm
      recovery={recovery}
      signupTitle="Create Vendor Password"
      backRoute="/VendorLogin"
      onSubmit={async (password) => {
        if (recovery) {
          await updateVendorRecoveredPassword(password);
          router.replace({
            pathname: "/PasswordUpdated",
            params: { audience: "vendor" },
          });
          return;
        }
        await completeVendorSignup({ email, ownerName, phone }, password);
        router.replace("/BecomeVendor");
      }}
      getError={(error) =>
        getVendorAuthError(error, "Unable to save the password.")}
    />
  );
}
