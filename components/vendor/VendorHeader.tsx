import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Menu, Moon, Sun } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/ThemeProvider";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { vendorTheme } from "./VendorTheme";
import VendorDrawer from "./VendorDrawer";

export default function VendorHeader({ unread = 0, onMenu }: { unread?: number; onMenu?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const colors = vendorTheme[colorScheme];
  const ThemeIcon = colorScheme === "dark" ? Sun : Moon;
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Pressable onPress={onMenu ?? (() => setDrawerOpen(true))} accessibilityLabel="Open vendor menu"
        style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
        <Menu size={20} color={colors.text} />
      </Pressable>
      <View style={styles.brandWrap}>
        <RoyalLagnLogo width={168} height={46} />
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push("/VendorNotifications")} accessibilityLabel="Open notifications"
          style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Bell size={19} color={colors.text} />
          {unread > 0 && <View style={[styles.badge, { backgroundColor: colors.pink }]}><Text style={styles.badgeText}>{Math.min(unread, 9)}</Text></View>}
        </Pressable>
        <Pressable onPress={toggleColorScheme}
          accessibilityLabel={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ThemeIcon size={19} color={colors.text} />
        </Pressable>
      </View>
      <VendorDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 68, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  brandWrap: { position: "absolute", left: "50%", width: 168, height: 46, marginLeft: -84, alignItems: "center", justifyContent: "center" },
  actions: { width: 88, flexDirection: "row", gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#FFF", fontSize: 9, lineHeight: 12, fontWeight: "800" },
});
