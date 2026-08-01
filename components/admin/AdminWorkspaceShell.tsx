import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CircleUserRound, ShieldCheck } from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/components/ThemeProvider";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  adminNavigationGroups,
  adminNavigationKeyForPath,
  isAdminWorkspaceRoute,
} from "@/admin/navigation";

export function AdminWorkspaceShell({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  if (!isAdminWorkspaceRoute(pathname) || width < 768) return <>{children}</>;
  return <View style={styles.shell}><AdminSidebar compact={width < 1040} /><View style={styles.content}>{children}</View></View>;
}

function AdminSidebar({ compact }: { compact: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { identity } = useAdminAuth();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const activeKey = adminNavigationKeyForPath(pathname);
  const surface = dark ? "#17171A" : "#FFFFFF";
  const border = dark ? "#323238" : "#EDE8EB";
  const text = dark ? "#F7F4F6" : "#201A1E";
  const muted = dark ? "#A7A0A4" : "#756C71";

  return <View style={[styles.sidebar, compact && styles.sidebarCompact, { backgroundColor: surface, borderRightColor: border }]}>
    <View style={[styles.brand, { borderBottomColor: border }]}>
      {compact ? <View style={styles.compactBrand}><ShieldCheck size={23} color="#E91E63" /></View> : <RoyalLagnLogo width={172} height={48} />}
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
              active && styles.navItemActive,
              pressed && styles.pressed,
            ]}
          >
            <Icon size={19} color={active ? "#E91E63" : muted} strokeWidth={active ? 2.3 : 1.9} />
            {!compact ? <Text style={[styles.navLabel, { color: active ? "#E91E63" : text }]}>{item.label}</Text> : null}
          </Pressable>;
        })}
      </View>)}
    </ScrollView>
    <View style={[styles.account, compact && styles.accountCompact, { borderTopColor: border }]}>
      {!compact ? <View style={styles.accountCopy}><Text numberOfLines={1} style={[styles.accountName, { color: text }]}>{identity?.profile.full_name || "Administrator"}</Text><Text style={[styles.accountRole, { color: muted }]}>{identity?.profile.role === "super_admin" ? "Super admin" : "Admin"}</Text></View> : null}
      <ThemeToggle size={18} />
      <Pressable accessibilityLabel="Open admin account" onPress={() => router.push("/admin-dash-logout")} style={styles.accountButton}><CircleUserRound size={18} color={muted} /></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", minHeight: 0 },
  content: { flex: 1, minWidth: 0 },
  sidebar: { width: 236, borderRightWidth: StyleSheet.hairlineWidth, flexShrink: 0 },
  sidebarCompact: { width: 76 },
  brand: { height: 72, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  compactBrand: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(233,30,99,.1)", alignItems: "center", justifyContent: "center" },
  navigation: { paddingHorizontal: 12, paddingVertical: 14, gap: 16 },
  group: { gap: 4 },
  groupLabel: { paddingHorizontal: 10, marginBottom: 4, fontSize: 9, lineHeight: 13, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  navItem: { minHeight: 42, borderRadius: 11, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 11 },
  navItemCompact: { justifyContent: "center", paddingHorizontal: 0 },
  navItemActive: { backgroundColor: "rgba(233,30,99,.09)" },
  navLabel: { fontSize: 12, lineHeight: 17, fontWeight: "650" as never },
  pressed: { opacity: .72 },
  account: { minHeight: 68, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
  accountCompact: { justifyContent: "center", flexWrap: "wrap", paddingVertical: 7 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { fontSize: 11, fontWeight: "700" },
  accountRole: { fontSize: 9, marginTop: 2, textTransform: "capitalize" },
  accountButton: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
