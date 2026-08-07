import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Check, Moon, Save, Sun } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { supabase } from "@/services/supabase";

const definitions = [
  { key: "search_visibility", title: "Search visibility", detail: "Allow customers to discover your public profile." },
  { key: "direct_messages", title: "Direct enquiries", detail: "Allow customers to send business enquiries." },
  { key: "marketing_updates", title: "Product updates", detail: "Receive occasional RoyalLagn growth tips." },
] as const;

export default function VendorSettings() {
  const { colorScheme, toggleColorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, refresh } = useVendorWorkspace();
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSettings({
    search_visibility: data.vendor?.preferences?.search_visibility ?? true,
    direct_messages: data.vendor?.preferences?.direct_messages ?? true,
    marketing_updates: data.vendor?.preferences?.marketing_updates ?? false,
  }), [data.vendor]);
  const save = async () => {
    if (!data.vendor?.id) return Alert.alert("Vendor profile required");
    setSaving(true); setSaved(false);
    const { error } = await supabase.from("vendors").update({ preferences: { ...data.vendor.preferences, ...settings } }).eq("id", data.vendor.id);
    setSaving(false);
    if (error) return Alert.alert("Settings not saved", error.message);
    await refresh(); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>PREFERENCES</Text><Text style={[styles.title, { color: colors.text }]}>Vendor settings</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Control visibility, communication and the appearance of your workspace.</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Appearance</Text>
        <Pressable onPress={toggleColorScheme} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}>{colorScheme === "dark" ? <Sun size={19} color={colors.pink} /> : <Moon size={19} color={colors.pink} />}</View>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{colorScheme === "dark" ? "Dark appearance" : "Light appearance"}</Text><Text style={[styles.detail, { color: colors.muted }]}>Tap to switch theme. Your choice is saved on this device.</Text></View>
        </Pressable>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Business preferences</Text>
        {definitions.map((item) => <View key={item.key} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.detail, { color: colors.muted }]}>{item.detail}</Text></View>
          <Switch value={settings[item.key] ?? false} onValueChange={(value) => setSettings((current) => ({ ...current, [item.key]: value }))} trackColor={{ false: colors.border, true: `${colors.pink}70` }} thumbColor={settings[item.key] ? colors.pink : colors.muted} />
        </View>)}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>{saved && <View style={styles.saved}><Check size={15} color={colors.success} /><Text style={{ color: colors.success, fontSize: typeScale.caption, fontWeight: "700" }}>Saved</Text></View>}<Pressable disabled={saving || loading} onPress={save} style={[styles.save, { backgroundColor: colors.pink }]}>{saving ? <ActivityIndicator color="#FFF" /> : <><Save size={16} color="#FFF" /><Text style={styles.saveText}>Save settings</Text></>}</Pressable></View>
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 24 }, eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.bodyCompact, marginTop: 4, marginBottom: 20 }, card: { borderWidth: 1, borderRadius: 22, overflow: "hidden", marginBottom: 12 },
  section: { fontSize: typeScale.body, fontWeight: "700", padding: 15 }, row: { minHeight: 74, borderTopWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, detail: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 68, padding: 12, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10 }, saved: { flexDirection: "row", alignItems: "center", gap: 4 },
  save: { minWidth: 145, minHeight: 44, paddingHorizontal: 16, borderRadius: 14, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, saveText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
});
