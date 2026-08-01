import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Building2,
  Check,
  ChevronDown,
  Globe2,
  ImagePlus,
  Mail,
  MapPin,
  Save,
  Search,
  X,
} from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useCategories } from "@/context/CategoryContext";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import {
  CloudinaryError,
  deleteManagedProfileImage,
  pickAndUploadProfileImage,
} from "@/services/cloudinary";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import PremiumRouteGate from "@/components/subscriptions/PremiumRouteGate";
import {
  VendorServiceLocationEditor,
  type VendorLocationValue,
} from "@/components/locations/VendorServiceLocationEditor";
import { useCustomerLocation } from "@/context/LocationContext";
import {
  listVendorServiceLocations,
  replaceVendorServiceLocations,
} from "@/services/locations";
import {
  normalizeOptionalUrl,
  normalizePhone,
  normalizeSocialUrl,
  validateEmail,
  validateFullName,
  validatePhone,
} from "@/utils/authValidation";

type ProfileForm = {
  businessName: string;
  ownerName: string;
  categoryId: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  website: string;
  instagram: string;
  facebook: string;
  tags: string;
  logoUrl: string;
};

const emptyForm: ProfileForm = {
  businessName: "",
  ownerName: "",
  categoryId: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  city: "",
  state: "",
  website: "",
  instagram: "",
  facebook: "",
  tags: "",
  logoUrl: "",
};

export default function VendorEditProfile() {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { registrationCategories: categories } = useCategories();
  const { data, loading, refresh } = useVendorWorkspace();
  const { locations } = useCustomerLocation();
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [persistedLogoUrl, setPersistedLogoUrl] = useState("");
  const [vendorLocation, setVendorLocation] = useState<VendorLocationValue>({
    pincode: "",
    primaryCityId: "",
    primaryAreaId: null,
    serviceAreaIds: [],
  });
  const [locationValid, setLocationValid] = useState(false);
  const twoColumns = width >= 760;
  const selectedCategory = categories.find((item) => item.id === form.categoryId);
  const tagList = useMemo(
    () => form.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    [form.tags],
  );

  useEffect(() => {
    if (!data.vendor) return;
    setForm({
      businessName: data.vendor.business_name ?? "",
      ownerName: data.vendor.owner_name ?? "",
      categoryId: data.vendor.category_id ?? "",
      description: data.vendor.description ?? "",
      contactEmail: data.vendor.contact_email ?? "",
      contactPhone: data.vendor.contact_phone ?? "",
      address: data.vendor.address ?? "",
      city: data.vendor.city ?? "",
      state: data.vendor.state ?? "",
      website: data.vendor.website ?? "",
      instagram: data.vendor.instagram ?? "",
      facebook: data.vendor.facebook ?? "",
      tags: (data.vendor.tags ?? []).join(", "),
      logoUrl: data.vendor.logo_url ?? "",
    });
    setPersistedLogoUrl(data.vendor.logo_url ?? "");
  }, [data.vendor]);

  useEffect(() => {
    if (!data.vendor?.id) return;
    let active = true;
    listVendorServiceLocations(data.vendor.id)
      .then((serviceLocations) => {
        if (!active) return;
        const primary = serviceLocations.find((item) => item.isPrimary);
        setVendorLocation({
          pincode: primary?.pincode ?? (/^[1-9][0-9]{5}$/.test(data.vendor.pincode ?? "") ? data.vendor.pincode : ""),
          primaryCityId: primary?.cityId ?? data.vendor.primary_city_id ?? "",
          primaryAreaId: primary?.areaId ?? data.vendor.primary_area_id ?? null,
          serviceAreaIds: serviceLocations.map((item) => item.areaId).filter((item): item is string => Boolean(item)),
        });
      })
      .catch(() => {
        if (!active) return;
        setVendorLocation({
          pincode: /^[1-9][0-9]{5}$/.test(data.vendor.pincode ?? "") ? data.vendor.pincode : "",
          primaryCityId: data.vendor.primary_city_id ?? "",
          primaryAreaId: data.vendor.primary_area_id ?? null,
          serviceAreaIds: data.vendor.primary_area_id ? [data.vendor.primary_area_id] : [],
        });
      });
    return () => { active = false; };
  }, [data.vendor?.id, data.vendor?.pincode, data.vendor?.primary_area_id, data.vendor?.primary_city_id]);

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadLogo = async () => {
    if (uploadingLogo || !data.vendor?.id) return;
    setUploadingLogo(true);
    try {
      const url = await pickAndUploadProfileImage({
        kind: "vendor",
        vendorId: data.vendor.id,
      });
      if (url) update("logoUrl", url);
    } catch (error) {
      Alert.alert("Logo not uploaded", error instanceof CloudinaryError ? error.message : "Unable to upload the selected image.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Create or connect your Vendor profile before saving.");
    if (!form.businessName.trim()) return Alert.alert("Business name required", "Enter the name customers should see.");
    if (!validateFullName(form.ownerName)) return Alert.alert("Owner name required", "Enter the account owner's full name.");
    if (!form.categoryId) return Alert.alert("Category required", "Choose the category that best represents your business.");
    if (!form.description.trim()) return Alert.alert("Description required", "Tell customers what makes your business a good choice.");
    const selectedCity = locations.find((item) => item.id === vendorLocation.primaryCityId);
    if (!locationValid || !selectedCity) return Alert.alert("Service location required", "Choose a supported primary city and enter a valid six-digit PIN code.");
    if (form.contactEmail.trim() && !validateEmail(form.contactEmail)) {
      return Alert.alert("Invalid email", "Enter a valid customer contact email.");
    }
    if (form.contactPhone.trim() && !validatePhone(form.contactPhone)) {
      return Alert.alert("Invalid phone number", "Enter a valid customer contact number.");
    }
    if (!form.contactEmail.trim() && !form.contactPhone.trim()) {
      return Alert.alert("Contact required", "Add an email address or phone number so customers can reach you.");
    }

    let website: string | null;
    let instagram: string | null;
    let facebook: string | null;
    try {
      website = normalizeOptionalUrl(form.website);
      instagram = normalizeSocialUrl(form.instagram, "instagram");
      facebook = normalizeSocialUrl(form.facebook, "facebook");
    } catch (error) {
      return Alert.alert("Invalid link", error instanceof Error ? error.message : "Check your website and social links.");
    }

    setSaving(true);
    setSaved(false);
    const nextLogoUrl = form.logoUrl.trim() || null;
    try {
      await replaceVendorServiceLocations({
        vendorId: data.vendor.id,
        primaryCityId: vendorLocation.primaryCityId,
        primaryAreaId: vendorLocation.primaryAreaId,
        serviceAreaIds: vendorLocation.serviceAreaIds,
        pincode: vendorLocation.pincode,
      });
      await updateVendorPublicProfile({
        business_name: form.businessName.trim(),
        owner_name: form.ownerName.trim(),
        category_id: form.categoryId,
        description: form.description.trim(),
        contact_email: form.contactEmail.trim().toLowerCase() || null,
        contact_phone: form.contactPhone.trim() ? normalizePhone(form.contactPhone) : null,
        address: form.address.trim() || null,
        city: selectedCity.name,
        state: selectedCity.state,
        website,
        instagram,
        facebook,
        tags: tagList,
        logo_url: nextLogoUrl,
      });
      invalidatePublicVendorCache();
      await refresh();
      if (persistedLogoUrl && persistedLogoUrl !== nextLogoUrl) {
        await deleteManagedProfileImage(
          { kind: "vendor", vendorId: data.vendor.id },
          persistedLogoUrl,
        ).catch(() => {
          Alert.alert("Profile updated", "Your new logo is live, but the previous image could not be cleaned up yet.");
        });
      }
      setPersistedLogoUrl(nextLogoUrl ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      if (nextLogoUrl && nextLogoUrl !== persistedLogoUrl) {
        await deleteManagedProfileImage(
          { kind: "vendor", vendorId: data.vendor.id },
          nextLogoUrl,
        ).catch(() => undefined);
        update("logoUrl", persistedLogoUrl);
      }
      Alert.alert("Profile not saved", error instanceof Error ? error.message : "Unable to update the Vendor profile.");
    } finally {
      setSaving(false);
    }
  };

  const fieldWidth = twoColumns ? "48.8%" : "100%";
  const inputStyle = { backgroundColor: colors.background, borderColor: colors.border, color: colors.text };

  return (
    <PremiumRouteGate feature="edit_vendor_profile"><View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.pink }]}>PUBLIC BUSINESS PROFILE</Text>
          <Text style={[styles.title, { color: colors.text }]}>Edit business profile</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Manage only the information customers see and use. Services, pricing, portfolio and availability are managed in their own sections.
          </Text>
        </View>

        {loading && !data.vendor ? (
          <ActivityIndicator color={colors.pink} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionTitle icon={Building2} title="Public identity" detail="Your name, category, logo and customer-facing introduction." colors={colors} />
              <View style={[styles.identityLayout, twoColumns && styles.identityLayoutWide]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Upload business logo"
                  disabled={uploadingLogo}
                  onPress={uploadLogo}
                  style={[styles.logoPicker, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
                >
                  {form.logoUrl ? <Image source={{ uri: form.logoUrl }} style={styles.logoImage} /> : null}
                  <View style={[styles.logoOverlay, form.logoUrl && styles.logoOverlayFloating]}>
                    {uploadingLogo ? <ActivityIndicator color={colors.pink} /> : <ImagePlus size={21} color={form.logoUrl ? "#FFF" : colors.pink} />}
                    {!form.logoUrl ? <Text style={[styles.logoText, { color: colors.text }]}>Add logo</Text> : null}
                  </View>
                </Pressable>
                <View style={styles.identityFields}>
                  <Field
                    label="Business name"
                    required
                    value={form.businessName}
                    onChangeText={(value) => update("businessName", value)}
                    placeholder="The name customers will see"
                    colors={colors}
                  />
                  <Field
                    label="Owner name"
                    required
                    value={form.ownerName}
                    onChangeText={(value) => update("ownerName", value)}
                    placeholder="Account owner's full name"
                    colors={colors}
                  />
                  <Text style={[styles.label, { color: colors.text }]}>Business category <Text style={{ color: colors.pink }}>*</Text></Text>
                  <Pressable
                    onPress={() => setCategoryOpen(true)}
                    style={[styles.input, styles.select, inputStyle]}
                  >
                    <Text style={{ color: selectedCategory ? colors.text : colors.muted, fontSize: 13 }}>
                      {selectedCategory?.name ?? "Choose a category"}
                    </Text>
                    <ChevronDown size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </View>
              <Field
                label="About the business"
                required
                value={form.description}
                onChangeText={(value) => update("description", value)}
                placeholder="Describe your experience, style and what customers can expect."
                colors={colors}
                multiline
                maxLength={1200}
                helper={`${form.description.length}/1200 · Aim for at least 80 useful characters.`}
              />
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionTitle icon={Mail} title="Customer contact" detail="Add at least one reliable way for customers to reach your business." colors={colors} />
              <View style={styles.grid}>
                <View style={{ width: fieldWidth }}>
                  <Field label="Contact phone" value={form.contactPhone} onChangeText={(value) => update("contactPhone", value)} placeholder="+91 98765 43210" colors={colors} keyboardType="phone-pad" />
                </View>
                <View style={{ width: fieldWidth }}>
                  <Field label="Contact email" value={form.contactEmail} onChangeText={(value) => update("contactEmail", value)} placeholder="hello@business.com" colors={colors} keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionTitle icon={MapPin} title="Service location" detail="Choose only active RoyalLagn cities and the localities your business serves." colors={colors} />
              <View style={styles.grid}>
                <View style={{ width: "100%" }}>
                  <VendorServiceLocationEditor
                    value={vendorLocation}
                    onChange={(next) => { setSaved(false); setVendorLocation(next); }}
                    requireLookup={false}
                    onValidationChange={setLocationValid}
                  />
                </View>
                <View style={{ width: "100%" }}>
                  <Field label="Business address" value={form.address} onChangeText={(value) => update("address", value)} placeholder="Street, area or landmark (optional)" colors={colors} />
                </View>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionTitle icon={Globe2} title="Online presence" detail="Optional links displayed together on your public profile." colors={colors} />
              <View style={styles.grid}>
                <View style={{ width: fieldWidth }}>
                  <Field label="Website" value={form.website} onChangeText={(value) => update("website", value)} placeholder="yourbusiness.com" colors={colors} keyboardType="url" autoCapitalize="none" />
                </View>
                <View style={{ width: fieldWidth }}>
                  <Field label="Instagram" value={form.instagram} onChangeText={(value) => update("instagram", value)} placeholder="instagram.com/yourbusiness" colors={colors} keyboardType="url" autoCapitalize="none" />
                </View>
                <View style={{ width: fieldWidth }}>
                  <Field label="Facebook" value={form.facebook} onChangeText={(value) => update("facebook", value)} placeholder="facebook.com/yourbusiness" colors={colors} keyboardType="url" autoCapitalize="none" />
                </View>
              </View>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <SectionTitle icon={Search} title="Search discovery" detail="Use a small set of relevant phrases customers may search for." colors={colors} />
              <Field
                label="Search tags"
                value={form.tags}
                onChangeText={(value) => update("tags", value)}
                placeholder="candid wedding, luxury decor, pune"
                colors={colors}
                helper="Separate tags with commas. Up to 12 tags will be saved."
              />
              {tagList.length ? (
                <View style={styles.tags}>
                  {tagList.map((tag) => <Text key={tag} style={[styles.tag, { color: colors.pink, backgroundColor: colors.surfaceSoft }]}>{tag}</Text>)}
                </View>
              ) : null}
            </View>

            <View style={[styles.saveBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.saveMessage}>
                {saved ? <><Check size={16} color={colors.success} /><Text style={[styles.savedText, { color: colors.success }]}>Profile updated</Text></> : <Text style={[styles.saveHint, { color: colors.muted }]}>Changes update your public vendor profile.</Text>}
              </View>
              <Pressable
                disabled={saving || uploadingLogo}
                onPress={save}
                style={({ pressed }) => [
                  styles.save,
                  { backgroundColor: colors.pink },
                  pressed && styles.pressed,
                  (saving || uploadingLogo) && { opacity: 0.6 },
                ]}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <><Save size={17} color="#FFF" /><Text style={styles.saveText}>Save profile</Text></>}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCategoryOpen(false)}>
          <Pressable style={[styles.categorySheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <View><Text style={[styles.sheetTitle, { color: colors.text }]}>Business category</Text><Text style={[styles.sheetSubtitle, { color: colors.muted }]}>Choose the single best match for your business.</Text></View>
              <Pressable accessibilityLabel="Close categories" onPress={() => setCategoryOpen(false)} style={[styles.close, { backgroundColor: colors.surfaceSoft }]}><X size={19} color={colors.text} /></Pressable>
            </View>
            <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
              {categories.map((category) => {
                const selected = category.id === form.categoryId;
                return (
                  <Pressable
                    key={category.id}
                    onPress={() => { update("categoryId", category.id); setCategoryOpen(false); }}
                    style={[styles.categoryOption, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.surfaceSoft }]}
                  >
                    <Text style={[styles.categoryName, { color: selected ? colors.pink : colors.text }]}>{category.name}</Text>
                    {selected ? <Check size={17} color={colors.pink} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View></PremiumRouteGate>
  );
}

function SectionTitle({ icon: Icon, title, detail, colors }: { icon: React.ComponentType<any>; title: string; detail: string; colors: any }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.surfaceSoft }]}><Icon size={19} color={colors.pink} /></View>
      <View style={styles.flex}><Text style={[styles.sectionHeading, { color: colors.text }]}>{title}</Text><Text style={[styles.sectionDetail, { color: colors.muted }]}>{detail}</Text></View>
    </View>
  );
}

function Field({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  colors,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  maxLength,
  helper,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: any;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  maxLength?: number;
  helper?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}{required ? <Text style={{ color: colors.pink }}> *</Text> : null}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.textarea,
          { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
        ]}
      />
      {helper ? <Text style={[styles.helper, { color: colors.muted }]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 980, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 38 },
  heading: { marginBottom: 19 },
  eyebrow: { fontSize: 9, letterSpacing: 1.6, fontWeight: "900", marginBottom: 6 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { fontSize: 11, lineHeight: 18, marginTop: 5, maxWidth: 680 },
  section: { borderWidth: 1, borderRadius: 23, padding: 17, marginBottom: 12 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 17 },
  sectionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionHeading: { fontSize: 14, fontWeight: "900" },
  sectionDetail: { fontSize: 9, lineHeight: 14, marginTop: 3 },
  flex: { flex: 1, minWidth: 0 },
  identityLayout: { gap: 14 },
  identityLayoutWide: { flexDirection: "row", alignItems: "flex-start" },
  logoPicker: { width: 126, height: 126, borderRadius: 22, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden", alignSelf: "center" },
  logoImage: { width: "100%", height: "100%" },
  logoOverlay: { alignItems: "center", gap: 6 },
  logoOverlayFloating: { position: "absolute", right: 7, bottom: 7, width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(20,12,16,.72)", justifyContent: "center" },
  logoText: { fontSize: 10, fontWeight: "800" },
  identityFields: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { marginBottom: 13 },
  label: { fontSize: 10, fontWeight: "800", marginBottom: 7 },
  input: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 13 },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  textarea: { minHeight: 126, paddingTop: 13 },
  helper: { fontSize: 8, lineHeight: 12, marginTop: 5 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -3 },
  tag: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, fontSize: 8, fontWeight: "800" },
  saveBar: { borderWidth: 1, borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 3 },
  saveMessage: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  saveHint: { fontSize: 9 },
  savedText: { fontSize: 10, fontWeight: "800" },
  save: { minWidth: 150, minHeight: 47, paddingHorizontal: 18, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  backdrop: { flex: 1, backgroundColor: "rgba(18,10,14,.5)", justifyContent: "flex-end" },
  categorySheet: { width: "100%", maxWidth: 560, maxHeight: "78%", alignSelf: "center", borderWidth: 1, borderRadius: 27, padding: 18, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "900" },
  sheetSubtitle: { fontSize: 9, marginTop: 3 },
  close: { width: 37, height: 37, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryList: { maxHeight: 430 },
  categoryOption: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryName: { fontSize: 12, fontWeight: "700" },
});
