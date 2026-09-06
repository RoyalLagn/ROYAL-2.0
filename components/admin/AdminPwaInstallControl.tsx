import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Download } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandColors } from "@/constants/brandPalette";
import { typeLeading, typeScale } from "@/constants/typography";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type AdminPwaWindow = Window & {
  __royalLagnAdminInstallPrompt?: InstallPromptEvent | null;
};

function isStandalone() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function AdminPwaInstallControl({ compact, variant = "sidebar" }: { compact: boolean; variant?: "sidebar" | "card" }) {
  const { colorScheme } = useAppTheme();
  const colors = brandColors(colorScheme === "dark");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [installing, setInstalling] = useState(false);
  const [promptChecked, setPromptChecked] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    let manifest = document.querySelector<HTMLLinkElement>('link[data-royallagn-admin-manifest="true"]');
    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      manifest.href = "/admin-manifest.webmanifest";
      manifest.dataset.royallagnAdminManifest = "true";
      document.head.appendChild(manifest);
    }

    const browserWindow = window as AdminPwaWindow;
    if (browserWindow.__royalLagnAdminInstallPrompt) {
      setInstallPrompt(browserWindow.__royalLagnAdminInstallPrompt);
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      const nextPrompt = event as InstallPromptEvent;
      browserWindow.__royalLagnAdminInstallPrompt = nextPrompt;
      setInstallPrompt(nextPrompt);
    };
    const onPromptReady = () => {
      setInstallPrompt(browserWindow.__royalLagnAdminInstallPrompt ?? null);
      setPromptChecked(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      browserWindow.__royalLagnAdminInstallPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("royallagn-admin-install-ready", onPromptReady);
    window.addEventListener("appinstalled", onInstalled);
    void navigator.serviceWorker?.register("/admin-service-worker.js", { scope: "/" }).catch(() => undefined);
    const promptTimer = window.setTimeout(() => setPromptChecked(true), 2500);

    return () => {
      window.clearTimeout(promptTimer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("royallagn-admin-install-ready", onPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
      manifest?.remove();
    };
  }, []);

  const install = useCallback(async () => {
    if (installed) return;
    if (!installPrompt) {
      Alert.alert(
        "Install Admin Portal",
        "In Chrome or Edge, open the browser menu and choose Install RoyalLagn Admin Portal. On Safari, choose Share, then Add to Home Screen.",
      );
      return;
    }
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      (window as AdminPwaWindow).__royalLagnAdminInstallPrompt = null;
    } finally {
      setInstalling(false);
    }
  }, [installPrompt, installed]);

  return (
    <View style={[
      variant === "sidebar" ? styles.sidebarWrap : styles.cardWrap,
      { borderColor: colors.border, backgroundColor: variant === "card" ? colors.card : undefined },
    ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={installed ? "Admin Portal installed" : "Install Admin Portal"}
        accessibilityState={{ disabled: installed || installing || (!installPrompt && !promptChecked) }}
        disabled={installed || installing || (!installPrompt && !promptChecked)}
        onPress={() => void install()}
        style={({ pressed }) => [
          styles.button,
          compact && styles.compactButton,
          { backgroundColor: installed ? colors.muted : colors.actionTint },
          pressed && styles.pressed,
        ]}
      >
        {installed
          ? <CheckCircle2 size={18} color={colors.mutedForeground} />
          : <Download size={18} color={adminPalette.brand} />}
        {!compact ? (
          <View style={styles.copy}>
            <Text style={[styles.label, { color: installed ? colors.mutedForeground : adminPalette.brand }]}>
              {installed ? "Admin Portal installed" : installing ? "Opening installer…" : !installPrompt && !promptChecked ? "Preparing installer…" : "Install Admin Portal"}
            </Text>
            {!installed ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>Open as a standalone app</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarWrap: { borderTopWidth: StyleSheet.hairlineWidth, padding: 10 },
  cardWrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 10, marginTop: 16 },
  button: { minHeight: 52, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  compactButton: { width: 48, alignSelf: "center", justifyContent: "center", paddingHorizontal: 0 },
  copy: { flex: 1, minWidth: 0 },
  label: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, fontWeight: "800" },
  hint: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 1 },
  pressed: { opacity: 0.72 },
});
