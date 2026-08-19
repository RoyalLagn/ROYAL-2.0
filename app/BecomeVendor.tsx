import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text,
  TextInput, TouchableOpacity, useWindowDimensions, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft, Check, ChevronDown, CircleAlert, FileText, ImagePlus, Trash2, X,
} from "lucide-react-native";
import {
  CloudinaryError, pickAndUploadBusinessDocument, pickAndUploadImage,
  pickProfileImage, uploadImage as uploadCloudinaryImage, type ProfileImageAsset,
  type UploadedBusinessDocument,
} from "@/services/cloudinary";
import { useCategories } from "@/context/CategoryContext";
import { sanitizePhoneInput } from "@/utils/authValidation";
import {
  VendorServiceLocationEditor,
  type VendorLocationValue,
} from "@/components/locations/VendorServiceLocationEditor";
import { submitVendorApplication } from "@/services/vendorApplications";
import { logSupabaseError, resolveVendorDestination } from "@/services/vendorAuth";
import { supabase } from "@/services/supabase";
import SquareImageEditor from "@/components/vendor/SquareImageEditor";

type RejectedApplicationRecord = {
  id: string;
  business_name: string;
  full_name: string;
  email: string;
  phone: string;
  category_id: string;
  description: string;
  experience: number;
  pincode: string;
  city_id: string | null;
  area_id: string | null;
  service_area_ids: string[] | null;
  geo_pincode_locality_id: string | null;
  instagram: string | null;
  facebook: string | null;
  website: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  business_documents: UploadedBusinessDocument[] | null;
};

/** Where the header back button / Android hardware back go from this
 * screen. Matches how the vendor arrived here -- never a blind
 * router.back(), since Become Vendor is always reached via replace(). */
function backRouteFor(source: string | undefined) {
  if (source === "rejected") {
    return { pathname: "/VendorAuthStatus", params: { status: "rejected" } } as const;
  }
  return { pathname: "/VendorAuth" } as const;
}

type FormState = {
  businessName: string; ownerName: string; email: string; mobile: string;
  categoryId: string; experience: string;
  description: string; instagram: string; facebook: string; website: string;
  logoUrl: string; coverImageUrl: string;
};

const emptyForm: FormState = {
  businessName: "", ownerName: "", email: "", mobile: "", categoryId: "",
  experience: "", description: "", instagram: "",
  facebook: "", website: "", logoUrl: "", coverImageUrl: "",
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\d{10}$/;

function Field({
  label, value, onChangeText, required, multiline, keyboardType = "default",
  autoCapitalize = "sentences",
  placeholder,
  maxLength,
}: {
  label: string; value: string; onChangeText: (value: string) => void;
  required?: boolean; multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words";
  placeholder?: string; maxLength?: number;
}) {
  return (
    <View className="mb-5">
      <Text className="text-foreground text-sm font-semibold mb-2.5">
        {label}{required ? <Text className="text-primary"> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        placeholderTextColor="#8A8589"
        className={`border border-border bg-background text-foreground rounded-xl px-4 ${multiline ? "min-h-[124px] py-4" : "h-14"}`}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

function FormSection({
  title,
  description,
  optional = false,
  children,
}: {
  title: string;
  description: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-card border border-border rounded-[20px] p-5 mb-5">
      <View className="mb-6">
        <View className="flex-row items-center justify-between mb-1.5">
          <Text className="text-foreground text-lg font-bold">{title}</Text>
          {optional ? <Text className="text-primary text-xs font-semibold">Optional</Text> : null}
        </View>
        <Text className="text-muted-foreground text-sm leading-5">{description}</Text>
      </View>
      {children}
    </View>
  );
}

function FormGrid({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  return (
    <View style={wide ? { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 } : undefined}>
      {React.Children.map(children, (child, index) => (
        <View key={index} style={wide ? { width: "50%", paddingHorizontal: 8 } : undefined}>
          {child}
        </View>
      ))}
    </View>
  );
}

export default function BecomeVendor() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 760;
  const params = useLocalSearchParams<{ source?: string }>();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const { registrationCategories: categories } = useCategories();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [vendorLocation, setVendorLocation] = useState<VendorLocationValue>({
    pincode: "",
    primaryCityId: "",
    primaryAreaId: null,
    serviceAreaIds: [],
    geoLocalityId: null,
  });
  const [locationValid, setLocationValid] = useState(false);
  const [locationSource, setLocationSource] = useState<"verified" | "manual_fallback" | null>(null);
  const [documents, setDocuments] = useState<UploadedBusinessDocument[]>([]);
  const [checkingAccess, setCheckingAccess] = useState(true);
  // Resubmission (a rejected application, prefilled for editing) skips the
  // pincode re-verification step -- that location was already accepted once.
  const [isResubmission, setIsResubmission] = useState(false);
  const [backTarget, setBackTarget] = useState(() => backRouteFor(source));

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(backTarget as never);
  }, [backTarget, router]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | "document" | null>(null);
  const [logoEditorAsset, setLogoEditorAsset] = useState<ProfileImageAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (error || !data.user) {
          if (router.canDismiss()) router.dismissAll();
          router.replace({ pathname: "/VendorAuth" });
          return;
        }
        const resolution = await resolveVendorDestination(data.user);
        if (!active) return;

        if (resolution.state === "not_vendor") {
          if (router.canDismiss()) router.dismissAll();
          router.replace({ pathname: "/VendorAuth" });
          return;
        }

        // A rejected vendor may resubmit from here — load their existing
        // application into the form so resubmitting edits it in place
        // instead of risking a second, duplicate application row.
        if (resolution.state === "rejected" && resolution.application) {
          const { data: existing, error: existingError } = await supabase
            .from("vendor_applications")
            .select(
              "id,business_name,full_name,email,phone,category_id,description,experience,pincode,city_id,area_id,service_area_ids,geo_pincode_locality_id,instagram,facebook,website,logo_url,cover_image_url,business_documents"
            )
            .eq("id", resolution.application.id)
            .maybeSingle();
          if (!active) return;
          if (existingError) {
            logSupabaseError("BecomeVendor.loadRejectedApplication", existingError);
          } else if (existing) {
            const record = existing as RejectedApplicationRecord;
            setForm({
              businessName: record.business_name || "",
              ownerName: record.full_name || "",
              email: record.email || "",
              mobile: record.phone || "",
              categoryId: record.category_id || "",
              experience: record.experience != null ? String(record.experience) : "",
              description: record.description || "",
              instagram: record.instagram || "",
              facebook: record.facebook || "",
              website: record.website || "",
              logoUrl: record.logo_url || "",
              coverImageUrl: record.cover_image_url || "",
            });
            setVendorLocation({
              pincode: record.pincode || "",
              primaryCityId: record.city_id || "",
              primaryAreaId: record.area_id || null,
              serviceAreaIds: record.service_area_ids || [],
              geoLocalityId: record.geo_pincode_locality_id || null,
            });
            setDocuments(record.business_documents || []);
            setIsResubmission(true);
          }
          setBackTarget(backRouteFor("rejected"));
          return; // stay on this screen with the form open for editing.
        }

        // Otherwise, only "no application yet" belongs on this screen.
        // Every other state (pending / approved / already verified) has
        // already applied — send the vendor to their real destination
        // instead of re-opening the form.
        if (resolution.state !== "no_application") {
          if (router.canDismiss()) router.dismissAll();
          router.replace(resolution.destination as never);
          return;
        }
      } catch (caught) {
        if (!active) return;
        logSupabaseError("BecomeVendor.checkAccess", caught);
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: "/VendorAuth" });
        return;
      } finally {
        if (active) setCheckingAccess(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const selectedCategory = categories.find((item) => item.id === form.categoryId);
  const completedRequiredFields = useMemo(() => [
    form.businessName, form.ownerName, form.email, form.mobile, form.categoryId,
    form.experience, form.description,
  ].filter((value) => value.trim()).length + (locationValid ? 1 : 0), [form, locationValid]);
  const requiredComplete = useMemo(() => [
    form.businessName, form.ownerName, form.email, form.mobile, form.categoryId,
    form.experience, form.description,
  ].every((value) => value.trim()) && locationValid, [form, locationValid]);
  const canSubmit = requiredComplete && termsAccepted && !submitting && !uploading;
  const submitBlocker = useMemo(() => {
    if (!locationValid) return "Verify your PIN code and choose your area / village from the matching locations to enable submission.";
    if (!form.businessName.trim() || !form.ownerName.trim() || !form.email.trim() || !form.mobile.trim() || !form.categoryId || !form.experience.trim() || !form.description.trim()) {
      return "Complete all required business details to enable submission.";
    }
    if (!termsAccepted) return "Accept the Terms & Conditions to enable submission.";
    if (uploading) return "Finish the current upload before submitting.";
    return null;
  }, [form, locationValid, termsAccepted, uploading]);

  const uploadImage = async (kind: "logo" | "cover") => {
    if (uploading) return;
    setUploading(kind);
    try {
      if (kind === "logo") {
        const asset = await pickProfileImage();
        if (asset) setLogoEditorAsset(asset);
      } else {
        const url = await pickAndUploadImage({ allowsEditing: true, aspect: [16, 9] });
        if (url) update("coverImageUrl", url);
      }
    } catch (error) {
      Alert.alert("Upload failed", error instanceof CloudinaryError ? error.message : "Unable to upload image.");
    } finally {
      setUploading(null);
    }
  };

  const saveEditedLogo = async (asset: ProfileImageAsset) => {
    setUploading("logo");
    try {
      const url = await uploadCloudinaryImage(asset);
      update("logoUrl", url);
      setLogoEditorAsset(null);
    } catch (error) {
      Alert.alert("Upload failed", error instanceof CloudinaryError ? error.message : "Unable to upload the edited logo.");
    } finally {
      setUploading(null);
    }
  };

  const uploadDocument = async () => {
    if (uploading || documents.length >= 5) return;
    setUploading("document");
    try {
      const document = await pickAndUploadBusinessDocument();
      if (document) setDocuments((current) => [...current, document]);
    } catch (error) {
      Alert.alert("Upload failed", error instanceof CloudinaryError ? error.message : "Unable to upload document.");
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (submitting) return;
    if (!requiredComplete) return Alert.alert("Incomplete application", "Complete all required fields.");
    if (!emailPattern.test(form.email.trim())) return Alert.alert("Invalid email", "Enter a valid email address.");
    if (!phonePattern.test(form.mobile.trim())) return Alert.alert("Invalid mobile number", "Enter a valid mobile number.");
    const experience = Number(form.experience);
    if (!Number.isInteger(experience) || experience < 0 || experience > 100) {
      return Alert.alert("Invalid experience", "Enter a valid number of years.");
    }
    if (!termsAccepted) return Alert.alert("Terms required", "Accept the Terms & Conditions to continue.");
    if (!locationValid) {
      return Alert.alert("Service location required", "Verify your PIN code and choose a locality when prompted.");
    }

    setSubmitting(true);
    const normalizedEmail = form.email.trim().toLowerCase();
    try {
      await submitVendorApplication({
        full_name: form.ownerName.trim(),
        email: normalizedEmail,
        phone: form.mobile.trim(),
        business_name: form.businessName.trim(),
        category_id: form.categoryId,
        description: form.description.trim(),
        experience,
        address: "",
        pincode: vendorLocation.pincode,
        // Keep the legacy managed-city link in sync with the canonical
        // PIN/locality hierarchy. The Edge Function resolves this again
        // server-side so older app builds that still send null remain safe.
        city_id: vendorLocation.primaryCityId || null,
        area_id: null,
        service_area_ids: [],
        geo_pincode_locality_id: vendorLocation.geoLocalityId,
        location_fallback: locationSource === "manual_fallback",
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        website: form.website.trim() || null,
        logo_url: form.logoUrl.trim() || null,
        cover_image_url: form.coverImageUrl.trim() || null,
        business_documents: documents,
      });
      // replace (not push) so the browser/back-stack can't return to the
      // just-submitted form -- the vendor now has a real pending
      // application, and VendorAuthStatus fetches its real DB status
      // itself; the ?status=pending param is only for the first paint.
      if (router.canDismiss()) router.dismissAll();
      router.replace({ pathname: "/VendorAuthStatus", params: { status: "pending" } });
    } catch (caught) {
      Alert.alert("Submission failed", caught instanceof Error ? caught.message : "Unable to submit the Vendor application.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingAccess) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#E91E63" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={4}
          className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"
          onPress={goBack}
        >
          <ArrowLeft size={20} className="text-foreground" />
        </TouchableOpacity>
        <View className="ml-4">
          <Text className="text-foreground text-xl font-bold">
            {isResubmission ? "Edit Your Application" : "Register Your Business"}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {isResubmission ? "Update the details below and resubmit for review" : "Apply to join RoyalLagn"}
          </Text>
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 66 : 0}
      >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 52 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View className="w-full max-w-4xl self-center">
          <View className="bg-primary/10 border border-primary/20 rounded-[20px] p-5 mb-5">
            <View className="flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text className="text-foreground text-xl font-bold">Your vendor application</Text>
                <Text className="text-muted-foreground text-sm leading-5 mt-1.5">Share the essentials, verify your business location, then send your application for review.</Text>
              </View>
              <View className="bg-background rounded-full px-3 py-2 border border-primary/15">
                <Text className="text-primary text-xs font-bold">{completedRequiredFields}/8</Text>
              </View>
            </View>
            <View className="h-1.5 bg-primary/15 rounded-full mt-5 overflow-hidden">
              <View className="h-full bg-primary rounded-full" style={{ width: `${(completedRequiredFields / 8) * 100}%` }} />
            </View>
            <Text className="text-muted-foreground text-xs mt-2">Required details completed</Text>
          </View>

          <FormSection title="Business details" description="These details are shown to our review team. Fields marked * are required.">
            <FormGrid wide={isWideLayout}>
              <Field label="Business Name" required value={form.businessName} onChangeText={(v) => update("businessName", v)} />
              <Field label="Owner Name" required value={form.ownerName} onChangeText={(v) => update("ownerName", v)} />
              <Field label="Email" required value={form.email} onChangeText={(v) => update("email", v)} keyboardType="email-address" autoCapitalize="none" />
              <Field label="Mobile Number" required value={form.mobile} onChangeText={(v) => update("mobile", sanitizePhoneInput(v))} placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={20} />
              <View>
                <Text className="text-foreground text-sm font-semibold mb-2.5">Business Category <Text className="text-primary">*</Text></Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={selectedCategory ? `Business category, ${selectedCategory.name}` : "Select business category"}
                  accessibilityState={{ expanded: categoryOpen }}
                  className="border border-border bg-background rounded-xl px-4 h-14 mb-5 flex-row items-center justify-between"
                  onPress={() => setCategoryOpen(true)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
                >
                  <Text className={selectedCategory ? "text-foreground font-medium" : "text-muted-foreground"}>{selectedCategory?.name ?? "Select business category"}</Text>
                  <ChevronDown size={18} className="text-muted-foreground" />
                </Pressable>
              </View>
              <Field label="Years of Experience" required value={form.experience} onChangeText={(v) => update("experience", v)} keyboardType="number-pad" />
            </FormGrid>
            <VendorServiceLocationEditor
              value={vendorLocation}
              onChange={setVendorLocation}
              requireLookup={!isResubmission}
              onValidationChange={(valid, source) => { setLocationValid(valid); setLocationSource(source); }}
              enforceApplicationAvailability
            />
            <Field label="Business Description" required multiline value={form.description} onChangeText={(v) => update("description", v)} placeholder="Describe your services, style, and what makes your business special" />
          </FormSection>

          <FormSection title="Online presence" description="Add any social links or website you would like us to review." optional>
            <FormGrid wide={isWideLayout}>
              <Field label="Instagram" value={form.instagram} onChangeText={(v) => update("instagram", v)} autoCapitalize="none" placeholder="instagram.com/yourbusiness" />
              <Field label="Facebook" value={form.facebook} onChangeText={(v) => update("facebook", v)} autoCapitalize="none" placeholder="facebook.com/yourbusiness" />
            </FormGrid>
            <Field label="Website" value={form.website} onChangeText={(v) => update("website", v)} keyboardType="url" autoCapitalize="none" placeholder="yourbusiness.com" />
          </FormSection>

          <FormSection title="Business media" description="A logo, cover image, or supporting documents can help your application stand out." optional>
          <FormGrid wide={isWideLayout}>{(["logo", "cover"] as const).map((kind) => {
            const url = kind === "logo" ? form.logoUrl : form.coverImageUrl;
            return (
              <View key={kind} className="mb-5">
                <View className="flex-row items-center justify-between mb-2.5">
                  <View>
                    <Text className="text-foreground text-sm font-semibold">{kind === "logo" ? "Logo" : "Cover image"}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{kind === "logo" ? "Square image · optimized for upload" : "A landscape image works best"}</Text>
                  </View>
                  {url ? <View className="bg-primary/10 px-2.5 py-1 rounded-full"><Text className="text-primary text-xs font-semibold">Added</Text></View> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={url ? `Change ${kind === "logo" ? "logo" : "cover image"}` : `Upload ${kind === "logo" ? "logo" : "cover image"}`}
                  accessibilityState={{ disabled: !!uploading, busy: uploading === kind }}
                  className={`rounded-xl border border-dashed border-primary/50 items-center justify-center overflow-hidden ${kind === "logo" ? "w-36 h-36 self-center bg-background" : "h-40 bg-primary/5"}`}
                  onPress={() => uploadImage(kind)}
                  disabled={!!uploading}
                  style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
                >
                  {url ? <Image source={{ uri: url }} className="w-full h-full" resizeMode={kind === "logo" ? "contain" : "cover"} /> :
                    uploading === kind ? <ActivityIndicator color="#EC4899" /> :
                    <><ImagePlus size={27} className="text-primary mb-2" /><Text className="text-foreground font-medium">Upload {kind === "logo" ? "Logo" : "Cover Image"}</Text></>}
                </Pressable>
              </View>
            );
          })}</FormGrid>
          <Text className="text-foreground text-sm font-semibold mb-2.5">Business documents</Text>
          {documents.map((document, index) => (
            <View key={`${document.url}-${index}`} className="flex-row items-center bg-background border border-border rounded-2xl p-3 mb-2">
              <FileText size={20} className="text-primary" />
              <Text className="text-foreground text-sm flex-1 ml-3" numberOfLines={1}>{document.name}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Remove document ${document.name}`}
                hitSlop={12}
                onPress={() => setDocuments((current) => current.filter((_, i) => i !== index))}
              ><Trash2 size={18} className="text-destructive" /></TouchableOpacity>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add PDF or image document, ${documents.length} of 5 used`}
            accessibilityState={{ disabled: !!uploading || documents.length >= 5, busy: uploading === "document" }}
            className="h-14 rounded-xl border border-dashed border-primary/50 items-center justify-center flex-row"
            onPress={uploadDocument}
            disabled={!!uploading || documents.length >= 5}
            style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
          >
            {uploading === "document" ? <ActivityIndicator color="#EC4899" /> : <><FileText size={19} className="text-primary mr-2" /><Text className="text-primary font-semibold">Add PDF or Image ({documents.length}/5)</Text></>}
          </Pressable>
          </FormSection>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
          accessibilityLabel="I agree to the Terms & Conditions and confirm that the information provided is accurate."
          className="bg-card border border-border rounded-[20px] p-4 flex-row items-start mb-5"
          onPress={() => setTermsAccepted((value) => !value)}
          style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
        >
          <View className={`w-6 h-6 rounded-md border items-center justify-center mr-3 mt-0.5 ${termsAccepted ? "bg-primary border-primary" : "border-border bg-card"}`}>
            {termsAccepted ? <Check size={16} color="#FFF" /> : null}
          </View>
          <Text className="text-foreground flex-1 leading-5">I agree to the Terms & Conditions and confirm that the information provided is accurate.</Text>
        </Pressable>

        {submitBlocker ? <View accessibilityRole="alert" className="flex-row items-start gap-2 mb-4 px-1"><CircleAlert size={17} color="#B42318" /><Text className="flex-1 text-sm leading-5 text-destructive">{submitBlocker}</Text></View> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit application"
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
          className={`rounded-xl h-14 items-center justify-center ${canSubmit ? "bg-primary" : "bg-muted"}`}
          disabled={!canSubmit}
          onPress={submit}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text className={canSubmit ? "text-white font-bold" : "text-muted-foreground font-bold"}>Submit Application</Text>}
        </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setCategoryOpen(false)}>
          <Pressable className="bg-card rounded-t-3xl p-5 max-h-[70%]" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-foreground text-lg font-bold">Select Category</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close category selector" hitSlop={10} onPress={() => setCategoryOpen(false)}><X className="text-foreground" /></TouchableOpacity>
            </View>
            <ScrollView>{categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                accessibilityRole="radio"
                accessibilityLabel={category.name}
                accessibilityState={{ checked: category.id === form.categoryId }}
                className="py-4 border-b border-border"
                onPress={() => { update("categoryId", category.id); setCategoryOpen(false); }}
              >
                <Text className="text-foreground">{category.name}</Text>
              </TouchableOpacity>
            ))}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <SquareImageEditor
        asset={logoEditorAsset}
        busy={uploading === "logo"}
        kind="logo"
        onCancel={() => setLogoEditorAsset(null)}
        onSave={saveEditedLogo}
      />
    </SafeAreaView>
  );
}
