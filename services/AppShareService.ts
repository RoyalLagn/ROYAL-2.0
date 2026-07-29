import { Share } from "react-native";
import { APP_SHARE_CONFIG } from "@/config/appShare";
import { trackAppEvent } from "@/services/appEvents";

export type AppShareResult = "shared" | "dismissed";

export async function shareRoyalLagnApp(): Promise<AppShareResult> {
  const message = APP_SHARE_CONFIG.appUrl
    ? `${APP_SHARE_CONFIG.message}\n${APP_SHARE_CONFIG.appUrl}`
    : APP_SHARE_CONFIG.message;

  const result = await Share.share({
    title: APP_SHARE_CONFIG.title,
    message,
    url: APP_SHARE_CONFIG.appUrl || undefined,
  });

  if (result.action === Share.dismissedAction) return "dismissed";

  trackAppEvent("share_app", {
    activityType: result.activityType ?? null,
    hasConfiguredUrl: Boolean(APP_SHARE_CONFIG.appUrl),
  });
  return "shared";
}
