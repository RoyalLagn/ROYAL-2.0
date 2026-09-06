import React from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { CalendarDays, Menu, RefreshCw } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { fonts } from "@/constants/typography";
import { royalAdmin } from "@/components/admin/dashboard/adminDashboardTheme";
import { useRouter } from "expo-router";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { adminPalette } from "@/theme";

export function DashboardHeader({ refreshing, onRefresh, royal = true }: { refreshing: boolean; onRefresh: () => void; royal?: boolean }) {
  const { identity } = useAdminAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const today = new Date();
  if (!royal) return <ResponsiveContainer className="border-b border-border bg-background" style={{ maxWidth: 1440, alignSelf: "center", width: "100%" }}>
    <AdminPageHeader title="Admin Dashboard" subtitle={`Welcome back, ${identity?.profile.full_name || "Administrator"}`} action={<Pressable accessibilityLabel="Refresh dashboard" disabled={refreshing} onPress={onRefresh} className="min-w-11 min-h-11 rounded-xl border border-border bg-card items-center justify-center">{refreshing ? <ActivityIndicator size="small" color={adminPalette.brand} /> : <RefreshCw size={18} color={adminPalette.brand} />}</Pressable>} />
  </ResponsiveContainer>;
  return <ResponsiveContainer style={styles.container}>
    <View style={[styles.banner, !desktop && styles.bannerMobile]}>
      <View pointerEvents="none" style={styles.goldOrb} />
      {desktop ? <Image source={require("../../../assets/logos/admin-portal.png")} resizeMode="contain" style={styles.bannerArtwork} /> : null}
      {!desktop ? <Pressable accessibilityLabel="Open Admin profile" onPress={() => router.push("/AdminProfile")} style={styles.menuButton}><Menu size={22} color={royalAdmin.navyDeep} /></Pressable> : null}
      <View style={styles.welcomeCopy}>
        <Text style={[styles.title, !desktop && styles.titleMobile]} numberOfLines={2}>Welcome back, {identity?.profile.full_name || "Administrator"}</Text>
        <Text style={styles.subtitle}>Here&apos;s what&apos;s happening with RoyalLagn today.</Text>
      </View>
      {desktop ? <View style={styles.motto}>
        <Text style={styles.mottoText}>“Beautiful Weddings,</Text>
        <Text style={styles.mottoText}>Brighter Connections”</Text>
        <View style={styles.mottoRule} />
      </View> : null}
      <View style={styles.dateBlock}>
        {desktop ? <View style={styles.calendarIcon}><CalendarDays size={22} color={royalAdmin.navy} /></View> : null}
        {desktop ? <View>
          <Text style={styles.weekday}>{today.toLocaleDateString("en-IN", { weekday: "long" })}</Text>
          <Text style={styles.date}>{today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</Text>
        </View> : null}
        <Pressable
          accessibilityLabel="Refresh dashboard"
          accessibilityState={{ disabled: refreshing, busy: refreshing }}
          disabled={refreshing}
          onPress={onRefresh}
          style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}
        >{refreshing ? <ActivityIndicator size="small" color={royalAdmin.navy} /> : <RefreshCw size={20} color={royalAdmin.navy} />}</Pressable>
      </View>
    </View>
  </ResponsiveContainer>;
}

const styles = StyleSheet.create({
  container: { maxWidth: 1600, alignSelf: "center", width: "100%", paddingTop: 14 },
  banner: { minHeight: 140, overflow: "hidden", borderWidth: 1, borderColor: royalAdmin.goldBorder, borderRadius: 16, backgroundColor: "#FBFDFF", paddingHorizontal: 30, paddingVertical: 22, flexDirection: "row", alignItems: "center", gap: 24 },
  bannerMobile: { minHeight: 126, paddingHorizontal: 16, paddingVertical: 18, gap: 10 },
  goldOrb: { position: "absolute", width: 280, height: 280, borderRadius: 140, right: "35%", top: -174, backgroundColor: royalAdmin.goldWash, borderWidth: 38, borderColor: royalAdmin.goldWashBorder },
  bannerArtwork: { position: "absolute", width: 190, height: 190, left: "45%", top: -24, opacity: .12 },
  menuButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: royalAdmin.goldTint },
  welcomeCopy: { flex: 1, minWidth: 0 },
  title: { color: royalAdmin.navyDeep, fontFamily: fonts.serif.bold, fontSize: 30, lineHeight: 38, letterSpacing: -.5 },
  titleMobile: { fontSize: 22, lineHeight: 28 },
  subtitle: { color: royalAdmin.navyMuted, fontFamily: fonts.sans.regular, fontSize: 14, lineHeight: 21, marginTop: 5 },
  motto: { minWidth: 230, alignItems: "center" },
  mottoText: { color: royalAdmin.navy, fontFamily: fonts.serif.boldItalic, fontSize: 16, lineHeight: 23 },
  mottoRule: { width: 64, height: 1, marginTop: 8, backgroundColor: royalAdmin.gold },
  dateBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  calendarIcon: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "#F8FBFF", alignItems: "center", justifyContent: "center" },
  weekday: { color: royalAdmin.navyMuted, fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 17 },
  date: { color: royalAdmin.navyDeep, fontFamily: fonts.sans.bold, fontSize: 13, lineHeight: 18, marginTop: 1 },
  refresh: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "#F8FBFF", alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: .97 }], opacity: .82 },
});
