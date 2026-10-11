import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { Check, X } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { VENDOR_TAB_BASE_HEIGHT } from "@/components/vendor/VendorBottomNav";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useCategories } from "@/context/CategoryContext";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { DropdownArrow, Field, kitStyles, SaveBar, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";
import VendorProfileReadinessCard from "@/components/vendor/VendorProfileReadinessCard";
import VendorSectionHeading from "@/components/vendor/VendorSectionHeading";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import { typeScale } from "@/constants/typography";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

// Business information: business_name, owner_name, category_id. Everything
// else on the vendor record (description, contact, location, brand, tags,
// services/pricing/portfolio/availability) belongs to its own dedicated
// section form -- this screen fetches, validates and saves only these
// three fields via a partial update_vendor_public_profile() call, so
// saving here can never touch unrelated profile data.
export default function VendorEditBusinessInfo() {
  const { width } = useWindowDimensions();
  const roomy = width >= 760;
  const showBottomNav = width < 900;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { registrationCategories: categories } = useCategories();
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);
  const hydrated = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setBusinessName(data.vendor.business_name ?? "");
    setOwnerName(data.vendor.owner_name ?? "");
    setCategoryId(data.vendor.category_id ?? "");
    hydrated.current = true;
  }, [data.vendor]);

  const selectedCategory = categories.find((item) => item.id === categoryId);
  const hasUnsavedChanges = Boolean(data.vendor) && (
    businessName !== (data.vendor?.business_name ?? "")
    || ownerName !== (data.vendor?.owner_name ?? "")
    || categoryId !== (data.vendor?.category_id ?? "")
  );
  useUnsavedChangesGuard(hasUnsavedChanges);
  const clearFeedback = () => { setSaved(false); setSaveError(""); };

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    if (!businessName.trim()) {
      setSaveError("Business name is required.");
      return Alert.alert("Business name required", "Enter the name customers will see.");
    }
    if (!ownerName.trim()) {
      setSaveError("Owner name is required.");
      return Alert.alert("Owner name required", "Enter the account owner's full name.");
    }
    if (!categoryId) {
      setSaveError("Choose a business category.");
      return Alert.alert("Category required", "Choose the category that best matches your business.");
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateVendorPublicProfile({
        business_name: businessName.trim(),
        owner_name: ownerName.trim(),
        category_id: categoryId,
      });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update business information.";
      setSaveError(message);
      Alert.alert("Not saved", message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const inputStyle = { backgroundColor: colors.background, borderColor: colors.border, color: colors.text };

  return (
    <View style={[kitStyles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <KeyboardAwareScrollView
        avoidKeyboardOnAndroid
        contentContainerStyle={[
          styles.page,
          roomy && styles.pageRoomy,
          showBottomNav && { paddingBottom: 28 + VENDOR_TAB_BASE_HEIGHT + 20 },
        ]}
      >
        <VendorSectionHeading
          title="Business Details"
          subtitle="Your core business identity: name, owner and category. This does not affect any other section of your profile."
          backTo="/vendor-dashboard"
        />

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <VendorProfileReadinessCard
            style={styles.readiness}
            activeSectionId="business"
            onOpenCurrent={() => setEditorOpen((open) => !open)}
            activePanel={editorOpen ? (
              <View style={styles.identity}>
                <View style={roomy ? styles.identityPair : undefined}>
                  <View style={roomy ? styles.identityField : undefined}>
                    <Field
                      label="Business name"
                      required
                      value={businessName}
                      onChangeText={(value) => { clearFeedback(); setBusinessName(value); }}
                      placeholder="The name customers will see"
                      colors={colors}
                    />
                  </View>
                  <View style={roomy ? styles.identityField : undefined}>
                    <Field
                      label="Owner name"
                      required
                      value={ownerName}
                      onChangeText={(value) => { clearFeedback(); setOwnerName(value); }}
                      placeholder="Account owner's full name"
                      colors={colors}
                    />
                  </View>
                </View>
                <Text style={[kitStyles.label, { color: colors.text }]}>Business category<Text style={{ color: colors.pink }}> *</Text></Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose business category"
                  onPress={() => setCategoryOpen(true)}
                  style={({ pressed }) => [
                    kitStyles.input,
                    kitStyles.select,
                    inputStyle,
                    pressed && styles.categoryPressed,
                  ]}
                >
                  <Text style={{ color: selectedCategory ? colors.text : colors.muted, fontSize: typeScale.body }}>
                    {selectedCategory?.name ?? "Choose a category"}
                  </Text>
                  <DropdownArrow open={categoryOpen} color={colors.muted} />
                </Pressable>
                <SaveBar
                  embedded
                  colors={colors}
                  saving={saving}
                  saved={saved}
                  saveError={saveError}
                  savedLabel="Business information updated"
                  onPress={() => void save()}
                />
              </View>
            ) : null}
          />
        </VendorWorkspaceGate>
      </KeyboardAwareScrollView>

      <AnimatedBottomSheet visible={categoryOpen} onRequestClose={() => setCategoryOpen(false)} sheetStyle={[styles.categorySheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Business category</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.muted }]}>Choose the single best match for your business.</Text>
          </View>
          <Pressable accessibilityLabel="Close categories" onPress={() => setCategoryOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}>
            <X size={19} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
          {categories.map((category) => {
            const selected = category.id === categoryId;
            return (
              <Pressable
                key={category.id}
                onPress={() => { clearFeedback(); setCategoryId(category.id); setCategoryOpen(false); }}
                style={[styles.categoryOption, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.surfaceSoft }]}
              >
                <Text style={[styles.categoryName, { color: selected ? colors.pink : colors.text }]}>{category.name}</Text>
                {selected ? <Check size={17} color={colors.pink} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </AnimatedBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 1080,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 48,
    gap: 20,
  },
  pageRoomy: {
    paddingHorizontal: 28,
    paddingTop: 20,
    gap: 28,
  },
  readiness: {
    marginBottom: 0,
  },
  identity: {
    gap: 0,
  },
  identityPair: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  identityField: {
    flex: 1,
    minWidth: 0,
  },
  categoryPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  categorySheet: { width: "100%", maxWidth: 560, maxHeight: "78%", alignSelf: "center", borderWidth: 1, borderRadius: 27, padding: 18, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  sheetTitle: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  sheetSubtitle: { fontSize: typeScale.caption, marginTop: 3 },
  close: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryList: { maxHeight: 430 },
  categoryOption: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryName: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
});
