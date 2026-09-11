import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CircleHelp, Mail, MessageCircle, Phone } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useSupportSettings } from "@/hooks/useSupportSettings";

export default function VendorHelp() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data } = useVendorWorkspace();
  const { settings: supportSettings, loading: supportLoading } = useSupportSettings();
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>VENDOR SUPPORT</Text><Text style={[styles.title, { color: colors.text }]}>Help & support</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Contact the RoyalLagn support team when you need help.</Text>
      <View style={[styles.contact, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <View style={styles.contactHeader}><View style={[styles.contactIcon, { backgroundColor: colors.pink }]}><MessageCircle size={23} color="#FFF" /></View><View style={styles.flex}><Text style={[styles.contactTitle, { color: colors.text }]}>Contact RoyalLagn</Text><Text style={[styles.contactText, { color: colors.muted }]}>Our company contact details</Text></View></View>
        <View style={styles.contactDetails}>
          {!supportLoading && supportSettings.showEmail && supportSettings.email ? <ContactDetail icon={Mail} label="Email" value={supportSettings.email} colors={colors} /> : null}
          {!supportLoading && supportSettings.showPhone && supportSettings.phone ? <ContactDetail icon={Phone} label="Call" value={supportSettings.phone} colors={colors} /> : null}
          {!supportLoading && !supportSettings.showEmail && !supportSettings.showPhone ? <Text style={[styles.contactText, { color: colors.muted }]}>Contact details are being updated.</Text> : null}
        </View>
      </View>
      <View style={[styles.note, { borderColor: colors.border }]}><CircleHelp size={18} color={colors.muted} /><Text style={[styles.noteText, { color: colors.muted }]}>When reporting a problem, include the page name, device type and what you pressed before the error appeared.</Text></View>
    </ScrollView>
  </View>;
}

function ContactDetail({ icon: Icon, label, value, colors }: { icon: typeof Mail; label: string; value: string; colors: typeof vendorTheme.light }) {
  return <View style={styles.contactDetail}><Icon size={17} color={colors.pink} /><View style={styles.flex}><Text style={[styles.contactLabel, { color: colors.muted }]}>{label}</Text><Text selectable style={[styles.contactValue, { color: colors.text }]}>{value}</Text></View></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 24 }, eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.bodyCompact, marginTop: 4, marginBottom: 20 }, contact: { borderWidth: 1, borderRadius: 22, padding: 15 },
  contactHeader: { flexDirection: "row", alignItems: "center", gap: 11 }, contactIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, contactTitle: { fontSize: typeScale.body, fontWeight: "700" }, contactText: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 },
  contactDetails: { width: "100%", gap: 12, marginTop: 14 }, contactDetail: { flexDirection: "row", alignItems: "center", gap: 9 }, contactLabel: { fontSize: typeScale.caption, fontWeight: "700" }, contactValue: { fontSize: typeScale.bodyCompact, fontWeight: "600", marginTop: 2 },
  note: { borderWidth: 1, borderStyle: "dashed", borderRadius: 18, padding: 14, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 9 }, noteText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label },
});
