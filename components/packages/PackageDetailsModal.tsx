import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { PackageOpen, X } from "lucide-react-native";
import PackageDisplayCard from "@/components/packages/PackageDisplayCard";
import { useVendorPackages } from "@/hooks/useVendorPackages";
import type { VendorPackage } from "@/services/vendorPackages";
import { typeScale, typeLeading } from "@/constants/typography";

type Props = {
  visible: boolean;
  vendorId: string;
  vendorName: string;
  contactPhone: string;
  dark?: boolean;
  onClose: () => void;
  onEnquire: (item: VendorPackage) => void;
  onCall: (item?: VendorPackage) => void;
  onWhatsApp: (item: VendorPackage) => void;
};

export default function PackageDetailsModal({ visible, vendorId, vendorName, contactPhone, dark = false, onClose, onEnquire, onCall, onWhatsApp }: Props) {
  const { width } = useWindowDimensions();
  const [closeFocused, setCloseFocused] = useState(false);
  const { packages, loading, error, refresh } = useVendorPackages(vendorId, true);
  const colors = { surface: dark ? "#0E141F" : "#FFF", background: dark ? "#070B14" : "#FFF8FA", text: dark ? "#FFF8FB" : "#21171C", muted: dark ? "#BEB2B8" : "#6E6268", border: dark ? "#303744" : "#F0E1E7" };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, width >= 760 && styles.centered]}>
      <View style={[styles.sheet, width >= 760 && styles.desktopSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.headerIcon}><PackageOpen size={21} color="#E91E63" /></View>
          <View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>Packages & pricing</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{vendorName} · {packages.length} {packages.length === 1 ? "package" : "packages"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close packages" onPress={onClose} onFocus={() => setCloseFocused(true)} onBlur={() => setCloseFocused(false)} style={({ pressed, hovered }) => [styles.close, { backgroundColor: colors.background, borderColor: hovered || closeFocused ? "#E91E63" : colors.border }, (hovered || closeFocused) && styles.closeHovered, pressed && styles.closePressed]}><X size={20} color={colors.text} /></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {loading ? <View style={styles.state}><ActivityIndicator color="#E91E63" /><Text style={[styles.stateText, { color: colors.muted }]}>Loading packages…</Text></View> : null}
          {!loading && error ? <View style={styles.state}><Text style={[styles.stateTitle, { color: colors.text }]}>Packages unavailable</Text><Text style={[styles.stateText, { color: colors.muted }]}>{error}</Text><Pressable onPress={() => void refresh()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
          {!loading && !error && !packages.length ? <View style={styles.state}><PackageOpen size={34} color={colors.muted} /><Text style={[styles.stateTitle, { color: colors.text }]}>No active packages yet</Text><Text style={[styles.stateText, { color: colors.muted }]}>Contact the vendor directly for a custom quote.</Text>{contactPhone ? <Pressable onPress={() => onCall()} style={styles.retry}><Text style={styles.retryText}>Call vendor</Text></Pressable> : null}</View> : null}
          {!loading && !error ? packages.map((item) => <PackageDisplayCard key={item.id} item={item} dark={dark} onCall={() => onCall(item)} onWhatsApp={() => onWhatsApp(item)} onEnquire={() => onEnquire(item)} />) : null}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,7,10,.56)" }, centered: { justifyContent: "center", alignItems: "center", padding: 24 }, sheet: { width: "100%", maxHeight: "94%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" }, desktopSheet: { maxWidth: 780, maxHeight: "88%", borderRadius: 28 }, header: { flexDirection: "row", alignItems: "center", gap: 11, padding: 17, borderBottomWidth: 1 }, headerIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#FFF0F5", alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, title: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" }, subtitle: { fontSize: typeScale.caption, marginTop: 2 }, close: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", outlineStyle: "none" } as any, closeHovered: { transform: [{ translateY: -1 }] }, closePressed: { opacity: 0.78, transform: [{ scale: 0.96 }] }, content: { padding: 14, paddingBottom: 30 }, state: { minHeight: 260, alignItems: "center", justifyContent: "center", padding: 28 }, stateTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 11 }, stateText: { maxWidth: 360, textAlign: "center", fontSize: typeScale.metadata, lineHeight: typeLeading.tab, marginTop: 6 }, retry: { minHeight: 42, backgroundColor: "#E91E63", borderRadius: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 14 }, retryText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
});
