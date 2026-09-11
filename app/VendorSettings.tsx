import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Moon, Sun, Trash2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";

export default function VendorSettings() {
  const router = useRouter();
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data } = useVendorWorkspace();
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>PREFERENCES</Text><Text style={[styles.title, { color: colors.text }]}>Vendor settings</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Manage the appearance and account controls for your workspace.</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Appearance</Text>
        <Pressable onPress={toggleColorScheme} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}>{colorScheme === "dark" ? <Sun size={19} color={colors.pink} /> : <Moon size={19} color={colors.pink} />}</View>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{colorScheme === "dark" ? "Dark appearance" : "Light appearance"}</Text><Text style={[styles.detail, { color: colors.muted }]}>Tap to switch theme. Your choice is saved on this device.</Text></View>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Account</Text>
        <Pressable onPress={() => router.push("/VendorAccountDeletion")} accessibilityRole="link" style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: `${colors.warning}12` }]}><Trash2 size={19} color={colors.warning} /></View>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.warning }]}>Delete vendor profile</Text><Text style={[styles.detail, { color: colors.muted }]}>Request permanent deletion of this vendor workspace and public profile.</Text></View>
        </Pressable>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 24 }, eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.bodyCompact, marginTop: 4, marginBottom: 20 }, card: { borderWidth: 1, borderRadius: 22, overflow: "hidden", marginBottom: 12 },
  section: { fontSize: typeScale.body, fontWeight: "700", padding: 15 }, row: { minHeight: 74, borderTopWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, detail: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 4 },
});
