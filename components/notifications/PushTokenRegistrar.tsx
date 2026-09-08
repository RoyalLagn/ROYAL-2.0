import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useVendorAuth } from "@/context/VendorAuthContext";
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
  const { profile, isPublicAuthenticated, loading: publicAuthLoading } = usePublicAuth();
  const { isAdminAuthenticated, loading: adminAuthLoading } = useAdminAuth();
  const { loading: vendorAuthLoading } = useVendorAuth();
  const [pendingNavigation, setPendingNavigation] = useState<{ targetPath: string; enquiryId?: string } | null>(null);

  useEffect(() => {
    if (!pendingNavigation || publicAuthLoading || adminAuthLoading || vendorAuthLoading) return;
    const timer = setTimeout(() => {
      router.push({
        pathname: pendingNavigation.targetPath,
        params: pendingNavigation.enquiryId ? { enquiryId: pendingNavigation.enquiryId } : undefined,
      } as never);
      setPendingNavigation(null);
    }, 350);
    return () => clearTimeout(timer);
  }, [adminAuthLoading, pendingNavigation, publicAuthLoading, router, vendorAuthLoading]);

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
          const notificationData = response?.notification.request.content.data;
          const targetPath = notificationData?.targetPath;
          const enquiryId = notificationData?.enquiryId;
          if (typeof targetPath === "string" && targetPath.startsWith("/") && !targetPath.startsWith("//")) {
            setPendingNavigation({
              targetPath,
              enquiryId: typeof enquiryId === "string" && enquiryId ? enquiryId : undefined,
            });
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
