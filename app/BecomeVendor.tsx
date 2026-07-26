import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, BackHandler, Image, Modal, Pressable, ScrollView,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Camera, Check, ChevronDown, X } from "lucide-react-native";
import { supabase } from "@/services/supabase";
import { CloudinaryError, pickAndUploadImage } from "@/services/cloudinary";

type Category = { id: string; name: string };
type FormState = Record<string, string>;
const initialForm: FormState = {
  full_name: "", email: "", phone: "", business_name: "", category_id: "",
  description: "", experience: "", address: "", city: "", state: "",
  pincode: "", country: "India", instagram: "", facebook: "", website: "", logo_url: "",
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[0-9\s-]{7,15}$/;
const requiredKeys = ["full_name", "email", "phone", "business_name", "category_id", "description", "experience", "address", "city", "state", "pincode", "country"];

const sections = [
  { title: "Personal Information", fields: [["full_name", "Full Name"], ["email", "Email"], ["phone", "Phone Number"]] },
  { title: "Business Information", fields: [["business_name", "Business Name"], ["description", "Business Description"], ["experience", "Years of Experience"]] },
  { title: "Business Address", fields: [["address", "Address"], ["city", "City"], ["state", "State"], ["pincode", "Pincode"], ["country", "Country"]] },
  { title: "Social Links (Optional)", fields: [["instagram", "Instagram"], ["facebook", "Facebook"], ["website", "Website"]] },
] as const;

export default function BecomeVendor() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/DashboardCenter");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,email,phone,role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile || profile.role !== "vendor") {
        router.replace("/DashboardCenter");
        return;
      }
      setForm((current) => ({
        ...current,
        full_name: profile.full_name || current.full_name,
        email: profile.email || data.user?.email || current.email,
        phone: profile.phone || current.phone,
      }));
    });
    supabase.from("categories").select("id,name").order("name").then(({ data, error }) => {
      if (error) Alert.alert("Unable to load categories", error.message);
      else setCategories(data ?? []);
    });
  }, [router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.dismissAll();
      router.replace("/(tabs)");
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  const selectedCategory = categories.find((item) => item.id === form.category_id);
  const isComplete = useMemo(
    () => requiredKeys.every((key) => form[key]?.trim()) && !!form.logo_url && declared,
    [declared, form]
  );

  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const uploadLogo = async () => {
    if (uploading) return;

    setUploading(true);
    try {
      const uploadedUrl = await pickAndUploadImage({
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (uploadedUrl) {
        update("logo_url", uploadedUrl);
      }
    } catch (error) {
      Alert.alert("Upload failed", error instanceof CloudinaryError ? error.message : "Unable to upload the logo.");
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!isComplete || submitting) return;
    if (!emailPattern.test(form.email.trim())) return Alert.alert("Invalid email", "Enter a valid email address.");
    if (!phonePattern.test(form.phone.trim())) return Alert.alert("Invalid phone", "Enter a valid phone number.");
    const experience = Number(form.experience);
    if (!Number.isInteger(experience) || experience < 0) return Alert.alert("Invalid experience", "Enter a valid number of years.");

    setSubmitting(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setSubmitting(false);
      router.replace("/DashboardCenter");
      return;
    }
    const { data: existing, error: existingError } = await supabase
      .from("vendor_applications")
      .select("id,status")
      .eq("profile_id", authData.user.id)
      .in("status", ["pending", "approved"])
      .limit(1);
    if (existingError) {
      setSubmitting(false);
      return Alert.alert("Submission failed", existingError.message);
    }
    if (existing?.length) {
      setSubmitting(false);
      return router.replace(existing[0].status === "approved"
        ? "/vendor-dashboard"
        : { pathname: "/VendorAuthStatus", params: { status: "pending" } });
    }
    const { error } = await supabase.from("vendor_applications").insert({
      ...form,
      profile_id: authData.user.id,
      email: form.email.trim().toLowerCase(),
      experience,
      instagram: form.instagram.trim() || null,
      facebook: form.facebook.trim() || null,
      website: form.website.trim() || null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) Alert.alert("Submission failed", error.message);
    else {
      setSuccess(true);
      router.replace({ pathname: "/VendorAuthStatus", params: { status: "pending" } });
    }
  };

  if (success) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-7">
      <View className="w-20 h-20 rounded-full bg-primary/15 items-center justify-center mb-6"><Check size={38} className="text-primary" /></View>
      <Text className="text-foreground text-2xl font-bold text-center mb-3">Application Submitted</Text>
      <Text className="text-muted-foreground text-center leading-6 mb-8">Your vendor registration request is pending admin review.</Text>
      <TouchableOpacity className="bg-primary px-8 py-4 rounded-2xl" onPress={() => router.replace("/(tabs)")}><Text className="text-white font-semibold">Back to Home</Text></TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <View className="flex-row items-center px-5 py-4 border-b border-border">
        <TouchableOpacity
          className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"
          onPress={() => {
            router.dismissAll();
            router.replace("/(tabs)");
          }}
        >
          <ArrowLeft size={20} className="text-foreground" />
        </TouchableOpacity>
        <View className="ml-4"><Text className="text-foreground text-xl font-bold">Become a Vendor</Text><Text className="text-muted-foreground text-xs">Grow your business with RoyalLagn</Text></View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        {sections.map((section) => (
          <View key={section.title} className="bg-card border border-border rounded-3xl p-5 mb-5">
            <Text className="text-primary text-xs font-bold uppercase tracking-wider mb-4">{section.title}</Text>
            {section.title === "Business Information" ? (
              <TouchableOpacity className="border border-border bg-background rounded-2xl px-4 py-4 mb-3 flex-row justify-between" onPress={() => setCategoryOpen(true)}>
                <Text className={selectedCategory ? "text-foreground" : "text-muted-foreground"}>{selectedCategory?.name ?? "Vendor Category"}</Text><ChevronDown size={18} className="text-muted-foreground" />
              </TouchableOpacity>
            ) : null}
            {section.fields.map(([key, label]) => (
              <TextInput
                key={key} value={form[key]} onChangeText={(value) => update(key, value)} placeholder={label} placeholderTextColor="#8A8589"
                className="border border-border bg-background text-foreground rounded-2xl px-4 py-4 mb-3"
                multiline={key === "description" || key === "address"}
                keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : key === "experience" || key === "pincode" ? "number-pad" : "default"}
                autoCapitalize={key === "email" || key === "website" || key === "instagram" || key === "facebook" ? "none" : "sentences"}
              />
            ))}
          </View>
        ))}

        <View className="bg-card border border-border rounded-3xl p-5 mb-5">
          <Text className="text-primary text-xs font-bold uppercase tracking-wider mb-4">Business Logo</Text>
          <TouchableOpacity className="h-36 rounded-2xl border border-dashed border-primary/50 bg-primary/5 items-center justify-center overflow-hidden" onPress={uploadLogo} disabled={uploading}>
            {form.logo_url ? <Image source={{ uri: form.logo_url }} className="w-full h-full" resizeMode="cover" /> : uploading ? <ActivityIndicator color="#EC4899" /> : <><Camera size={28} className="text-primary mb-2" /><Text className="text-foreground font-medium">Upload Business Logo</Text></>}
          </TouchableOpacity>
        </View>

        <Pressable className="flex-row items-center mb-6" onPress={() => setDeclared((value) => !value)}>
          <View className={`w-6 h-6 rounded-md border items-center justify-center mr-3 ${declared ? "bg-primary border-primary" : "border-border bg-card"}`}>{declared ? <Check size={16} color="#FFF" /> : null}</View>
          <Text className="text-foreground flex-1">I confirm that the information provided is correct.</Text>
        </Pressable>

        <TouchableOpacity className={`rounded-2xl py-4 items-center ${isComplete ? "bg-primary" : "bg-muted"}`} disabled={!isComplete || submitting} onPress={submit}>
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text className={isComplete ? "text-white font-bold" : "text-muted-foreground font-bold"}>Submit Application</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={categoryOpen} transparent animationType="fade" onRequestClose={() => setCategoryOpen(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setCategoryOpen(false)}>
          <Pressable className="bg-card rounded-t-3xl p-5 max-h-[65%]" onPress={(event) => event.stopPropagation()}>
            <View className="flex-row justify-between mb-4"><Text className="text-foreground text-lg font-bold">Select Category</Text><TouchableOpacity onPress={() => setCategoryOpen(false)}><X className="text-foreground" /></TouchableOpacity></View>
            <ScrollView>{categories.map((category) => <TouchableOpacity key={category.id} className="py-4 border-b border-border" onPress={() => { update("category_id", category.id); setCategoryOpen(false); }}><Text className="text-foreground">{category.name}</Text></TouchableOpacity>)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
