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
    <View style={[styles.banner, desktop ? styles.bannerDesktop : styles.bannerMobile]}>
      {desktop ? (
        <>
          <View pointerEvents="none" style={styles.bannerArtworkFrame}>
            <Image source={require("../../../assets/logos/landscape-logo-admin.png")} resizeMode="cover" style={styles.bannerArtwork} />
          </View>
          <View pointerEvents="none" style={styles.bannerShade} />
          <View style={styles.welcomeCopy}>
            <Text style={[styles.title, styles.titleDesktop]} numberOfLines={2}>Welcome back,{"\n"}{identity?.profile.full_name || "Administrator"}</Text>
          </View>
          <View style={styles.desktopControls}>
            <View style={styles.refreshColumn}>
              <Pressable
                accessibilityLabel="Refresh dashboard"
                accessibilityState={{ disabled: refreshing, busy: refreshing }}
                disabled={refreshing}
                onPress={onRefresh}
                style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}
              >{refreshing ? <ActivityIndicator size="small" color={royalAdmin.navy} /> : <RefreshCw size={18} color={royalAdmin.navy} />}</Pressable>
            </View>
            <View style={styles.dateBlock}>
              <View style={styles.calendarIcon}><CalendarDays size={20} color={royalAdmin.navy} /></View>
              <View style={styles.dateCopy}>
                <Text style={styles.weekday}>{today.toLocaleDateString("en-IN", { weekday: "long" })}</Text>
                <Text style={styles.date}>{today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</Text>
              </View>
            </View>
          </View>
        </>
      ) : (
        <>
          <View pointerEvents="none" style={styles.goldOrb} />
          <Pressable accessibilityLabel="Open Admin profile" onPress={() => router.push("/AdminProfile")} style={styles.menuButton}><Menu size={22} color={royalAdmin.navyDeep} /></Pressable>
          <View style={styles.welcomeCopy}>
            <Text style={[styles.title, styles.titleMobile]} numberOfLines={2}>Welcome back, {identity?.profile.full_name || "Administrator"}</Text>
            <Text style={styles.subtitle}>Here&apos;s what&apos;s happening with RoyalLagn today.</Text>
          </View>
          <View style={styles.dateBlock}>
            <Pressable
              accessibilityLabel="Refresh dashboard"
              accessibilityState={{ disabled: refreshing, busy: refreshing }}
              disabled={refreshing}
              onPress={onRefresh}
              style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}
            >{refreshing ? <ActivityIndicator size="small" color={royalAdmin.navy} /> : <RefreshCw size={20} color={royalAdmin.navy} />}</Pressable>
          </View>
        </>
      )}
    </View>
  </ResponsiveContainer>;
}

const styles = StyleSheet.create({
  container: { maxWidth: 1600, alignSelf: "center", width: "100%", paddingTop: 14 },
  banner: { minHeight: 140, overflow: "hidden", borderWidth: 1, borderColor: royalAdmin.goldBorder, borderRadius: 16, backgroundColor: "#FBFDFF", paddingHorizontal: 30, paddingVertical: 22, flexDirection: "row", alignItems: "center", gap: 24 },
  bannerDesktop: { width: "100%", minHeight: 96, paddingHorizontal: 24, paddingVertical: 8, borderColor: royalAdmin.goldBorder, backgroundColor: "#FBFDFF" },
  bannerMobile: { minHeight: 126, paddingHorizontal: 16, paddingVertical: 18, gap: 10 },
  goldOrb: { position: "absolute", width: 280, height: 280, borderRadius: 140, right: "35%", top: -174, backgroundColor: royalAdmin.goldWash, borderWidth: 38, borderColor: royalAdmin.goldWashBorder },
  bannerArtworkFrame: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  bannerArtwork: { width: "100%", height: "100%", opacity: .2 },
  bannerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(251,253,255,.34)" },
  desktopControls: { alignItems: "flex-end", justifyContent: "center", gap: 7, marginLeft: "auto" },
  refreshColumn: { alignItems: "flex-end", justifyContent: "center" },
  menuButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: royalAdmin.goldTint },
  welcomeCopy: { flex: 1, minWidth: 0 },
  title: { color: royalAdmin.navyDeep, fontFamily: fonts.serif.bold, fontSize: 30, lineHeight: 38, letterSpacing: -.5 },
  titleDesktop: { fontSize: 25, lineHeight: 31, letterSpacing: -.4 },
  titleMobile: { fontSize: 22, lineHeight: 28 },
  subtitle: { color: royalAdmin.navyMuted, fontFamily: fonts.sans.regular, fontSize: 14, lineHeight: 21, marginTop: 5 },
  dateBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  dateCopy: { minWidth: 0, flex: 1 },
  calendarIcon: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "rgba(248,251,255,.94)", alignItems: "center", justifyContent: "center" },
  weekday: { color: royalAdmin.navyMuted, fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 17 },
  date: { color: royalAdmin.navyDeep, fontFamily: fonts.sans.bold, fontSize: 13, lineHeight: 18, marginTop: 1 },
  refresh: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "#F8FBFF", alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: .97 }], opacity: .82 },
});
