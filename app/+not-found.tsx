import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { ArrowLeft, Home, LayoutDashboard, MapPinOff, SearchX } from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandColors } from "@/constants/brandPalette";
import { typeStyles } from "@/constants/typography";

/**
 * Expo Router's catch-all screen -- automatically rendered for any URL/route
 * that doesn't match a real screen (typos, deleted routes, stale deep links,
 * shared links to content that no longer exists). No wiring needed beyond
 * this file existing at app/+not-found.tsx; Expo Router owns matching it in.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const colors = brandColors(dark);
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const adminRoute = pathname.toLowerCase().includes("admin");

  const goHome = () => {
    // Clears any stacked screens above this one first (native), then
    // replaces to Home -- never adds "back to the broken URL" to history.
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };

  if (adminRoute) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
        <View className="flex-1 items-center justify-center px-5 py-10">
          <View className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 items-center shadow-sm">
            <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-5">
              <SearchX size={28} className="text-primary" />
            </View>
            <Text className="text-foreground text-2xl font-bold text-center">Admin page not found</Text>
            <Text className="text-muted-foreground text-sm leading-5 text-center mt-2 max-w-md">
              This admin page may have moved, been removed, or the address may be incorrect.
            </Text>
            <Text selectable className="text-muted-foreground text-xs text-center mt-4 px-3 py-2 rounded-xl bg-muted" numberOfLines={2}>{pathname}</Text>
            <View className={`w-full gap-3 mt-6 ${width >= 480 ? "flex-row" : ""}`}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={() => router.canGoBack() ? router.back() : router.replace("/admin-dashboard")}
                className="flex-1 min-h-12 rounded-xl border border-border bg-background flex-row items-center justify-center gap-2 active:opacity-75"
                style={({ pressed }) => pressed ? styles.buttonPressed : undefined}
              >
                <ArrowLeft size={18} className="text-foreground" />
                <Text className="text-foreground font-semibold">Go back</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go to admin dashboard"
                onPress={() => router.replace("/admin-dashboard")}
                className="flex-1 min-h-12 rounded-xl bg-primary flex-row items-center justify-center gap-2 active:opacity-85"
                style={({ pressed }) => pressed ? styles.buttonPressed : undefined}
              >
                <LayoutDashboard size={18} color="#FFFFFF" />
                <Text className="text-white font-semibold">Admin Dashboard</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.content}>
        <RoyalLagnLogo width={compact ? 132 : 156} height={compact ? 36 : 42} style={styles.logo} />

        <View style={[styles.iconRing, { backgroundColor: colors.actionTint }]}>
          <MapPinOff size={compact ? 30 : 36} color={colors.primary} />
        </View>

        <Text style={[typeStyles.editorialPageTitle, styles.title, { color: colors.foreground, fontSize: compact ? 26 : typeStyles.editorialPageTitle.fontSize }]}>
          Page Not Found
        </Text>
        <Text style={[typeStyles.body, styles.subtitle, { color: colors.mutedForeground }]}>
          The page you’re looking for doesn’t exist.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          onPress={goHome}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && styles.buttonPressed,
          ]}
        >
          <Home size={18} color={colors.primaryForeground} />
          <Text style={[typeStyles.button, styles.buttonText, { color: colors.primaryForeground }]}>Go Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  logo: { marginBottom: 28 },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 32,
    maxWidth: 320,
  },
  button: {
    minHeight: 52,
    minWidth: 180,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 28,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 15,
  },
});
