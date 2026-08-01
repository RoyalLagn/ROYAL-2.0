import React, { useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft, Check, ChevronDown, FileText, ImagePlus, Trash2, X,
} from "lucide-react-native";
import {
  CloudinaryError, pickAndUploadBusinessDocument, pickAndUploadImage,
  type UploadedBusinessDocument,
} from "@/services/cloudinary";
import { useCategories } from "@/context/CategoryContext";
import {
  VendorServiceLocationEditor,
  type VendorLocationValue,
} from "@/components/locations/VendorServiceLocationEditor";
import { useCustomerLocation } from "@/context/LocationContext";
import { submitVendorApplication } from "@/services/vendorApplications";

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
const phonePattern = /^[+]?[0-9\s-]{7,15}$/;

function Field({
  label, value, onChangeText, required, multiline, keyboardType = "default",
  autoCapitalize = "sentences",
}: {
  label: string; value: string; onChangeText: (value: string) => void;
  required?: boolean; multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words";
}) {
  return (
    <View className="mb-4">
      <Text className="text-foreground text-sm font-semibold mb-2">
        {label}{required ? <Text className="text-primary"> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={`Enter ${label.toLowerCase()}`}
        placeholderTextColor="#8A8589"
        className={`border border-border bg-background text-foreground rounded-2xl px-4 ${multiline ? "min-h-[112px] py-4" : "h-14"}`}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

export default function BecomeVendor() {
  const router = useRouter();
  const { registrationCategories: categories } = useCategories();
  const { locations } = useCustomerLocation();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [vendorLocation, setVendorLocation] = useState<VendorLocationValue>({
    pincode: "",
    primaryCityId: "",
    primaryAreaId: null,
    serviceAreaIds: [],
  });
  const [locationValid, setLocationValid] = useState(false);
  const [locationSource, setLocationSource] = useState<"verified" | "manual_fallback" | null>(null);
  const [documents, setDocuments] = useState<UploadedBusinessDocument[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | "document" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const selectedCategory = categories.find((item) => item.id === form.categoryId);
  const requiredComplete = useMemo(() => [
    form.businessName, form.ownerName, form.email, form.mobile, form.categoryId,
    form.experience, form.description,
  ].every((value) => value.trim()) && locationValid, [form, locationValid]);

  const uploadImage = async (kind: "logo" | "cover") => {
    if (uploading) return;
    setUploading(kind);
    try {
      const url = await pickAndUploadImage({
        allowsEditing: true,
        aspect: kind === "logo" ? [1, 1] : [16, 9],
      });
      if (url) update(kind === "logo" ? "logoUrl" : "coverImageUrl", url);
    } catch (error) {
      Alert.alert("Upload failed", error instanceof CloudinaryError ? error.message : "Unable to upload image.");
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
    const selectedCity = locations.find((item) => item.id === vendorLocation.primaryCityId);
    const selectedArea = selectedCity?.areas.find((item) => item.id === vendorLocation.primaryAreaId);
    if (!selectedCity || !locationValid) {
      return Alert.alert("Service location required", "Verify your PIN code and choose an active RoyalLagn service location.");
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
        address: selectedArea?.name ?? selectedCity.name,
        pincode: vendorLocation.pincode,
        city_id: selectedCity.id,
        area_id: selectedArea?.id ?? null,
        service_area_ids: vendorLocation.serviceAreaIds,
        location_fallback: locationSource === "manual_fallback",
        instagram: form.instagram.trim() || null,
        facebook: form.facebook.trim() || null,
        website: form.website.trim() || null,
        logo_url: form.logoUrl.trim() || null,
        cover_image_url: form.coverImageUrl.trim() || null,
        business_documents: documents,
      });
      setSubmitted(true);
    } catch (caught) {
      Alert.alert("Submission failed", caught instanceof Error ? caught.message : "Unable to submit the Vendor application.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-7">
        <View className="w-20 h-20 rounded-full bg-primary/15 items-center justify-center mb-6">
          <Check size={38} className="text-primary" />
        </View>
        <Text className="text-foreground text-2xl font-bold text-center mb-3">Application Submitted Successfully</Text>
        <Text className="text-muted-foreground text-center leading-6">
          Thank you for registering with RoyalLagn.{"\n\n"}
          Your application has been received and is under review.{"\n\n"}
          Our team will review your application and notify you by email after approval.
        </Text>
        <View className="bg-card border border-border rounded-2xl px-6 py-4 my-7 w-full">
          <Text className="text-muted-foreground text-xs text-center uppercase tracking-wider">Estimated review time</Text>
          <Text className="text-foreground text-lg font-bold text-center mt-1">24–48 hours</Text>
        </View>
        <TouchableOpacity className="bg-primary px-9 py-4 rounded-2xl" onPress={() => router.replace("/(tabs)")}>
          <Text className="text-white font-bold">Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <TouchableOpacity className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center" onPress={() => router.back()}>
          <ArrowLeft size={20} className="text-foreground" />
        </TouchableOpacity>
        <View className="ml-4">
          <Text className="text-foreground text-xl font-bold">Register Your Business</Text>
          <Text className="text-muted-foreground text-xs">Apply to join RoyalLagn</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 52 }} keyboardShouldPersistTaps="handled">
        <View className="bg-primary/10 border border-primary/20 rounded-3xl p-5 mb-5">
          <Text className="text-foreground font-bold text-lg">Vendor Application</Text>
          <Text className="text-muted-foreground text-sm leading-5 mt-1">Tell us about your business. Fields marked * are required.</Text>
        </View>

        <View className="bg-card border border-border rounded-3xl p-5 mb-5">
          <Text className="text-primary text-xs font-bold uppercase tracking-wider mb-5">Business details</Text>
          <Field label="Business Name" required value={form.businessName} onChangeText={(v) => update("businessName", v)} />
          <Field label="Owner Name" required value={form.ownerName} onChangeText={(v) => update("ownerName", v)} />
          <Field label="Email" required value={form.email} onChangeText={(v) => update("email", v)} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Mobile Number" required value={form.mobile} onChangeText={(v) => update("mobile", v)} keyboardType="phone-pad" />
          <Text className="text-foreground text-sm font-semibold mb-2">Business Category <Text className="text-primary">*</Text></Text>
          <TouchableOpacity className="border border-border bg-background rounded-2xl px-4 h-14 mb-4 flex-row items-center justify-between" onPress={() => setCategoryOpen(true)}>
            <Text className={selectedCategory ? "text-foreground" : "text-muted-foreground"}>{selectedCategory?.name ?? "Select business category"}</Text>
            <ChevronDown size={18} className="text-muted-foreground" />
          </TouchableOpacity>
          <VendorServiceLocationEditor
            value={vendorLocation}
            onChange={setVendorLocation}
            onValidationChange={(valid, source) => { setLocationValid(valid); setLocationSource(source); }}
          />
          <Field label="Years of Experience" required value={form.experience} onChangeText={(v) => update("experience", v)} keyboardType="number-pad" />
          <Field label="Business Description" required multiline value={form.description} onChangeText={(v) => update("description", v)} />
        </View>

        <View className="bg-card border border-border rounded-3xl p-5 mb-5">
          <Text className="text-primary text-xs font-bold uppercase tracking-wider mb-5">Online presence (optional)</Text>
          <Field label="Instagram" value={form.instagram} onChangeText={(v) => update("instagram", v)} autoCapitalize="none" />
          <Field label="Facebook" value={form.facebook} onChangeText={(v) => update("facebook", v)} autoCapitalize="none" />
          <Field label="Website" value={form.website} onChangeText={(v) => update("website", v)} keyboardType="url" autoCapitalize="none" />
        </View>

        <View className="bg-card border border-border rounded-3xl p-5 mb-5">
          <Text className="text-primary text-xs font-bold uppercase tracking-wider mb-5">Business media (optional)</Text>
          {(["logo", "cover"] as const).map((kind) => {
            const url = kind === "logo" ? form.logoUrl : form.coverImageUrl;
            return (
              <View key={kind} className="mb-4">
                <Text className="text-foreground text-sm font-semibold mb-2">{kind === "logo" ? "Logo" : "Cover Image"}</Text>
                <TouchableOpacity className={`rounded-2xl border border-dashed border-primary/50 bg-primary/5 items-center justify-center overflow-hidden ${kind === "logo" ? "h-36" : "h-44"}`} onPress={() => uploadImage(kind)} disabled={!!uploading}>
                  {url ? <Image source={{ uri: url }} className="w-full h-full" resizeMode="cover" /> :
                    uploading === kind ? <ActivityIndicator color="#EC4899" /> :
                    <><ImagePlus size={27} className="text-primary mb-2" /><Text className="text-foreground font-medium">Upload {kind === "logo" ? "Logo" : "Cover Image"}</Text></>}
                </TouchableOpacity>
              </View>
            );
          })}
          <Text className="text-foreground text-sm font-semibold mb-2">Business Documents</Text>
          {documents.map((document, index) => (
            <View key={`${document.url}-${index}`} className="flex-row items-center bg-background border border-border rounded-2xl p-3 mb-2">
              <FileText size={20} className="text-primary" />
              <Text className="text-foreground text-sm flex-1 ml-3" numberOfLines={1}>{document.name}</Text>
              <TouchableOpacity onPress={() => setDocuments((current) => current.filter((_, i) => i !== index))}><Trash2 size={18} className="text-destructive" /></TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity className="h-14 rounded-2xl border border-dashed border-primary/50 items-center justify-center flex-row" onPress={uploadDocument} disabled={!!uploading || documents.length >= 5}>
            {uploading === "document" ? <ActivityIndicator color="#EC4899" /> : <><FileText size={19} className="text-primary mr-2" /><Text className="text-primary font-semibold">Add PDF or Image ({documents.length}/5)</Text></>}
          </TouchableOpacity>
        </View>

        <Pressable className="flex-row items-start mb-6" onPress={() => setTermsAccepted((value) => !value)}>
          <View className={`w-6 h-6 rounded-md border items-center justify-center mr-3 mt-0.5 ${termsAccepted ? "bg-primary border-primary" : "border-border bg-card"}`}>
            {termsAccepted ? <Check size={16} color="#FFF" /> : null}
          </View>
          <Text className="text-foreground flex-1 leading-5">I agree to the Terms & Conditions and confirm that the information provided is accurate.</Text>
        </Pressable>

        <TouchableOpacity className={`rounded-2xl py-4 items-center ${requiredComplete && termsAccepted ? "bg-primary" : "bg-muted"}`} disabled={!requiredComplete || !termsAccepted || submitting || !!uploading} onPress={submit}>
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text className={requiredComplete && termsAccepted ? "text-white font-bold" : "text-muted-foreground font-bold"}>Submit Application</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setCategoryOpen(false)}>
          <Pressable className="bg-card rounded-t-3xl p-5 max-h-[70%]" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-foreground text-lg font-bold">Select Category</Text>
              <TouchableOpacity onPress={() => setCategoryOpen(false)}><X className="text-foreground" /></TouchableOpacity>
            </View>
            <ScrollView>{categories.map((category) => (
              <TouchableOpacity key={category.id} className="py-4 border-b border-border" onPress={() => { update("categoryId", category.id); setCategoryOpen(false); }}>
                <Text className="text-foreground">{category.name}</Text>
              </TouchableOpacity>
            ))}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
