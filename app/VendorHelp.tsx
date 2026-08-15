import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronRight, CircleHelp, Images, Mail, MessageCircle, Phone, UserRoundPen, Wrench } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useSupportSettings } from "@/hooks/useSupportSettings";
import { canOpenSupportUrl, supportEmailUrl, supportPhoneUrl } from "@/services/supportSettings";
import Pressable from "@/components/InteropSafePressable";

export default function VendorHelp() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data } = useVendorWorkspace();
  const { settings: supportSettings, loading: supportLoading } = useSupportSettings();
  const guides = [
    { title: "Complete your profile", detail: "Business details, contact and search tags", icon: UserRoundPen, route: "/vendor-dashboard" },
    { title: "Manage services", detail: "Create packages and set prices", icon: Wrench, route: "/VendorServices" },
    { title: "Build your portfolio", detail: "Albums, covers, images and videos", icon: Images, route: "/VendorGallery" },
    { title: "Update availability", detail: "Show available, tentative and blocked dates", icon: CalendarDays, route: "/VendorCalendar" },
  ];
  const openEmail = async () => {
    if (!supportSettings.email) return;
    const opened = await canOpenSupportUrl(supportEmailUrl(supportSettings.email, "Vendor support"));
    if (!opened) Alert.alert("Email support", `Contact ${supportSettings.email}`);
  };
  const openPhone = async () => {
    if (!supportSettings.phone) return;
    const opened = await canOpenSupportUrl(supportPhoneUrl(supportSettings.phone));
    if (!opened) Alert.alert("Call support", `Contact ${supportSettings.phone}`);
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>VENDOR SUPPORT</Text><Text style={[styles.title, { color: colors.text }]}>Help & support</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Direct routes to the most common Vendor tasks and a clear way to contact support.</Text>
      <View style={[styles.contact, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <View style={[styles.contactIcon, { backgroundColor: colors.pink }]}><MessageCircle size={23} color="#FFF" /></View><View style={styles.flex}><Text style={[styles.contactTitle, { color: colors.text }]}>Need personal help?</Text><Text style={[styles.contactText, { color: colors.muted }]}>Choose an available way to contact the support team.</Text></View>
        <View style={styles.contactActions}>
          {!supportLoading && supportSettings.showEmail && supportSettings.email ? <Pressable accessibilityRole="button" accessibilityLabel={`Email support at ${supportSettings.email}`} onPress={() => void openEmail()} style={[styles.contactButton, { backgroundColor: colors.pink }]}><Mail size={16} color="#FFF" /><Text style={styles.contactButtonText}>Email</Text></Pressable> : null}
          {!supportLoading && supportSettings.showPhone && supportSettings.phone ? <Pressable accessibilityRole="button" accessibilityLabel={`Call support at ${supportSettings.phone}`} onPress={() => void openPhone()} style={[styles.contactButton, { backgroundColor: colors.pink }]}><Phone size={16} color="#FFF" /><Text style={styles.contactButtonText}>Call</Text></Pressable> : null}
        </View>
      </View>
      <Text style={[styles.section, { color: colors.text }]}>Quick guides</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{guides.map(({ title, detail, icon: Icon, route }, index) => <Pressable key={title} onPress={() => router.push(route as any)} style={({ pressed }) => [styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, pressed && { backgroundColor: colors.surfaceSoft }]}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}><Icon size={19} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.rowDetail, { color: colors.muted }]}>{detail}</Text></View><ChevronRight size={18} color={colors.muted} />
      </Pressable>)}</View>
      <View style={[styles.note, { borderColor: colors.border }]}><CircleHelp size={18} color={colors.muted} /><Text style={[styles.noteText, { color: colors.muted }]}>When reporting a problem, include the page name, device type and what you pressed before the error appeared.</Text></View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 24 }, eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.bodyCompact, marginTop: 4, marginBottom: 20 }, contact: { borderWidth: 1, borderRadius: 22, padding: 15, flexDirection: "row", alignItems: "center", gap: 11 },
  contactIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, contactTitle: { fontSize: typeScale.body, fontWeight: "700" }, contactText: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 },
  contactActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, contactButton: { minHeight: 40, paddingHorizontal: 13, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, contactButtonText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  section: { fontSize: typeScale.body, fontWeight: "700", marginTop: 20, marginBottom: 10 }, card: { borderWidth: 1, borderRadius: 22, overflow: "hidden" }, row: { minHeight: 70, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  icon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center" }, rowTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, rowDetail: { fontSize: typeScale.caption, marginTop: 4 },
  note: { borderWidth: 1, borderStyle: "dashed", borderRadius: 18, padding: 14, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 9 }, noteText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label },
});
