import React, { useState } from "react";
import { Alert, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BriefcaseBusiness,
  ChevronRight,
  CircleHelp,
  FileText,
  Images,
  LogOut,
  MapPin,
  Palette,
  Pencil,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useVendorLogout } from "@/hooks/useVendorLogout";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { supabase } from "@/services/supabase";
import { deleteManagedProfileImage } from "@/services/cloudinary";
import { decorativeType, fonts, typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";
import { useAppFeedback } from "@/context/AppFeedbackContext";

export default function VendorProfile() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const { data, completion, refresh } = useVendorWorkspace();
  const [photoOpen, setPhotoOpen] = useState(false);
  const performVendorLogout = useVendorLogout();
  const vendor = data.vendor;
  const groups = [
    [
      { label: "Edit business profile", detail: "Identity, description, contact and location", icon: Pencil, route: "/vendor-dashboard?focus=checklist" },
      { label: "Packages & pricing", detail: `${data.services.length} ${data.services.length === 1 ? "package" : "packages"} configured`, icon: BriefcaseBusiness, route: "/VendorServices" },
      { label: "Portfolio", detail: `${data.albums.length} albums · ${data.media.length} media`, icon: Images, route: "/VendorGallery" },
    ],
    [
      { label: "Vendor settings", detail: "Preferences and account controls", icon: Settings, route: "/VendorSettings" },
      { label: "Help and support", detail: "Guides and contact options", icon: CircleHelp, route: "/VendorHelp" },
      { label: "Privacy policy", detail: "How RoyalLagn handles your information", icon: ShieldCheck, route: "/VendorPrivacyPolicy" },
      { label: "Terms and conditions", detail: "Rules for using the vendor workspace", icon: FileText, route: "/VendorTerms" },
    ],
  ];
  const executeLogout = async () => {
    try {
      await performVendorLogout();
    } catch {
      Alert.alert("Logout failed", "Unable to leave the Vendor workspace. Please try again.");
    }
  };
  const logout = () => {
    Alert.alert("Log out of Vendor workspace?", "You can sign in again from the role-selection screen.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void executeLogout() },
    ]);
  };
  const removePhoto = () => {
    if (!vendor?.id) return;
    Alert.alert("Remove business logo?", "The logo will also be removed from your public vendor profile.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const previousLogoUrl = vendor.logo_url;
          const { error } = await supabase.from("vendors").update({ logo_url: null }).eq("id", vendor.id);
          if (error) return Alert.alert("Logo not removed", error.message);
          invalidatePublicVendorCache();
          await refresh();
          await deleteManagedProfileImage(
            { kind: "vendor", vendorId: vendor.id },
            previousLogoUrl,
          ).catch((cleanupError) => {
            if (__DEV__) console.warn("Previous vendor logo cleanup failed", cleanupError);
          });
          setPhotoOpen(false);
          showSuccess("Business logo removed");
        },
      },
    ]);
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
    >
      <VendorDashboardReveal>
      <View style={styles.hero}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile photo options"
          onPress={() => setPhotoOpen(true)}
          style={({ pressed, hovered, focused }) => [
            styles.photoRing,
            { borderColor: colors.border, backgroundColor: colors.surface },
            (hovered || focused) && styles.hoverLift,
            pressed && styles.pressed,
          ]}
        >
          {vendor?.logo_url ? <Image source={{ uri: vendor.logo_url }} resizeMode="contain" style={styles.photo} /> : <Text style={[styles.initial, { color: colors.pink }]}>{vendor?.business_name?.[0]?.toUpperCase() || "R"}</Text>}
          <View style={[styles.editBadge, { backgroundColor: colors.pink, borderColor: colors.background }]}><Pencil size={13} color="#FFF" /></View>
        </Pressable>
        <Text style={[styles.name, { color: colors.text }]}>{vendor?.business_name || "Your vendor business"}</Text>
        <Text style={[styles.category, { color: colors.muted }]}>{vendor?.categories?.name || "Complete your vendor category"}</Text>
        {(vendor?.city || vendor?.state) && <View style={styles.location}><MapPin size={13} color={colors.muted} /><Text style={[styles.locationText, { color: colors.muted }]}>{[vendor.city, vendor.state].filter(Boolean).join(", ")}</Text></View>}
        <View style={[styles.completion, { backgroundColor: colors.surfaceSoft }]}>
          <Text style={[styles.completionText, { color: colors.pink }]}>{completion.percent}% profile complete</Text>
          <View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { width: `${completion.percent}%`, backgroundColor: colors.pink }]} /></View>
        </View>
      </View>
      {groups.map((group, groupIndex) => <View key={groupIndex} style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {group.map(({ label, detail, icon: Icon, route }, index) => <Pressable key={label} onPress={() => router.push(route as any)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed, hovered, focused }) => [
            styles.row,
            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            (hovered || focused) && { backgroundColor: colors.surfaceSoft },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSoft }]}><Icon size={19} color={colors.pink} /></View>
          <View style={styles.flex}><Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text><Text style={[styles.rowDetail, { color: colors.muted }]}>{detail}</Text></View>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>)}
      </View>)}
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: colors.surfaceSoft }]}>
            <Palette size={19} color={colors.pink} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Appearance</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>Switch between light and dark mode</Text>
          </View>
          <ThemeToggle size={20} />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={logout}
        style={({ pressed, hovered, focused }) => [
          styles.logout,
          Platform.OS === "web" && { backgroundColor: colors.surface, borderColor: colors.border },
          (hovered || focused) && { backgroundColor: colors.surfaceSoft },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.logoutSurface, Platform.OS !== "web" && { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.rowIcon, { backgroundColor: `${colors.warning}14` }]}>
            <LogOut size={19} color={colors.warning} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.rowLabel, { color: colors.warning }]}>Log out</Text>
            <Text style={[styles.rowDetail, { color: colors.muted }]}>Leave the Vendor workspace on this device</Text>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </View>
      </Pressable>
      </VendorDashboardReveal>
    </ScrollView>
    <Modal visible={photoOpen} transparent animationType="fade" onRequestClose={() => setPhotoOpen(false)}>
      <Pressable style={styles.overlay} onPress={() => setPhotoOpen(false)}>
        <View style={[styles.photoSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sheetTop}><Text style={[styles.sheetTitle, { color: colors.text }]}>Profile photo</Text><Pressable onPress={() => setPhotoOpen(false)}><X size={21} color={colors.text} /></Pressable></View>
          <View style={[styles.largePhoto, { backgroundColor: colors.surfaceSoft }]}>
            {vendor?.logo_url ? <Image source={{ uri: vendor.logo_url }} resizeMode="contain" style={StyleSheet.absoluteFillObject} /> : <Text style={[styles.largeInitial, { color: colors.pink }]}>{vendor?.business_name?.[0]?.toUpperCase() || "R"}</Text>}
          </View>
          <View style={styles.photoActions}>
            <Pressable onPress={() => { setPhotoOpen(false); router.push("/VendorEditBrand"); }} style={[styles.photoAction, { backgroundColor: colors.surfaceSoft }]}><Pencil size={19} color={colors.pink} /><Text style={[styles.photoActionText, { color: colors.text }]}>Edit photo</Text></Pressable>
            <Pressable onPress={removePhoto} style={[styles.photoAction, { backgroundColor: colors.surfaceSoft }]}><Trash2 size={19} color={colors.warning} /><Text style={[styles.photoActionText, { color: colors.text }]}>Delete photo</Text></Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingTop: 20, paddingBottom: 28, width: "100%", maxWidth: 760, alignSelf: "center" },
  hero: { alignItems: "center", paddingBottom: 22 }, photoRing: { width: 112, height: 112, borderRadius: 56, borderWidth: 3, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  photo: { width: 104, height: 104, borderRadius: 52 }, initial: { fontFamily: fonts.sans.bold, fontSize: decorativeType.avatarInitial }, editBadge: { position: "absolute", right: 0, bottom: 4, width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  name: { fontSize: typeScale.metric, lineHeight: typeLeading.metric, fontWeight: "700", textAlign: "center", letterSpacing: -0.45 }, category: { fontSize: typeScale.bodyCompact, marginTop: 4 }, location: { flexDirection: "row", gap: 4, alignItems: "center", marginTop: 8 }, locationText: { fontSize: typeScale.metadata },
  completion: { borderRadius: 15, width: "100%", maxWidth: 420, padding: 12, marginTop: 16 }, completionText: { fontSize: typeScale.metadata, fontWeight: "700", textAlign: "center" }, track: { height: 5, borderRadius: 4, marginTop: 8, overflow: "hidden" }, fill: { height: "100%", borderRadius: 4 },
  group: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 14 }, row: { minHeight: 76, flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  logout: { minHeight: 76, borderRadius: 16, borderWidth: Platform.OS === "web" ? 1 : 0, overflow: "hidden" },
  logoutSurface: { minHeight: 74, width: "100%", borderRadius: 16, borderWidth: Platform.OS === "web" ? 0 : 1, flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rowIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, rowLabel: { fontSize: typeScale.body, fontWeight: "700" }, rowDetail: { fontSize: typeScale.caption, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: "rgba(20,10,15,.48)", justifyContent: "flex-end" }, photoSheet: { borderWidth: 1, borderRadius: 28, padding: 20, paddingBottom: 34, width: "100%", maxWidth: 520, alignSelf: "center" },
  sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sheetTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  largePhoto: { width: 190, height: 190, borderRadius: 95, overflow: "hidden", alignSelf: "center", marginVertical: 24, alignItems: "center", justifyContent: "center" }, largeInitial: { fontFamily: fonts.sans.bold, fontSize: decorativeType.avatarInitialLarge },
  photoActions: { flexDirection: "row", gap: 10 }, photoAction: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 4 }, photoActionText: { fontSize: typeScale.caption, fontWeight: "700" },
  hoverLift: { transform: [{ translateY: -1 }] }, pressed: { transform: [{ scale: .985 }], opacity: .9 },
});
