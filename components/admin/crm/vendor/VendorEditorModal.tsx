import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { BriefcaseBusiness, MapPinned, NotebookPen, UsersRound, X } from "lucide-react-native";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { CrmExecutiveService } from "@/services/crm/executiveService";
import type { CrmVendorCategory } from "@/types/crm/category";
import type { CrmSalesExecutive } from "@/types/crm/executive";
import type { CrmVendorInput, CrmVendorListItem, CrmVendorPriority } from "@/types/crm/vendor";
import { sanitizePhoneInput, validateEmail, validatePhone } from "@/utils/authValidation";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

const isValidUrlLike = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return true;
  } catch {
    return false;
  }
};

type VendorEditorModalProps = {
  visible: boolean;
  clusterId: string;
  defaultCategoryId: string | null;
  defaultCategoryName?: string | null;
  vendor: CrmVendorListItem | null;
  saving: boolean;
  error: string | null;
  onSave: (input: CrmVendorInput) => Promise<void>;
  onClose: () => void;
};

const priorities: CrmVendorPriority[] = ["low", "medium", "high"];

function Field({ label, value, onChangeText, placeholder, keyboardType, error, maxLength, onBlur, multiline = false }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "url"; error?: string; maxLength?: number; onBlur?: () => void; multiline?: boolean;
}) {
  return (
    <View className="mb-3 flex-1 min-w-[220px]">
      <Text className="text-foreground text-xs font-semibold mb-1.5 tracking-[0.1px]">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={multiline ? { minHeight: 104, paddingTop: 12 } : undefined}
        className={`border rounded-xl px-3.5 py-3 text-[13px] text-foreground bg-background ${multiline ? "" : "h-12"} ${error ? "border-red-500" : "border-border"}`}
      />
      {error ? <Text accessibilityRole="alert" className="text-red-500 text-xs mt-1">{error}</Text> : null}
    </View>
  );
}

function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  children: React.ReactNode;
}) {
  return (
    <View className="border border-primary/15 bg-primary/[0.025] rounded-2xl p-4 mb-3.5">
      <View className="flex-row items-center gap-3 mb-4">
        <View className="h-10 w-10 rounded-xl bg-primary/10 items-center justify-center">
          <Icon size={19} className="text-primary" strokeWidth={2.1} />
        </View>
        <View className="flex-1">
          <Text className="text-foreground text-sm font-bold">{title}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5">{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export function VendorEditorModal({
  visible, clusterId, defaultCategoryId, defaultCategoryName, vendor, saving, error, onSave, onClose,
}: VendorEditorModalProps) {
  const { width } = useWindowDimensions();
  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [executives, setExecutives] = useState<CrmSalesExecutive[]>([]);
  const [form, setForm] = useState<CrmVendorInput>({
    clusterId, categoryId: defaultCategoryId ?? "", businessName: "", priority: "medium",
  });
  const [businessNameTouched, setBusinessNameTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void CrmCategoryService.list().then(setCategories).catch(() => setCategories([]));
    void CrmExecutiveService.list().then(setExecutives).catch(() => setExecutives([]));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setBusinessNameTouched(false);
    if (vendor) {
      setForm({
        clusterId: vendor.cluster_id, categoryId: vendor.category_id,
        assignedExecutiveId: vendor.assigned_executive_id,
        businessName: vendor.business_name, ownerName: vendor.owner_name,
        phone: vendor.phone, alternatePhone: vendor.alternate_phone, whatsapp: vendor.whatsapp,
        email: vendor.email, website: vendor.website, instagram: vendor.instagram,
        googleMapsUrl: vendor.google_maps_url, area: vendor.area, priority: vendor.priority,
        leadSource: vendor.lead_source, visitedDate: vendor.visited_date, notes: vendor.notes,
        rating: vendor.rating,
      });
    } else {
      setForm({ clusterId, categoryId: defaultCategoryId ?? "", businessName: "", priority: "medium" });
    }
  }, [visible, vendor, clusterId, defaultCategoryId]);

  const set = <K extends keyof CrmVendorInput>(key: K, value: CrmVendorInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Every message here is field-specific, matching what the user types
  // (or leaves blank) -- Business Name is the only field that's required,
  // everything else is optional but validated for format when filled in.
  const errors = useMemo(() => {
    const next: Partial<Record<keyof CrmVendorInput, string>> = {};
    if (!form.businessName.trim()) next.businessName = "Business name is required.";
    if (form.phone?.trim() && !validatePhone(form.phone)) next.phone = "Enter a valid 10-digit mobile number.";
    if (form.alternatePhone?.trim() && !validatePhone(form.alternatePhone)) next.alternatePhone = "Enter a valid 10-digit mobile number.";
    if (form.whatsapp?.trim() && !validatePhone(form.whatsapp)) next.whatsapp = "Enter a valid 10-digit mobile number.";
    if (form.email?.trim() && !validateEmail(form.email)) next.email = "Enter a valid email address.";
    if (form.website?.trim() && !isValidUrlLike(form.website)) next.website = "Enter a valid website URL.";
    if (form.googleMapsUrl?.trim() && !isValidUrlLike(form.googleMapsUrl)) next.googleMapsUrl = "Enter a valid Google Maps URL.";
    return next;
  }, [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const isDesktop = width >= 760;
  const isCategoryLocked = Boolean(defaultCategoryId);
  const selectedCategoryName = defaultCategoryName || categories.find((category) => category.id === form.categoryId)?.name || "Selected category";
  const isSubmitDisabled = saving || !form.businessName.trim() || !form.categoryId || hasErrors;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 items-center justify-center p-3 sm:p-6" onPress={onClose}>
        <Pressable
          className={`w-full bg-card overflow-hidden ${isDesktop ? "rounded-3xl" : "rounded-2xl"}`}
          style={{ maxWidth: 1180, maxHeight: isDesktop ? "90%" : "94%" }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="flex-row items-start justify-between px-5 pt-5 pb-4 border-b border-primary/10 sm:px-6 sm:pt-6">
            <View className="flex-1 pr-4">
              <Text className="text-foreground text-xl font-bold tracking-[-0.25px]">{vendor ? "Edit Vendor" : "Add Vendor"}</Text>
              <Text className="text-muted-foreground text-sm mt-1">{vendor ? "Update the vendor details below" : "Enter vendor details to add them to the directory"}</Text>
            </View>
            <Pressable accessibilityLabel="Close" onPress={onClose} className="h-9 w-9 rounded-xl border border-border bg-background items-center justify-center active:opacity-70">
              <X size={19} className="text-foreground" strokeWidth={2.25} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView contentContainerClassName="p-5 pb-6 sm:p-6">
            {error ? <View className="border border-red-200 bg-red-50 rounded-xl px-3.5 py-3 mb-3.5"><Text className="text-red-600 text-xs font-medium">{error}</Text></View> : null}

            <FormSection title="Vendor details" description="Core business and category information" icon={BriefcaseBusiness}>
              <Text className="text-foreground text-xs font-semibold mb-2">Category</Text>
              {isCategoryLocked ? (
                <View className="h-11 rounded-xl border border-primary/20 bg-primary/10 px-3.5 flex-row items-center mb-4">
                  <Text className="text-primary text-xs font-bold flex-1">{selectedCategoryName}</Text>
                  <Text className="text-primary/75 text-[11px] font-medium">Set by this category page</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2 pr-2">
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => set("categoryId", category.id)}
                        className={`px-3.5 py-2.5 rounded-xl border active:opacity-80 ${form.categoryId === category.id ? "bg-primary border-primary" : "bg-background border-border"}`}
                      >
                        <Text className={`text-xs font-semibold ${form.categoryId === category.id ? "text-white" : "text-foreground"}`}>{category.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}
              <View className={isDesktop ? "flex-row flex-wrap gap-x-3" : ""}>
                <Field label="Business Name *" value={form.businessName} onChangeText={(value) => set("businessName", value)} onBlur={() => setBusinessNameTouched(true)} placeholder="e.g. Royal Wedding Hall" error={businessNameTouched ? errors.businessName : undefined} />
                <Field label="Owner Name" value={form.ownerName ?? ""} onChangeText={(value) => set("ownerName", value)} />
              </View>
            </FormSection>

            <FormSection title="Contact & online presence" description="Phone, email and public business links" icon={UsersRound}>
              <View className={isDesktop ? "flex-row flex-wrap gap-x-3" : ""}>
                <Field label="Phone" value={form.phone ?? ""} onChangeText={(value) => set("phone", sanitizePhoneInput(value))} keyboardType="phone-pad" placeholder="10-digit mobile number" maxLength={20} error={errors.phone} />
                <Field label="Alternate Phone" value={form.alternatePhone ?? ""} onChangeText={(value) => set("alternatePhone", sanitizePhoneInput(value))} keyboardType="phone-pad" placeholder="10-digit mobile number" maxLength={20} error={errors.alternatePhone} />
                <Field label="WhatsApp" value={form.whatsapp ?? ""} onChangeText={(value) => set("whatsapp", sanitizePhoneInput(value))} keyboardType="phone-pad" placeholder="10-digit mobile number" maxLength={20} error={errors.whatsapp} />
                <Field label="Email" value={form.email ?? ""} onChangeText={(value) => set("email", value)} keyboardType="email-address" placeholder="business@example.com" error={errors.email} />
                <Field label="Website" value={form.website ?? ""} onChangeText={(value) => set("website", value)} keyboardType="url" placeholder="https://example.com" error={errors.website} />
                <Field label="Instagram" value={form.instagram ?? ""} onChangeText={(value) => set("instagram", value)} />
                <Field label="Google Maps URL" value={form.googleMapsUrl ?? ""} onChangeText={(value) => set("googleMapsUrl", value)} keyboardType="url" placeholder="https://maps.google.com/…" error={errors.googleMapsUrl} />
              </View>
            </FormSection>

            <FormSection title="Location & follow-up" description="Where this vendor is and how the lead is managed" icon={MapPinned}>
              <View className={isDesktop ? "flex-row flex-wrap gap-x-3" : ""}>
                <Field label="Area" value={form.area ?? ""} onChangeText={(value) => set("area", value)} placeholder="Locality within the cluster" />
                <Field label="Lead Source" value={form.leadSource ?? ""} onChangeText={(value) => set("leadSource", value)} placeholder="e.g. Referral, Cold visit" />
                <Field label="Visited Date" value={form.visitedDate ?? ""} onChangeText={(value) => set("visitedDate", value)} placeholder="YYYY-MM-DD" />
              </View>

              <Text className="text-foreground text-xs font-semibold mb-2">Priority</Text>
              <View className="flex-row gap-2 mb-4">
                {priorities.map((priority) => (
                  <Pressable
                    key={priority}
                    onPress={() => set("priority", priority)}
                    className={`flex-1 h-11 rounded-xl border items-center justify-center active:opacity-80 ${form.priority === priority ? "bg-primary/10 border-primary" : "bg-background border-border"}`}
                  >
                    <Text className={`text-xs font-bold capitalize ${form.priority === priority ? "text-primary" : "text-foreground"}`}>{priority}</Text>
                  </Pressable>
                ))}
              </View>

              {executives.length ? (
                <>
                  <Text className="text-foreground text-xs font-semibold mb-2">Assigned Executive</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View className="flex-row gap-2 pr-2">
                      <Pressable
                        onPress={() => set("assignedExecutiveId", null)}
                        className={`px-3.5 py-2.5 rounded-xl border active:opacity-80 ${!form.assignedExecutiveId ? "bg-primary border-primary" : "bg-background border-border"}`}
                      >
                        <Text className={`text-xs font-semibold ${!form.assignedExecutiveId ? "text-white" : "text-foreground"}`}>Unassigned</Text>
                      </Pressable>
                      {executives.map((executive) => (
                        <Pressable
                          key={executive.id}
                          onPress={() => set("assignedExecutiveId", executive.id)}
                          className={`px-3.5 py-2.5 rounded-xl border active:opacity-80 ${form.assignedExecutiveId === executive.id ? "bg-primary border-primary" : "bg-background border-border"}`}
                        >
                          <Text className={`text-xs font-semibold ${form.assignedExecutiveId === executive.id ? "text-white" : "text-foreground"}`}>{executive.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              ) : null}
            </FormSection>

            <FormSection title="Notes" description="Additional context for your team" icon={NotebookPen}>
              <Field label="Notes" value={form.notes ?? ""} onChangeText={(value) => set("notes", value)} placeholder="Quick summary" multiline />
            </FormSection>
          </KeyboardAwareScrollView>

          <View className="flex-row gap-3 px-5 py-4 border-t border-primary/10 bg-card sm:px-6">
            <Pressable
              onPress={onClose}
              disabled={saving}
              className="h-12 rounded-xl border border-border bg-background items-center justify-center px-5 min-w-[130px] active:opacity-80"
            >
              <Text className="text-foreground text-sm font-bold">Cancel</Text>
            </Pressable>
            <Pressable
              disabled={isSubmitDisabled}
              onPress={() => void onSave(form)}
              className="h-12 rounded-xl bg-primary items-center justify-center flex-1 active:opacity-85"
              style={{ opacity: isSubmitDisabled ? 0.55 : 1 }}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">{vendor ? "Save Changes" : "Add Vendor"}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
