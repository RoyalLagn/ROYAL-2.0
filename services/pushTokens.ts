import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
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

export const PushTokenService = {
  async registerForCurrentUser(options: RegisterOptions) {
    if (Platform.OS === "web") return null;
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

    const platform =
      Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
        ? Platform.OS
        : "unknown";

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
    if (Platform.OS === "web") return;
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
