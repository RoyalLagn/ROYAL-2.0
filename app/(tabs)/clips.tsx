import React, { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Clapperboard, Sparkles } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { trackAppEvent } from "@/services/appEvents";

const PINK = "#E91E63";

export default function ClipsScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { width } = useWindowDimensions();
  const dark = colorScheme === "dark";
  const contentWidth = Math.min(width - (width < 380 ? 28 : 40), 680);

  useEffect(() => {
    trackAppEvent("open_clips");
  }, []);

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.root, { backgroundColor: dark ? "#070B14" : "#FFFFFF" }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.content, { width: contentWidth }]}>
          <View
            style={[
              styles.illustration,
              {
                backgroundColor: dark ? "#2A1720" : "#FFF0F6",
                borderColor: dark ? "#633149" : "#F5C7D8",
              },
            ]}
          >
            <Clapperboard size={54} color={PINK} strokeWidth={1.7} />
            <View style={styles.sparkle}>
              <Sparkles size={19} color={PINK} />
            </View>
          </View>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>COMING SOON</Text>
          </View>

          <Text style={[styles.title, { color: dark ? "#FFF8FB" : "#17111D" }]}>
            Clips Coming Soon
          </Text>
          <Text style={[styles.subtitle, { color: dark ? "#B9ADB3" : "#71676D" }]}>
            We&apos;re preparing short wedding videos and inspiration for you.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            onPress={() => router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Back to Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { alignItems: "center", paddingHorizontal: 8 },
  illustration: {
    width: 132,
    height: 132,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sparkle: {
    position: "absolute",
    top: 22,
    right: 22,
  },
  badge: {
    minHeight: 27,
    marginTop: 24,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFF0F6",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: PINK,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: {
    marginTop: 13,
    fontFamily: "serif",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    maxWidth: 430,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  button: {
    minWidth: 160,
    minHeight: 48,
    marginTop: 25,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
