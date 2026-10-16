import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail, Phone, Save, Trash2 } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import { useSupportSettings } from "@/hooks/useSupportSettings";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import {
  updateSupportSettings,
  validateSupportSettings,
  type SupportSettings,
} from "@/services/supportSettings";

type FormState = {
  email: string;
  phone: string;
  showEmail: boolean;
  showPhone: boolean;
};

function formFromSettings(settings: SupportSettings): FormState {
  return {
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    showEmail: settings.showEmail,
    showPhone: settings.showPhone,
  };
}

function sameForm(left: FormState, right: FormState) {
  return left.email.trim() === right.email.trim()
    && left.phone.trim() === right.phone.trim()
    && left.showEmail === right.showEmail
    && left.showPhone === right.showPhone;
}

export default function AdminHelp() {
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 760;
  const { settings, loading, error: loadError } = useSupportSettings();
  const { showSuccess, showError } = useAppFeedback();
  const [form, setForm] = useState<FormState>(() => formFromSettings(settings));
  const [savedForm, setSavedForm] = useState<FormState>(() => formFromSettings(settings));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const hasUnsavedChanges = !sameForm(form, savedForm);
  const validationError = useMemo(() => validateSupportSettings(form), [form]);

  useEffect(() => {
    if (loading || hasUnsavedChanges) return;
    const next = formFromSettings(settings);
    setForm(next);
    setSavedForm(next);
  }, [hasUnsavedChanges, loading, settings]);

  useUnsavedChangesGuard(hasUnsavedChanges && !saving);

  const save = async () => {
    setSubmitted(true);
    if (validationError) return;
    setSaving(true);
    try {
      const updated = await updateSupportSettings(form);
      const next = formFromSettings(updated);
      setForm(next);
      setSavedForm(next);
      setSubmitted(false);
      showSuccess("Support contacts updated everywhere.");
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Support contacts could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const visibleSummary = form.showEmail && form.showPhone
    ? "Email and contact number"
    : form.showEmail
      ? "Email only"
      : form.showPhone
        ? "Contact number only"
        : "No contact selected";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <ResponsiveContainer>
          <AdminPageHeader
            title="Help & Support"
            subtitle="Control the support details shown to customers and vendors"
          />

          <View className="bg-card border border-border rounded-2xl overflow-hidden" style={styles.surface}>
            <View className="px-4 md:px-5 py-4 border-b border-border">
              <Text className="text-foreground text-base font-bold">Support contacts</Text>
              <Text className="text-muted-foreground text-xs leading-5 mt-1">
                Changes are shared with the public and vendor help pages.
              </Text>
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color="#0878E8" />
                <Text className="text-muted-foreground text-xs mt-3">Loading support settings…</Text>
              </View>
            ) : (
              <View className="p-4 md:p-5 gap-5">
                {loadError ? (
                  <View className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                    <Text className="text-red-700 text-xs leading-5">{loadError}</Text>
                  </View>
                ) : null}

                <View style={styles.contactGrid}>
                  <View style={{ width: useTwoColumns ? "48.5%" : "100%" }}>
                    <View style={styles.fieldHeading}>
                      <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                        <Mail size={17} className="text-primary" />
                      </View>
                      <View className="flex-1 min-w-0 ml-3">
                        <Text className="text-foreground text-sm font-semibold">Support email</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">Used for written support requests</Text>
                      </View>
                      <Switch
                        value={form.showEmail}
                        onValueChange={(showEmail) => setForm((current) => ({ ...current, showEmail }))}
                        trackColor={{ false: "#D8D2D5", true: "#F3A0BF" }}
                        thumbColor={form.showEmail ? "#062B63" : "#FFFFFF"}
                        accessibilityLabel="Show support email"
                      />
                    </View>
                    <TextInput
                      value={String(form.email ?? "")}
                      onChangeText={(email) => setForm((current) => ({ ...current, email }))}
                      placeholder="support@example.com"
                      placeholderTextColor="#94878D"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={254}
                      accessibilityLabel="Support email address"
                      className="h-12 mt-3 px-4 rounded-xl border border-border bg-background text-foreground text-base"
                    />
                    {form.email ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove support email"
                        onPress={() => setForm((current) => ({ ...current, email: "", showEmail: false }))}
                        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                      >
                        <Trash2 size={14} color="#B42318" />
                        <Text style={styles.removeText}>Remove email</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ width: useTwoColumns ? "48.5%" : "100%" }}>
                    <View style={styles.fieldHeading}>
                      <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                        <Phone size={17} className="text-primary" />
                      </View>
                      <View className="flex-1 min-w-0 ml-3">
                        <Text className="text-foreground text-sm font-semibold">Contact number</Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">Used for direct phone support</Text>
                      </View>
                      <Switch
                        value={form.showPhone}
                        onValueChange={(showPhone) => setForm((current) => ({ ...current, showPhone }))}
                        trackColor={{ false: "#D8D2D5", true: "#F3A0BF" }}
                        thumbColor={form.showPhone ? "#062B63" : "#FFFFFF"}
                        accessibilityLabel="Show support contact number"
                      />
                    </View>
                    <TextInput
                      value={String(form.phone ?? "")}
                      onChangeText={(phone) => setForm((current) => ({ ...current, phone }))}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#94878D"
                      keyboardType="phone-pad"
                      maxLength={40}
                      accessibilityLabel="Support contact number"
                      className="h-12 mt-3 px-4 rounded-xl border border-border bg-background text-foreground text-base"
                    />
                    {form.phone ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove support contact number"
                        onPress={() => setForm((current) => ({ ...current, phone: "", showPhone: false }))}
                        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                      >
                        <Trash2 size={14} color="#B42318" />
                        <Text style={styles.removeText}>Remove number</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View className="border-t border-border pt-4">
                  <Text className="text-muted-foreground text-xs">Visible on help pages</Text>
                  <Text className="text-foreground text-sm font-semibold mt-1">{visibleSummary}</Text>
                  {submitted && validationError ? (
                    <Text className="text-red-600 text-xs leading-5 mt-2" accessibilityRole="alert">
                      {validationError}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving || !hasUnsavedChanges }}
                    disabled={saving || !hasUnsavedChanges}
                    onPress={() => void save()}
                    style={({ pressed }) => [
                      styles.saveButton,
                      (saving || !hasUnsavedChanges) && styles.disabledButton,
                      pressed && !saving && styles.pressed,
                    ]}
                  >
                    {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Save size={17} color="#FFFFFF" />}
                    <Text style={styles.saveText}>{saving ? "Saving…" : "Save changes"}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 72 },
  surface: Platform.OS === "web"
    ? ({ boxShadow: "0 10px 28px rgba(74, 39, 55, 0.055)" } as never)
    : { elevation: 1 },
  loadingState: { minHeight: 220, alignItems: "center", justifyContent: "center" },
  contactGrid: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  fieldHeading: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  removeButton: { minHeight: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, marginTop: 5 },
  removeText: { color: "#B42318", fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", justifyContent: "flex-end" },
  saveButton: { minHeight: 44, minWidth: 156, paddingHorizontal: 20, borderRadius: 12, backgroundColor: "#062B63", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  disabledButton: { opacity: 0.48 },
  pressed: { opacity: 0.76 },
});
