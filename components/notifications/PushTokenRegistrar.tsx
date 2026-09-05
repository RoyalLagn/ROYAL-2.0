import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { supabase } from "@/services/supabase";
import { PushTokenService } from "@/services/pushTokens";

const notificationsAvailable =
  Platform.OS !== "web" && Constants.appOwnership !== "expo";

/**
 * Registers the current device's Expo push token for the signed-in
 * customer or vendor profile. No-ops on web and simulators.
 */
export default function PushTokenRegistrar() {
  const router = useRouter();
  const { profile, isPublicAuthenticated } = usePublicAuth();
  const { isAdminAuthenticated } = useAdminAuth();

  useEffect(() => {
    if (!notificationsAvailable) return;

    let cancelled = false;
    let responseSubscription: { remove: () => void } | null = null;

    const register = async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });

        const openNotification = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
          const targetPath = response?.notification.request.content.data?.targetPath;
          if (typeof targetPath === "string" && targetPath.startsWith("/") && !targetPath.startsWith("//")) {
            router.push(targetPath as never);
          }
        };
        responseSubscription = Notifications.addNotificationResponseReceivedListener(openNotification);
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (!cancelled && lastResponse) {
          openNotification(lastResponse);
          await Notifications.clearLastNotificationResponseAsync();
        }

        if (cancelled) return;
        if (isPublicAuthenticated && profile?.role === "public_user") {
          await PushTokenService.registerForCurrentUser({ role: "public_user" });
          return;
        }

        const { data } = await supabase.auth.getUser();
        if (!data.user || cancelled) return;

        const { data: vendor } = await supabase
          .from("vendors")
          .select("id")
          .eq("profile_id", data.user.id)
          .maybeSingle();
        if (vendor) {
          await PushTokenService.registerForCurrentUser({ role: "vendor" });
          return;
        }

        if (isAdminAuthenticated) {
          await PushTokenService.registerForCurrentUser({ role: "admin" });
        }
      } catch (error) {
        console.warn("Push token registration skipped:", error);
      }
    };

    void register();
    return () => {
      cancelled = true;
      responseSubscription?.remove();
    };
  }, [isAdminAuthenticated, isPublicAuthenticated, profile?.id, profile?.role, router]);

  return null;
}
