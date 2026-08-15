import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { ImagePlus, Palette } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace, VendorReadinessRules } from "@/hooks/useVendorWorkspace";
import {
  CloudinaryError,
  deleteManagedProfileImage,
  pickProfileImage,
  uploadProfileImage,
  type ProfileImageAsset,
} from "@/services/cloudinary";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { kitStyles, ReadinessBadge, SaveBar, SectionTitle, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";
import { typeScale } from "@/constants/typography";
import SquareImageEditor from "@/components/vendor/SquareImageEditor";
import { brandPalette } from "@/constants/brandPalette";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

// Logo and brand: the vendor's logo image, the only brand-media field on
// the vendor record itself (portfolio photos/videos and Clips each have
// their own dedicated management screens). Uploads are staged to
// Cloudinary immediately, but the vendor row is only updated -- and the
// previous image only cleaned up -- once "Save" succeeds, so a cancelled
// edit never leaves a half-applied change.
export default function VendorEditBrand() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [logoUrl, setLogoUrl] = useState("");
  const [persistedLogoUrl, setPersistedLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoEditorAsset, setLogoEditorAsset] = useState<ProfileImageAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setLogoUrl(data.vendor.logo_url ?? "");
    setPersistedLogoUrl(data.vendor.logo_url ?? "");
  }, [data.vendor]);

  useUnsavedChangesGuard(Boolean(data.vendor) && (
    logoUrl !== persistedLogoUrl || Boolean(logoEditorAsset)
  ));

  const uploadLogo = async () => {
    if (uploadingLogo || !data.vendor?.id) return;
    setUploadingLogo(true);
    try {
      const asset = await pickProfileImage();
      if (asset) setLogoEditorAsset(asset);
    } catch (uploadError) {
      Alert.alert("Logo not selected", uploadError instanceof CloudinaryError ? uploadError.message : "Unable to open the selected image.");
    } finally {
      if (mounted.current) setUploadingLogo(false);
    }
  };

  const saveEditedLogo = async (asset: ProfileImageAsset) => {
    if (!data.vendor?.id) return;
    setUploadingLogo(true);
    try {
      const url = await uploadProfileImage({ kind: "vendor", vendorId: data.vendor.id }, asset);
      if (!mounted.current) return;
      setSaved(false);
      setSaveError("");
      setLogoUrl(url);
      setLogoEditorAsset(null);
    } catch (uploadError) {
      Alert.alert("Logo not uploaded", uploadError instanceof CloudinaryError ? uploadError.message : "Unable to upload the edited logo.");
    } finally {
      if (mounted.current) setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    setSaving(true);
    setSaveError("");
    const nextLogoUrl = logoUrl.trim() || null;
    try {
      await updateVendorPublicProfile({ logo_url: nextLogoUrl });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (persistedLogoUrl && persistedLogoUrl !== nextLogoUrl) {
        await deleteManagedProfileImage({ kind: "vendor", vendorId: data.vendor.id }, persistedLogoUrl).catch(() => {
          Alert.alert("Logo updated", "Your new logo is live, but the previous image could not be cleaned up yet.");
        });
      }
      if (!mounted.current) return;
      setPersistedLogoUrl(nextLogoUrl ?? "");
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      // A staged-but-unsaved upload is dropped from the vendor record on
      // failure so the form reflects only what is actually persisted; the
      // orphaned Cloudinary asset is cleaned up rather than left dangling.
      if (nextLogoUrl && nextLogoUrl !== persistedLogoUrl) {
        await deleteManagedProfileImage({ kind: "vendor", vendorId: data.vendor.id }, nextLogoUrl).catch(() => undefined);
        setLogoUrl(persistedLogoUrl);
      }
      const message = caught instanceof Error ? caught.message : "Unable to update your logo.";
      setSaveError(message);
      Alert.alert("Not saved", message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <View style={[kitStyles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={kitStyles.content}>
        <View style={kitStyles.heading}>
          <View style={kitStyles.headingRow}>
            <Text style={[kitStyles.eyebrow, { color: colors.pink }]}>SECTION · LOGO AND BRAND</Text>
            {data.vendor ? <ReadinessBadge colors={colors} state={VendorReadinessRules.brand(data.vendor)} /> : null}
          </View>
          <Text style={[kitStyles.title, { color: colors.text }]}>Logo and brand</Text>
          <Text style={[kitStyles.subtitle, { color: colors.muted }]}>
            Your business logo. Portfolio photos, videos and Clips have their own dedicated sections.
          </Text>
        </View>

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <View style={[kitStyles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionTitle icon={Palette} title="Business logo" detail="Square 1024 × 1024 logo shown on your public profile, search results and shared links." colors={colors} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upload business logo"
              disabled={uploadingLogo}
              onPress={uploadLogo}
              style={[styles.logoPicker, { backgroundColor: brandPalette.light.background, borderColor: colors.border }]}
            >
              {logoUrl ? <Image source={{ uri: logoUrl }} resizeMode="contain" style={styles.logoImage} /> : null}
              <View style={[styles.logoOverlay, Boolean(logoUrl) && styles.logoOverlayFloating]}>
                {uploadingLogo ? <ActivityIndicator color={colors.pink} /> : <ImagePlus size={21} color={logoUrl ? "#FFF" : colors.pink} />}
                {!logoUrl ? <Text style={[styles.logoText, { color: colors.text }]}>Add logo</Text> : null}
              </View>
            </Pressable>
          </View>

          <SaveBar
            colors={colors}
            saving={saving}
            disabled={uploadingLogo}
            saved={saved}
            saveError={saveError}
            savedLabel="Logo updated"
            onPress={() => void save()}
          />
        </VendorWorkspaceGate>
      </ScrollView>
      <SquareImageEditor
        asset={logoEditorAsset}
        busy={uploadingLogo}
        kind="logo"
        onCancel={() => setLogoEditorAsset(null)}
        onSave={saveEditedLogo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoPicker: { width: 140, height: 140, borderRadius: 24, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden", alignSelf: "center" },
  logoImage: { width: "100%", height: "100%" },
  logoOverlay: { alignItems: "center", gap: 6 },
  logoOverlayFloating: { position: "absolute", right: 8, bottom: 8, width: 40, height: 40, borderRadius: 13, backgroundColor: brandPalette.light.overlayInk, justifyContent: "center" },
  logoText: { fontSize: typeScale.caption, fontWeight: "700" },
});
