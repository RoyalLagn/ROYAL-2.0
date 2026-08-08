import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "@/services/supabase";

type RegisterOptions = {
  role: "public_user" | "vendor" | "admin";
};

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

    const { data: auth } = await supabase.auth.getUser();
    const profileId = auth.user?.id;
    if (!profileId) return null;

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
    return token;
  },

  async unregisterCurrentDevice() {
    const Notifications = await loadNotifications();
    if (!Notifications) return;
    try {
      const id = projectId();
      const tokenResponse = id
        ? await Notifications.getExpoPushTokenAsync({ projectId: id })
        : await Notifications.getExpoPushTokenAsync();
      const token = tokenResponse.data?.trim();
      if (!token) return;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      await supabase
        .from("push_tokens")
        .delete()
        .eq("profile_id", auth.user.id)
        .eq("token", token);
    } catch {
      // Token cleanup is best-effort on logout.
    }
  },
};
