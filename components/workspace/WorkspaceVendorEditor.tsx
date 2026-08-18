import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { X } from "lucide-react-native";
import { CrmCategoryService } from "@/services/crm/categoryService";
import type { CrmVendorCategory } from "@/types/crm/category";
import type { CrmWorkspaceVendorInput } from "@/types/crm/workspace";
import type { CrmVendorPriority } from "@/types/crm/vendor";
import { sanitizePhoneInput, validatePhone } from "@/utils/authValidation";

type WorkspaceVendorEditorProps = {
  visible: boolean;
  initial?: Partial<CrmWorkspaceVendorInput>;
  isEdit: boolean;
  saving: boolean;
  error: string | null;
  onSave: (input: CrmWorkspaceVendorInput) => Promise<void>;
  onClose: () => void;
};

const priorities: CrmVendorPriority[] = ["low", "medium", "high"];

function Field({ label, value, onChangeText, placeholder, keyboardType, error, maxLength }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address" | "url"; error?: string; maxLength?: number;
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
        maxLength={maxLength}
        className={`h-12 border rounded-2xl px-4 text-foreground bg-background ${error ? "border-red-500" : "border-border"}`}
      />
      {error ? <Text accessibilityRole="alert" className="text-red-500 text-xs mt-1">{error}</Text> : null}
    </View>
  );
}

export function WorkspaceVendorEditor({ visible, initial, isEdit, saving, error, onSave, onClose }: WorkspaceVendorEditorProps) {
  const [categories, setCategories] = useState<CrmVendorCategory[]>([]);
  const [form, setForm] = useState<CrmWorkspaceVendorInput>({ businessName: "", categoryId: "", priority: "medium" });

  useEffect(() => {
    if (!visible) return;
    void CrmCategoryService.list().then((rows) => setCategories(rows.filter((row) => row.is_active))).catch(() => setCategories([]));
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setForm({ businessName: "", categoryId: "", priority: "medium", ...initial });
  }, [visible, initial]);

  const set = <K extends keyof CrmWorkspaceVendorInput>(key: K, value: CrmWorkspaceVendorInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const errors = useMemo(() => {
    const next: { phone?: string; whatsapp?: string } = {};
    if (form.phone?.trim() && !validatePhone(form.phone)) next.phone = "Enter a valid 10-digit mobile number.";
    if (form.whatsapp?.trim() && !validatePhone(form.whatsapp)) next.whatsapp = "Enter a valid 10-digit mobile number.";
    return next;
  }, [form.phone, form.whatsapp]);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <Pressable className="bg-card rounded-t-3xl p-5 max-h-[88%]" onPress={(event) => event.stopPropagation()}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-foreground text-lg font-bold">{isEdit ? "Edit Vendor" : "Add Vendor"}</Text>
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
                    disabled={isEdit}
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
            <Field label="Phone" value={form.phone ?? ""} onChangeText={(value) => set("phone", sanitizePhoneInput(value))} keyboardType="phone-pad" placeholder="10-digit mobile number" maxLength={20} error={errors.phone} />
            <Field label="WhatsApp" value={form.whatsapp ?? ""} onChangeText={(value) => set("whatsapp", sanitizePhoneInput(value))} keyboardType="phone-pad" placeholder="10-digit mobile number" maxLength={20} error={errors.whatsapp} />
            <Field label="Area" value={form.area ?? ""} onChangeText={(value) => set("area", value)} placeholder="Locality within the cluster" />
            <Field label="Notes" value={form.notes ?? ""} onChangeText={(value) => set("notes", value)} placeholder="Quick summary" />

            <Text className="text-foreground text-xs font-semibold mb-1.5">Priority</Text>
            <View className="flex-row gap-2 mb-4">
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

            <Pressable
              disabled={saving || !form.businessName.trim() || !form.categoryId || hasErrors}
              onPress={() => void onSave(form)}
              className="h-12 rounded-2xl bg-primary items-center justify-center mb-2"
              style={{ opacity: saving || !form.businessName.trim() || !form.categoryId || hasErrors ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-sm font-bold">{isEdit ? "Save Changes" : "Add Vendor"}</Text>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
