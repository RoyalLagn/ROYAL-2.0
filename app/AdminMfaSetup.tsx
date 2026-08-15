import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {
  AuthAlert,
  AuthLinkButton,
  AuthSubmitButton,
} from "@/components/auth/AuthPrimitives";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { AdminAuthError } from "@/services/adminAuth";
import {
  beginAdminMfaEnrollment,
  getAdminMfaError,
  getAdminMfaState,
  verifyAdminMfaCode,
  type AdminMfaEnrollment,
} from "@/services/adminMfa";

const MFA_CODE_LENGTH = 6;

export default function AdminMfaSetupScreen() {
  if (Platform.OS !== "web") return <Redirect href="/Login" />;
  return <WebAdminMfaSetupScreen />;
}

function WebAdminMfaSetupScreen() {
  const router = useRouter();
  const { refreshAdmin, signOut } = useAdminAuth();
  const started = useRef(false);
  const [enrollment, setEnrollment] = useState<AdminMfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const loadEnrollment = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const state = await getAdminMfaState();
      if (!state.requirement) {
        await refreshAdmin();
        router.replace("/admin-dashboard");
        return;
      }
      if (state.requirement === "verify") {
        router.replace("/AdminMfaVerify");
        return;
      }
      setEnrollment(await beginAdminMfaEnrollment());
    } catch (caught) {
      // Supabase authoritatively confirmed a verified factor already exists
      // (it can appear between our initial state check and enrollment, e.g.
      // after a refresh in another tab). Go straight to the challenge screen
      // instead of leaving setup at a dead-end error.
      if (caught instanceof AdminAuthError && caught.code === "mfa_required") {
        router.replace("/AdminMfaVerify");
        return;
      }
      try {
        const latestState = await getAdminMfaState();
        if (latestState.requirement === "verify") {
          router.replace("/AdminMfaVerify");
          return;
        }
      } catch {
        // Preserve the original enrollment error below.
      }
      setError(getAdminMfaError(caught, "Unable to prepare Authenticator setup."));
    } finally {
      setLoading(false);
    }
  }, [refreshAdmin, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadEnrollment();
  }, [loadEnrollment]);

  const verify = async () => {
    if (!enrollment || verifying || code.length !== MFA_CODE_LENGTH) return;
    setVerifying(true);
    setError("");
    try {
      const identity = await verifyAdminMfaCode(enrollment.factorId, code);
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
      title="Set up Microsoft Authenticator"
      subtitle="Scan this QR code once, then enter the current 6-digit code."
      footer={
        <AuthLinkButton onPress={() => void cancel()} disabled={verifying}>
          <Text className="text-muted-foreground text-body">Cancel and sign out</Text>
        </AuthLinkButton>
      }
    >
      <View className="gap-4">
        {loading ? (
          <View className="items-center justify-center py-12 gap-3">
            <ActivityIndicator size="small" />
            <Text className="text-muted-foreground text-body">Preparing secure setup…</Text>
          </View>
        ) : enrollment ? (
          <>
            <View className="items-center gap-3">
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel="Microsoft Authenticator setup QR code"
                className="bg-white border border-border rounded-2xl p-3"
              >
                <QRCode
                  value={enrollment.authenticatorUri}
                  size={208}
                  color="#111111"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text className="text-muted-foreground text-small text-center leading-5">
                In Microsoft Authenticator, choose Add account, then Other account,
                and scan the QR code.
              </Text>
            </View>

            <View className="bg-muted/50 border border-border rounded-2xl px-4 py-3">
              <Text className="text-muted-foreground text-xs text-center mb-1">
                Manual setup key
              </Text>
              <Text selectable className="text-foreground text-small font-semibold text-center">
                {enrollment.secret}
              </Text>
            </View>

            <OtpCodeField
              length={MFA_CODE_LENGTH}
              value={code}
              onChange={(value) => { setCode(value); setError(""); }}
              onSubmit={() => void verify()}
              disabled={verifying}
            />
            {error ? <AuthAlert tone="error" message={error} /> : null}
            <AuthSubmitButton
              label="Enable Authenticator"
              loadingLabel="Verifying…"
              loading={verifying}
              disabled={code.length !== MFA_CODE_LENGTH}
              onPress={() => void verify()}
            />
          </>
        ) : (
          <>
            {error ? <AuthAlert tone="error" message={error} /> : null}
            <AuthSubmitButton
              label="Try again"
              onPress={() => void loadEnrollment()}
            />
          </>
        )}
      </View>
    </AuthScreenLayout>
  );
}
