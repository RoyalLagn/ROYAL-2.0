import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { supabase } from "@/services/supabase";

type RegisterOptions = {
  role: "public_user" | "vendor" | "admin";
  force?: boolean;
};

const CURRENT_DEVICE_TOKEN_KEY = "royallagn.current-device-push-token";
const pushPreferenceKey = (profileId: string) => `royallagn.push-enabled.${profileId}`;

function projectId() {
  return (
    Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? null
  );
}

async function loadNotifications() {
  if (Platform.OS === "web" || Constants.appOwnership === "expo") return null;
  return import("expo-notifications");
}

export const PushTokenService = {
  async registerForCurrentUser(options: RegisterOptions) {
    const Notifications = await loadNotifications();
    if (!Notifications) return null;
    if (!Device.isDevice) return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("enquiries", {
        name: "New enquiries",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 180, 250],
        lightColor: "#E91E63",
        sound: "default",
      });
      await Notifications.setNotificationChannelAsync("default", {
        name: "RoyalLagn notifications",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
      });
    }

    const { data: auth } = await supabase.auth.getUser();
    const profileId = auth.user?.id;
    if (!profileId) return null;
    if (!options.force && await SecureStore.getItemAsync(pushPreferenceKey(profileId)) === "false") {
      return null;
    }

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    const id = projectId();
    const tokenResponse = id
      ? await Notifications.getExpoPushTokenAsync({ projectId: id })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data?.trim();
    if (!token) return null;

    // Platform.OS is typed without "web" in the native RN types, but
    // react-native-web reports "web" at runtime, so widen before comparing.
    const os = Platform.OS as string;
    const platform =
      os === "ios" || os === "android" || os === "web" ? os : "unknown";

    const { error } = await supabase.from("push_tokens").upsert(
      {
        profile_id: profileId,
        role: options.role,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,token" },
    );
    if (error) throw error;
    await SecureStore.setItemAsync(CURRENT_DEVICE_TOKEN_KEY, token);
    await SecureStore.setItemAsync(pushPreferenceKey(profileId), "true");
    return token;
  },

  async isEnabledForCurrentDevice() {
    const Notifications = await loadNotifications();
    if (!Notifications || !Device.isDevice) return false;
    const { data: auth } = await supabase.auth.getUser();
    const profileId = auth.user?.id;
    if (!profileId) return false;
    if (await SecureStore.getItemAsync(pushPreferenceKey(profileId)) === "false") return false;
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return false;
    const token = (await SecureStore.getItemAsync(CURRENT_DEVICE_TOKEN_KEY))?.trim();
    if (!token) return false;
    const { data, error } = await supabase
      .from("push_tokens")
      .select("id")
      .eq("profile_id", profileId)
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async setEnabledForCurrentDevice(enabled: boolean, role: RegisterOptions["role"]) {
    const { data: auth } = await supabase.auth.getUser();
    const profileId = auth.user?.id;
    if (!profileId) throw new Error("Sign in to change push notification settings.");
    if (!enabled) {
      await this.unregisterCurrentDevice({ strict: true });
      await SecureStore.setItemAsync(pushPreferenceKey(profileId), "false");
      return false;
    }
    const token = await this.registerForCurrentUser({ role, force: true });
    if (!token) throw new Error("Allow notifications in your phone settings to enable push notifications.");
    return true;
  },

  async unregisterCurrentDevice(options: { strict?: boolean } = {}) {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    try {
      let token = (await SecureStore.getItemAsync(CURRENT_DEVICE_TOKEN_KEY))?.trim();
      if (!token) {
        const id = projectId();
        const tokenResponse = id
          ? await Notifications.getExpoPushTokenAsync({ projectId: id })
          : await Notifications.getExpoPushTokenAsync();
        token = tokenResponse.data?.trim();
      }
      if (!token) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase
        .from("push_tokens")
        .delete()
        .eq("profile_id", auth.user.id)
        .eq("token", token);
      if (error) throw error;
      await SecureStore.deleteItemAsync(CURRENT_DEVICE_TOKEN_KEY);
    } catch (error) {
      // Vendor logout uses strict mode: do not complete logout while this
      // device is still registered to receive private enquiry pushes.
      if (options.strict) throw error;
      // Other callers keep their existing best-effort logout behaviour.
    }
  },
};
