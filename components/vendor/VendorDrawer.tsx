import React from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, SlideInLeft } from "react-native-reanimated";
import {
  Bell, CalendarDays, CircleHelp, CreditCard, Images, LayoutDashboard,
  LogOut, MessageSquareText, Settings, UserRound, Wrench, X,
} from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorLogout } from "@/hooks/useVendorLogout";
import { vendorTheme } from "./VendorTheme";

const menu = [
  { label: "Dashboard", route: "/vendor-dashboard", icon: LayoutDashboard },
  { label: "Enquiries", route: "/VendorEnquiries", icon: MessageSquareText },
  { label: "Calendar", route: "/VendorCalendar", icon: CalendarDays },
  { label: "Notifications", route: "/VendorNotifications", icon: Bell },
  { label: "Portfolio", route: "/VendorGallery", icon: Images },
  { label: "Services & pricing", route: "/VendorServices", icon: Wrench },
  { label: "Subscription", route: "/VendorSubscription", icon: CreditCard },
  { label: "Profile", route: "/Vendors_dash_profile", icon: UserRound },
  { label: "Settings", route: "/VendorSettings", icon: Settings },
  { label: "Help & support", route: "/VendorHelp", icon: CircleHelp },
] as const;

export default function VendorDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname().toLowerCase();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const performVendorLogout = useVendorLogout();

  const navigate = (route: string) => {
    onClose();
    router.push(route as any);
  };
  const executeLogout = async () => {
    try {
      onClose();
      await performVendorLogout();
    } catch {
      Alert.alert("Logout failed", "Unable to leave the Vendor workspace. Please try again.");
    }
  };
  const logout = () => {
    if (Platform.OS === "web") {
      void executeLogout();
      return;
    }
    Alert.alert("Leave Vendor workspace?", "You can return through the shared role-selection screen.", [
    { text: "Cancel", style: "cancel" },
    { text: "Logout", style: "destructive", onPress: () => void executeLogout() },
    ]);
  };

  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
      <Pressable accessibilityLabel="Close vendor menu" style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={SlideInLeft.duration(240)}
        style={[styles.drawer, {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 14),
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
          shadowColor: colors.shadow,
        }]}>
        <View style={styles.top}>
          <View style={styles.brandBlock}>
            <Text style={[styles.brand, { color: colors.text }]}>Royal<Text style={{ color: colors.pink }}>Lagn</Text></Text>
            <Text style={[styles.workspace, { color: colors.muted }]}>Vendor workspace</Text>
          </View>
          <Pressable accessibilityLabel="Close menu" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}>
            <X size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.summary, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.pink }]}><UserRound size={20} color="#FFF" /></View>
          <View style={styles.flex}><Text style={[styles.summaryTitle, { color: colors.text }]}>Manage your business</Text><Text style={[styles.summaryText, { color: colors.muted }]}>Profile, work and customer activity</Text></View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menu}>
          {menu.map(({ label, route, icon: Icon }) => {
            const active = pathname.startsWith(route.toLowerCase());
            return <Pressable key={route} accessibilityRole="button" onPress={() => navigate(route)}
              style={({ pressed }) => [styles.item, active && { backgroundColor: colors.surfaceSoft }, pressed && { opacity: 0.72 }]}>
              <View style={[styles.itemIcon, active && { backgroundColor: `${colors.pink}18` }]}>
                <Icon size={19} color={active ? colors.pink : colors.muted} />
              </View>
              <Text style={[styles.itemLabel, { color: active ? colors.pink : colors.text }, active && styles.itemActive]}>{label}</Text>
              {active && <View style={[styles.activeDot, { backgroundColor: colors.pink }]} />}
            </Pressable>;
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={logout} style={[styles.logout, { borderTopColor: colors.border }]}>
          <LogOut size={19} color={colors.warning} /><Text style={[styles.logoutText, { color: colors.warning }]}>Logout</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(14,8,11,.48)" },
  drawer: { width: "84%", maxWidth: 340, height: "100%", borderRightWidth: StyleSheet.hairlineWidth, shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 24 },
  top: { minHeight: 70, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandBlock: { flex: 1 }, brand: { fontSize: 21, fontWeight: "800", letterSpacing: -0.5 }, workspace: { fontSize: 10, marginTop: 3 },
  close: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  summary: { marginHorizontal: 14, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  summaryIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 }, summaryTitle: { fontSize: 12, fontWeight: "800" }, summaryText: { fontSize: 9, marginTop: 3 },
  menu: { paddingHorizontal: 10, paddingVertical: 12 }, item: { minHeight: 49, borderRadius: 14, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  itemIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  itemLabel: { flex: 1, fontSize: 12, fontWeight: "600" }, itemActive: { fontWeight: "800" },
  activeDot: { width: 5, height: 5, borderRadius: 3, marginRight: 8 },
  logout: { height: 55, marginHorizontal: 15, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8 },
  logoutText: { fontSize: 12, fontWeight: "800" },
});
