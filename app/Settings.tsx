import React, { useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import FrontendScreen from "@/components/FrontendScreen";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { PushTokenService } from "@/services/pushTokens";
import { defaultCommunicationPreferences, getCommunicationPreferences, setEmailUpdatesEnabled } from "@/services/communicationPreferences";

const PUSH = "Push Notifications";
const EMAIL = "Email Updates";

export default function Settings() {
  const { isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(defaultCommunicationPreferences.emailUpdatesEnabled);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!isPublicAuthenticated) {
      setPushEnabled(false);
      setEmailEnabled(defaultCommunicationPreferences.emailUpdatesEnabled);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      Platform.OS === "web" ? Promise.resolve(false) : PushTokenService.isEnabledForCurrentDevice(),
      getCommunicationPreferences(),
    ]).then(([push, preferences]) => {
      if (!active) return;
      setPushEnabled(push);
      setEmailEnabled(preferences.emailUpdatesEnabled);
    }).catch((error) => {
      if (active) Alert.alert("Settings unavailable", error instanceof Error ? error.message : "Unable to load your preferences.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, isPublicAuthenticated]);

  const changeSetting = async (item: string, enabled: boolean) => {
    if (!isPublicAuthenticated) {
      Alert.alert("Sign in required", "Sign in to manage notification preferences.");
      return;
    }
    setBusy(item);
    try {
      if (item === PUSH) {
        setPushEnabled(await PushTokenService.setEnabledForCurrentDevice(enabled, "public_user"));
      } else if (item === EMAIL) {
        await setEmailUpdatesEnabled(enabled);
        setEmailEnabled(enabled);
      }
    } catch (error) {
      Alert.alert("Setting not changed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const unavailable = authLoading || loading || !isPublicAuthenticated;
  return (
    <FrontendScreen
      title="Settings"
      subtitle="Manage your app preferences"
      mode="settings"
      items={[PUSH, EMAIL]}
      settingValues={{ [PUSH]: pushEnabled, [EMAIL]: emailEnabled }}
      settingDetails={{
        [PUSH]: Platform.OS === "web" ? "Available in the RoyalLagn mobile app" : unavailable ? "Sign in to manage" : pushEnabled ? "Enabled on this device" : "Disabled on this device",
        [EMAIL]: unavailable ? "Sign in to manage" : emailEnabled ? "Product news and updates enabled" : "Product news and updates disabled",
      }}
      settingDisabled={{ [PUSH]: unavailable || Platform.OS === "web", [EMAIL]: unavailable }}
      settingBusy={busy}
      onSettingChange={(item, enabled) => void changeSetting(item, enabled)}
    />
  );
}
