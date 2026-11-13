import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, ChevronRight, Download } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { fonts, typeLeading, typeScale } from "@/constants/typography";

type Role = "customer" | "vendor";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallWindow = Window & {
  __royalLagnAppInstallPrompt?: { role: Role; event: InstallPrompt } | null;
};

/** A web-only PWA install action shared by profiles and workspace navigation. */
export default function WebAppInstallButton({
  role,
  sidebar = false,
}: {
  role: Role;
  sidebar?: boolean;
}) {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const browser = window as InstallWindow;
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    );
    const sync = () =>
      setPrompt(
        browser.__royalLagnAppInstallPrompt?.role === role
          ? browser.__royalLagnAppInstallPrompt.event
          : null,
      );
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    sync();
    window.addEventListener("royallagn-app-install-ready", sync);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("royallagn-app-install-ready", sync);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [role]);

  if (Platform.OS !== "web") return null;
  const label = installed
    ? "App installed"
    : installing
      ? "Opening installer…"
      : role === "vendor"
        ? "Install Vendor App"
        : "Install RoyalLagn App";
  const fallback =
    role === "vendor" ? "/vendor-install.html" : "/install-app.html";
  async function install() {
    if (installed || installing) return;
    setMessage("");
    if (!prompt) {
      window.location.assign(fallback);
      return;
    }
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      setMessage("Use the install page to add this app to your Home Screen.");
      window.location.assign(fallback);
    } finally {
      (window as InstallWindow).__royalLagnAppInstallPrompt = null;
      setPrompt(null);
      setInstalling(false);
    }
  }
  const Icon = installed ? CheckCircle2 : Download;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Install this website as an app on your device"
        disabled={installed || installing}
        onPress={() => void install()}
        style={({ pressed, hovered, focused }) => [
          styles.button,
          !sidebar && styles.profile,
          {
            backgroundColor:
              hovered || focused
                ? colors.surfaceSoft
                : sidebar
                  ? "transparent"
                  : colors.surface,
            borderColor: focused ? colors.pink : colors.border,
          },
          pressed && { opacity: 0.75 },
        ]}
      >
        <Icon size={18} color={installed ? colors.success : colors.pink} />
        <View style={styles.copy}>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          {!sidebar && (
            <Text style={[styles.hint, { color: colors.muted }]}>
              Add to your Home Screen. No app store needed.
            </Text>
          )}
        </View>
        {!installed && <ChevronRight size={16} color={colors.muted} />}
      </Pressable>
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.hint, { color: colors.muted }]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", minWidth: 0 },
  button: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  profile: { padding: 16 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  label: {
    fontFamily: fonts.sans.semibold,
    fontSize: typeScale.button,
    lineHeight: typeLeading.button,
  },
  hint: {
    fontFamily: fonts.sans.regular,
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.metadata,
  },
});
