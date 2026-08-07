import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";

export type MarketingWorkspaceShareResult = "shared" | "copied" | "dismissed";

function configuredWebBase() {
  const value = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || process.env.EXPO_PUBLIC_APP_URL?.trim() || "";
  return /^https?:\/\//i.test(value) ? value.replace(/\/$/, "") : "";
}

// Same three-tier URL resolution as services/crm/workspaceShare.ts.
export function buildMarketingWorkspaceUrl(token: string) {
  const path = `/CrmMarketingWorkspace?token=${encodeURIComponent(token)}`;
  const configured = configuredWebBase();
  if (configured) return `${configured}${path}`;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${path}`;
  return Linking.createURL("/CrmMarketingWorkspace", { queryParams: { token } });
}

async function copyOnWeb(value: string) {
  const browserNavigator = globalThis.navigator as Navigator & { clipboard?: { writeText: (text: string) => Promise<void> } };
  if (browserNavigator?.clipboard?.writeText) {
    await browserNavigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Copying is not supported in this browser.");
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(field);
  if (!copied) throw new Error("The workspace link could not be copied.");
}

export async function copyMarketingWorkspaceLink(token: string): Promise<void> {
  const url = buildMarketingWorkspaceUrl(token);
  if (Platform.OS === "web") {
    await copyOnWeb(url);
    return;
  }
  await Clipboard.setStringAsync(url);
}

export async function shareMarketingWorkspaceLink(token: string, workspaceName: string): Promise<MarketingWorkspaceShareResult> {
  const url = buildMarketingWorkspaceUrl(token);
  const text = `${workspaceName} — RoyalLagn Marketing Workspace\n${url}`;
  if (Platform.OS === "web") {
    const browserNavigator = globalThis.navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
    if (browserNavigator?.share) {
      try {
        await browserNavigator.share({ title: workspaceName, text: `${workspaceName} — RoyalLagn Marketing Workspace`, url });
        return "shared";
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return "dismissed";
      }
    }
    await copyOnWeb(text);
    return "copied";
  }
  const result = await Share.share({ title: workspaceName, message: text, url });
  return result.action === Share.dismissedAction ? "dismissed" : "shared";
}
