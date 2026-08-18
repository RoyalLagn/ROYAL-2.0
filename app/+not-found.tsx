import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Home, MapPinOff } from "lucide-react-native";
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
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const colors = brandColors(dark);
  const { width } = useWindowDimensions();
  const compact = width < 420;

  const goHome = () => {
    // Clears any stacked screens above this one first (native), then
    // replaces to Home -- never adds "back to the broken URL" to history.
    if (router.canDismiss()) router.dismissAll();
    router.replace("/");
  };

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
