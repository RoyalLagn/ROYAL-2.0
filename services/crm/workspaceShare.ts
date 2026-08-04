import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";

export type WorkspaceShareResult = "shared" | "copied" | "dismissed";

function configuredWebBase() {
  const value = process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || process.env.EXPO_PUBLIC_APP_URL?.trim() || "";
  return /^https?:\/\//i.test(value) ? value.replace(/\/$/, "") : "";
}

// Follows the exact pattern already established in services/vendorShare.ts —
// same three-tier URL resolution (configured web base → window.location on
// web → the app's own royallagn:// scheme as a last resort).
export function buildWorkspaceUrl(token: string) {
  const path = `/CrmWorkspace?token=${encodeURIComponent(token)}`;
  const configured = configuredWebBase();
  if (configured) return `${configured}${path}`;
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}${path}`;
  return Linking.createURL("/CrmWorkspace", { queryParams: { token } });
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

export async function copyWorkspaceLink(token: string): Promise<void> {
  const url = buildWorkspaceUrl(token);
  if (Platform.OS === "web") {
    await copyOnWeb(url);
    return;
  }
  await Clipboard.setStringAsync(url);
}

export async function shareWorkspaceLink(token: string, workspaceName: string): Promise<WorkspaceShareResult> {
  const url = buildWorkspaceUrl(token);
  const text = `${workspaceName} — RoyalLagn Field Workspace\n${url}`;
  if (Platform.OS === "web") {
    const browserNavigator = globalThis.navigator as Navigator & { share?: (data: { title: string; text: string; url: string }) => Promise<void> };
    if (browserNavigator?.share) {
      try {
        await browserNavigator.share({ title: workspaceName, text: `${workspaceName} — RoyalLagn Field Workspace`, url });
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
