import React from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Bell, Crown, MessageSquareText } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/ThemeProvider";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { useVendorNotifications } from "@/context/VendorNotificationContext";
import { typeStyles } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";
import { vendorTheme } from "./VendorTheme";

const desktopNav = [
  { label: "Dashboard", route: "/vendor-dashboard" },
  { label: "Portfolio", route: "/VendorGallery" },
  { label: "Clips", route: "/VendorClips" },
  { label: "Calendar", route: "/VendorCalendar" },
  { label: "Profile", route: "/Vendors_dash_profile" },
] as const;

export default function VendorHeader(_props: { unread?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const { unreadCount } = useVendorNotifications();
  const colors = vendorTheme[colorScheme];
  const unread = unreadCount;
  const desktop = Platform.OS === "web" && width >= 900;
  const normalizedPath = pathname.toLowerCase();
  const activeRoute = normalizedPath.startsWith("/vendorclip")
    ? "/VendorClips"
    : normalizedPath.startsWith("/vendoreditprofile")
      || normalizedPath.startsWith("/vendorservices")
      || normalizedPath.startsWith("/vendorsubscription")
      || normalizedPath.startsWith("/vendorsettings")
      || normalizedPath.startsWith("/vendorhelp")
      || normalizedPath.startsWith("/vendorprivacy")
      || normalizedPath.startsWith("/vendorterms")
      ? "/Vendors_dash_profile"
      : desktopNav.find((item) => normalizedPath.startsWith(item.route.toLowerCase()))?.route;

  if (desktop) {
    return (
      <View style={[styles.desktopHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.desktopInner}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Vendor dashboard home"
            onPress={() => { if (activeRoute !== "/vendor-dashboard") router.replace("/vendor-dashboard"); }}
            style={({ pressed }) => [styles.desktopBrand, pressed && styles.pressed]}
          >
            <RoyalLagnLogo width={172} height={52} scale={1.9} />
          </Pressable>

          <View style={styles.desktopNav}>
            {desktopNav.map(({ label, route }) => {
              const active = activeRoute === route;
              return (
                <Pressable
                  key={route}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  onPress={() => { if (!active) router.replace(route); }}
                  style={({ pressed }) => [styles.desktopNavItem, pressed && styles.pressed]}
                >
                  <Text style={[styles.desktopNavText, { color: active ? colors.pink : colors.muted }, active && styles.desktopNavTextActive]}>
                    {label}
                  </Text>
                  {active ? <View style={[styles.desktopActiveLine, { backgroundColor: colors.pink }]} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.desktopActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => { if (!normalizedPath.startsWith("/vendorsubscription")) router.push("/VendorSubscription"); }}
              accessibilityLabel="Manage subscription"
              style={({ pressed }) => [
                styles.desktopIconButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Crown size={20} color={normalizedPath.startsWith("/vendorsubscription") ? colors.pink : colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { if (!normalizedPath.startsWith("/vendorenquiries")) router.push("/VendorEnquiries"); }}
              accessibilityLabel="Open enquiries"
              style={({ pressed }) => [
                styles.desktopIconButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <MessageSquareText size={20} color={normalizedPath.startsWith("/vendorenquiries") ? colors.pink : colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { if (!normalizedPath.startsWith("/vendornotifications")) router.push("/VendorNotifications"); }}
              accessibilityLabel="Open notifications"
              style={({ pressed }) => [
                styles.desktopIconButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}
            >
              <Bell size={20} color={normalizedPath.startsWith("/vendornotifications") ? colors.pink : colors.text} />
              {unread > 0 ? <View style={[styles.badge, { backgroundColor: colors.pink }]}><Text style={[styles.badgeText, { color: colors.onPrimary }]}>{unread > 9 ? "9+" : unread}</Text></View> : null}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8, paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16), backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" onPress={() => { if (!normalizedPath.startsWith("/vendorsubscription")) router.push("/VendorSubscription"); }} accessibilityLabel="Manage subscription"
        style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
        <Crown size={20} color={normalizedPath.startsWith("/vendorsubscription") ? colors.pink : colors.text} />
      </Pressable>
      <View style={styles.brandWrap}>
        <RoyalLagnLogo width={168} height={46} />
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => { if (!normalizedPath.startsWith("/vendorenquiries")) router.push("/VendorEnquiries"); }} accessibilityLabel="Open enquiries"
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <MessageSquareText size={19} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { if (!normalizedPath.startsWith("/vendornotifications")) router.push("/VendorNotifications"); }} accessibilityLabel="Open notifications"
          style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
          <Bell size={19} color={colors.text} />
          {unread > 0 && <View style={[styles.badge, { backgroundColor: colors.pink }]}><Text style={[styles.badgeText, { color: colors.onPrimary }]}>{unread > 9 ? "9+" : unread}</Text></View>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 72, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth },
  brandWrap: { position: "absolute", left: "50%", width: 168, height: 46, marginLeft: -84, alignItems: "center", justifyContent: "center" },
  actions: { width: 96, flexDirection: "row", gap: 8 },
  desktopHeader: { width: "100%", minHeight: 72, flexShrink: 0, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 50 },
  desktopInner: { width: "100%", maxWidth: 1280, height: 72, paddingHorizontal: 24, alignSelf: "center", flexDirection: "row", alignItems: "center" },
  desktopBrand: { width: 182, height: 56, alignItems: "flex-start", justifyContent: "center" },
  desktopNav: { flex: 1, height: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  desktopNavItem: { position: "relative", height: "100%", minWidth: 92, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  desktopNavText: { ...typeStyles.tab },
  desktopNavTextActive: { fontFamily: typeStyles.button.fontFamily },
  desktopActiveLine: { position: "absolute", left: 12, right: 12, bottom: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  desktopActions: { width: 182, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  desktopIconButton: { position: "relative", width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  iconButton: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  badge: { position: "absolute", top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { ...typeStyles.caption },
});
