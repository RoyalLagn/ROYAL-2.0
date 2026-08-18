import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FileText, RefreshCw, Save } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { DEFAULT_PRIVACY_CONTENT, DEFAULT_TERMS_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";

type AdminLegalDocumentProps = { documentType?: "terms" | "privacy" };

export default function AdminTerms({ documentType = "terms" }: AdminLegalDocumentProps) {
  const privacy = documentType === "privacy";
  const title = privacy ? "Privacy Policy" : "Terms & Conditions";
  const defaultContent = privacy ? DEFAULT_PRIVACY_CONTENT : DEFAULT_TERMS_CONTENT;
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [content, setContent] = useState(defaultContent);
  const [savedContent, setSavedContent] = useState(defaultContent);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = content.trim() !== savedContent.trim();
  const paragraphs = useMemo(() => content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean), [content]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const document = privacy ? await LegalDocumentsService.loadPrivacy() : await LegalDocumentsService.loadTerms();
      setContent(document.content);
      setSavedContent(document.content);
      setUpdatedAt(document.updatedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to load ${title}.`);
    } finally {
      setLoading(false);
    }
  }, [privacy, title]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!content.trim()) return setError(`${title} cannot be empty.`);
    setSaving(true);
    setError(null);
    try {
      const document = privacy ? await LegalDocumentsService.savePrivacy(content) : await LegalDocumentsService.saveTerms(content);
      setContent(document.content);
      setSavedContent(document.content);
      setUpdatedAt(document.updatedAt);
      Alert.alert(`${title} updated`, `Customer and vendor ${title} pages now use this content.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to save ${title}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer style={{ maxWidth: 1180, alignSelf: "center" }}>
          <AdminPageHeader
            title={title}
            subtitle={`Edit the ${title.toLowerCase()} shown to customers and vendors`}
            action={<Pressable accessibilityLabel={`Reload ${title}`} onPress={() => void load()} className="w-11 h-11 rounded-xl items-center justify-center active:opacity-70"><RefreshCw size={18} className="text-primary" /></Pressable>}
          />

          {loading ? <AdminLoadingState label={`Loading ${title}…`} /> : error && !savedContent ? <AdminErrorState message={error} onRetry={() => void load()} /> : (
            <>
              {error ? <View className="mb-4 min-h-12 px-4 py-3 rounded-xl bg-destructive/10"><Text accessibilityRole="alert" className="text-destructive text-xs font-semibold">{error}</Text></View> : null}
              <View className={desktop ? "flex-row items-start gap-4" : "gap-4"}>
                <View className="flex-1 min-w-0 bg-card border border-border rounded-2xl p-4">
                  <View className="flex-row items-start justify-between gap-3 mb-4">
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground font-bold">Document editor</Text>
                      <Text className="text-muted-foreground text-xs mt-1">Separate sections with a blank line. Sr. numbers are added automatically.</Text>
                    </View>
                    <View className={dirty ? "px-2.5 py-1 rounded-full bg-amber-500/10" : "px-2.5 py-1 rounded-full bg-emerald-500/10"}>
                      <Text className={dirty ? "text-amber-700 text-caption font-bold" : "text-emerald-700 text-caption font-bold"}>{dirty ? "Unsaved" : "Saved"}</Text>
                    </View>
                  </View>
                  <TextInput
                    accessibilityLabel={`${title} content`}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    textAlignVertical="top"
                    placeholder={`Enter the ${title}`}
                    placeholderTextColor="#787178"
                    className="min-h-[420px] rounded-xl bg-background border border-border px-4 py-4 text-foreground text-sm leading-6"
                  />
                  <View className="flex-row flex-wrap items-center gap-3 mt-4">
                    <Text className="text-muted-foreground text-caption flex-1 min-w-48">{updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : "Not published yet"}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save ${title}`}
                      accessibilityState={{ disabled: !dirty || saving }}
                      disabled={!dirty || saving}
                      onPress={() => void save()}
                      className={!dirty || saving ? "min-h-12 px-5 rounded-xl bg-primary/40 flex-row items-center justify-center gap-2" : "min-h-12 px-5 rounded-xl bg-primary flex-row items-center justify-center gap-2 active:opacity-85"}
                    >
                      <Save size={16} color="#FFFFFF" />
                      <Text className="text-white text-xs font-bold">{saving ? "Saving…" : "Save changes"}</Text>
                    </Pressable>
                  </View>
                </View>

                <View className={desktop ? "w-[380px] bg-card border border-border rounded-2xl p-5" : "bg-card border border-border rounded-2xl p-5"}>
                  <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mb-4"><FileText size={18} className="text-primary" /></View>
                  <Text className="text-foreground text-xl font-bold">{title}</Text>
                  <Text className="text-muted-foreground text-xs mt-1 mb-5">Shown on customer and vendor pages</Text>
                  {paragraphs.length ? paragraphs.map((paragraph, index) => (
                    <View key={`${index}-${paragraph.slice(0, 24)}`} className="flex-row items-start mb-4">
                      <View className="min-w-14 h-7 px-2 rounded-full bg-primary/10 items-center justify-center mr-3 mt-0.5">
                        <Text className="text-primary text-xs font-bold">Sr. {index + 1}</Text>
                      </View>
                      <Text className="text-foreground text-sm leading-6 flex-1">{paragraph}</Text>
                    </View>
                  )) : <Text className="text-muted-foreground text-sm">Your preview will appear here.</Text>}
                </View>
              </View>
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
