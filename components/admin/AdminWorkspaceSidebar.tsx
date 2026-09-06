import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CircleUserRound, ShieldCheck } from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/components/ThemeProvider";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  adminNavigationGroups,
  adminNavigationKeyForPath,
} from "@/admin/navigation";
import { typeScale, typeLeading } from "@/constants/typography";
import { adminPalette } from "@/theme";
import { brandColors } from "@/constants/brandPalette";
import { countUnreadAdminNotifications, subscribeToAdminNotifications } from "@/services/adminNotifications";
import { AdminPwaInstallControl } from "@/components/admin/AdminPwaInstallControl";

export function AdminWorkspaceSidebar({ compact }: { compact: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { identity } = useAdminAuth();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const colors = brandColors(dark);
  const activeKey = adminNavigationKeyForPath(pathname);
  const surface = colors.card;
  const border = colors.border;
  const text = colors.foreground;
  const muted = colors.mutedForeground;
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const refreshUnread = useCallback(() => { void countUnreadAdminNotifications().then(setUnreadNotifications).catch(() => undefined); }, []);
  useEffect(() => { refreshUnread(); return subscribeToAdminNotifications(refreshUnread); }, [refreshUnread]);

  return <View style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: surface, borderRightColor: border }]}>
    <View style={[styles.brand, { borderBottomColor: border }]}>
      {compact ? <View style={[styles.compactBrand, { backgroundColor: colors.actionTint }]}><ShieldCheck size={23} color={adminPalette.brand} /></View> : <RoyalLagnLogo width={172} height={48} />}
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.navigation}>
      {adminNavigationGroups.map((group) => <View key={group.label} style={styles.group}>
        {!compact ? <Text style={[styles.groupLabel, { color: muted }]}>{group.label}</Text> : null}
        {group.items.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return <Pressable
            key={item.key}
            accessibilityRole="link"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) router.replace(item.route as never);
            }}
            style={({ pressed }) => [
              styles.navItem,
              compact && styles.navItemCompact,
              active && { backgroundColor: colors.actionTint },
              pressed && styles.pressed,
            ]}
          >
            <Icon size={19} color={active ? adminPalette.brand : muted} strokeWidth={active ? 2.3 : 1.9} />
            {!compact ? <Text style={[styles.navLabel, { color: active ? adminPalette.brand : text }]}>{item.label}</Text> : null}
            {item.key === "notifications" && unreadNotifications > 0 ? <View style={[styles.badge, compact && styles.badgeCompact]}><Text style={styles.badgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text></View> : null}
          </Pressable>;
        })}
      </View>)}
    </ScrollView>
    <AdminPwaInstallControl compact={compact} />
    <View style={[styles.account, compact && styles.accountCompact, { borderTopColor: border }]}>
      {!compact ? <View style={styles.accountCopy}><Text numberOfLines={1} style={[styles.accountName, { color: text }]}>{identity?.profile.full_name || "Administrator"}</Text><Text style={[styles.accountRole, { color: muted }]}>{identity?.profile.role === "super_admin" ? "Super admin" : "Admin"}</Text></View> : null}
      <ThemeToggle size={18} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open admin account" onPress={() => router.push("/AdminProfile")} style={styles.accountButton}><CircleUserRound size={18} color={muted} /></Pressable>
    </View>
  </View>;
}


const styles = StyleSheet.create({
  sidebar: { width: 236, borderRightWidth: StyleSheet.hairlineWidth, flexShrink: 0, minHeight: 0 },
  sidebarCompact: { width: 76 },
  brand: { height: 72, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  compactBrand: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  navigation: { paddingHorizontal: 12, paddingVertical: 14, gap: 16 },
  group: { gap: 4 },
  groupLabel: { paddingHorizontal: 10, marginBottom: 4, fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  navItem: { minHeight: 48, borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 11 },
  navItemCompact: { justifyContent: "center", paddingHorizontal: 0 },
  navLabel: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.tab, fontWeight: "600" },
  pressed: { opacity: .72 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: adminPalette.brand, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  badgeCompact: { position: "absolute", right: 3, top: 3, minWidth: 18, height: 18, paddingHorizontal: 4 },
  badgeText: { color: "#FFFFFF", fontSize: 10, lineHeight: 13, fontWeight: "800" },
  account: { minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
  accountCompact: { justifyContent: "center", flexWrap: "wrap", paddingVertical: 7 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { fontSize: typeScale.metadata, fontWeight: "700" },
  accountRole: { fontSize: typeScale.caption, marginTop: 2, textTransform: "capitalize" },
  accountButton: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
