import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import { CrmCategoryService } from "@/services/crm/categoryService";
import { CrmExecutiveService } from "@/services/crm/executiveService";
import type { CrmVendorCategory } from "@/types/crm/category";
import type { CrmSalesExecutive } from "@/types/crm/executive";
import type { CrmVendorInput, CrmVendorListItem, CrmVendorPriority } from "@/types/crm/vendor";

type VendorEditorModalProps = {
  visible: boolean;
  clusterId: string;
  defaultCategoryId: string | null;
  vendor: CrmVendorListItem | null;
  saving: boolean;
  error: string | null;
  onSave: (input: CrmVendorInput) => Promise<void>;
  onClose: () => void;
};

const priorities: CrmVendorPriority[] = ["low", "medium", "high"];

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "url";
}) {
  return (
    <View className="mb-3">
      <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        className="h-12 border border-border rounded-2xl px-4 text-foreground bg-background"
      />
    </View>
  );
}

export function VendorEditorModal({
  visible, clusterId, defaultCategoryId, vendor, saving, error, onSave, onClose,
}: VendorEditorModalProps) {
  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [executives, setExecutives] = useState<CrmSalesExecutive[]>([]);
  const [form, setForm] = useState<CrmVendorInput>({
    clusterId, categoryId: defaultCategoryId ?? "", businessName: "", priority: "medium",
  });

  useEffect(() => {
    if (!visible) return;
    void CrmCategoryService.list().then(setCategories).catch(() => setCategories([]));
    void CrmExecutiveService.list().then(setExecutives).catch(() => setExecutives([]));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <Pressable className="bg-card rounded-t-3xl p-5 max-h-[88%]" onPress={(event) => event.stopPropagation()}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-foreground text-lg font-bold">{vendor ? "Edit Vendor" : "Add Vendor"}</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose}><X size={20} className="text-foreground" /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {error ? <Text className="text-red-500 text-xs mb-3">{error}</Text> : null}

            <Text className="text-foreground text-xs font-semibold mb-1.5">Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row gap-2">
                {categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => set("categoryId", category.id)}
                    className={`px-3 py-2 rounded-full border ${form.categoryId === category.id ? "bg-primary border-primary" : "border-border"}`}
                  >
                    <Text className={`text-xs font-semibold ${form.categoryId === category.id ? "text-white" : "text-foreground"}`}>{category.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Field label="Business Name *" value={form.businessName} onChangeText={(value) => set("businessName", value)} placeholder="e.g. Royal Wedding Hall" />
            <Field label="Owner Name" value={form.ownerName ?? ""} onChangeText={(value) => set("ownerName", value)} />
            <Field label="Phone" value={form.phone ?? ""} onChangeText={(value) => set("phone", value)} keyboardType="phone-pad" />
            <Field label="Alternate Phone" value={form.alternatePhone ?? ""} onChangeText={(value) => set("alternatePhone", value)} keyboardType="phone-pad" />
            <Field label="WhatsApp" value={form.whatsapp ?? ""} onChangeText={(value) => set("whatsapp", value)} keyboardType="phone-pad" />
            <Field label="Email" value={form.email ?? ""} onChangeText={(value) => set("email", value)} keyboardType="email-address" />
            <Field label="Website" value={form.website ?? ""} onChangeText={(value) => set("website", value)} keyboardType="url" />
            <Field label="Instagram" value={form.instagram ?? ""} onChangeText={(value) => set("instagram", value)} />
            <Field label="Google Maps URL" value={form.googleMapsUrl ?? ""} onChangeText={(value) => set("googleMapsUrl", value)} keyboardType="url" />
            <Field label="Area" value={form.area ?? ""} onChangeText={(value) => set("area", value)} placeholder="Locality within the cluster" />
            <Field label="Lead Source" value={form.leadSource ?? ""} onChangeText={(value) => set("leadSource", value)} placeholder="e.g. Referral, Cold visit" />
            <Field label="Visited Date" value={form.visitedDate ?? ""} onChangeText={(value) => set("visitedDate", value)} placeholder="YYYY-MM-DD" />
            <Field label="Notes" value={form.notes ?? ""} onChangeText={(value) => set("notes", value)} placeholder="Quick summary" />

            <Text className="text-foreground text-xs font-semibold mb-1.5">Priority</Text>
            <View className="flex-row gap-2 mb-3">
              {priorities.map((priority) => (
                <Pressable
                  key={priority}
                  onPress={() => set("priority", priority)}
                  className={`px-3 py-2 rounded-full border capitalize ${form.priority === priority ? "bg-primary border-primary" : "border-border"}`}
                >
                  <Text className={`text-xs font-semibold capitalize ${form.priority === priority ? "text-white" : "text-foreground"}`}>{priority}</Text>
                </Pressable>
              ))}
            </View>

            {executives.length ? (
              <>
                <Text className="text-foreground text-xs font-semibold mb-1.5">Assigned Executive</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => set("assignedExecutiveId", null)}
                      className={`px-3 py-2 rounded-full border ${!form.assignedExecutiveId ? "bg-primary border-primary" : "border-border"}`}
                    >
                      <Text className={`text-xs font-semibold ${!form.assignedExecutiveId ? "text-white" : "text-foreground"}`}>Unassigned</Text>
                    </Pressable>
                    {executives.map((executive) => (
                      <Pressable
                        key={executive.id}
                        onPress={() => set("assignedExecutiveId", executive.id)}
                        className={`px-3 py-2 rounded-full border ${form.assignedExecutiveId === executive.id ? "bg-primary border-primary" : "border-border"}`}
                      >
                        <Text className={`text-xs font-semibold ${form.assignedExecutiveId === executive.id ? "text-white" : "text-foreground"}`}>{executive.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </>
            ) : null}

            <Pressable
              disabled={saving || !form.businessName.trim() || !form.categoryId}
              onPress={() => void onSave(form)}
              className="h-12 rounded-2xl bg-primary items-center justify-center mb-2"
              style={{ opacity: saving || !form.businessName.trim() || !form.categoryId ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">{vendor ? "Save Changes" : "Add Vendor"}</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
