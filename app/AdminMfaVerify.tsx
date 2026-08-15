import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  getAdminMfaError,
  getAdminMfaState,
  verifyAdminMfaCode,
} from "@/services/adminMfa";

const MFA_CODE_LENGTH = 6;

export default function AdminMfaVerifyScreen() {
  if (Platform.OS !== "web") return <Redirect href="/Login" />;
  return <WebAdminMfaVerifyScreen />;
}

function WebAdminMfaVerifyScreen() {
  const router = useRouter();
  const { refreshAdmin, signOut } = useAdminAuth();
  const started = useRef(false);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const state = await getAdminMfaState();
        if (!state.requirement) {
          await refreshAdmin();
          router.replace("/admin-dashboard");
          return;
        }
        if (state.requirement === "setup" || !state.factorId) {
          router.replace("/AdminMfaSetup");
          return;
        }
        setFactorId(state.factorId);
      } catch (caught) {
        setError(getAdminMfaError(caught, "Unable to load Authenticator verification."));
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshAdmin, router]);

  const verify = async () => {
    if (!factorId || verifying || code.length !== MFA_CODE_LENGTH) return;
    setVerifying(true);
    setError("");
    try {
      const identity = await verifyAdminMfaCode(factorId, code);
      await refreshAdmin(identity.session);
      if (router.canDismiss()) router.dismissAll();
      router.replace("/admin-dashboard");
    } catch (caught) {
      setCode("");
      setError(getAdminMfaError(caught, "Unable to verify Microsoft Authenticator."));
    } finally {
      setVerifying(false);
    }
  };

  const cancel = async () => {
    await signOut();
    router.replace("/AdminLogin");
  };

  return (
    <AuthScreenLayout
      backRoute="/AdminLogin"
      eyebrow="Admin Security"
      title="Authenticator verification"
      subtitle="Enter the current 6-digit code from Microsoft Authenticator."
      footer={
        <AuthLinkButton onPress={() => void cancel()} disabled={verifying}>
          <Text className="text-muted-foreground text-body">Cancel and sign out</Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        {loading ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="small" />
          </View>
        ) : (
          <>
            <OtpCodeField
              length={MFA_CODE_LENGTH}
              value={code}
              onChange={(value) => { setCode(value); setError(""); }}
              onSubmit={() => void verify()}
              disabled={verifying || !factorId}
            />
            {error ? <AuthAlert tone="error" message={error} /> : null}
            <AuthSubmitButton
              label="Verify and continue"
              loadingLabel="Verifying…"
              loading={verifying}
              disabled={!factorId || code.length !== MFA_CODE_LENGTH}
              onPress={() => void verify()}
            />
          </>
        )}
      </View>
    </AuthScreenLayout>
  );
}
