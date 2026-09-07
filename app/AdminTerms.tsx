import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bold, FileText, Heading2, List, ListOrdered, RefreshCw, Save } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { LegalDocumentRenderer } from "@/components/legal/LegalDocumentRenderer";
import { DEFAULT_PRIVACY_CONTENT, DEFAULT_TERMS_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

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
  const editorRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const dirty = content.trim() !== savedContent.trim();

  const replaceSelection = (replacement: string, selectedStart = replacement.length, selectedEnd = selectedStart) => {
    const next = `${content.slice(0, selection.start)}${replacement}${content.slice(selection.end)}`;
    const start = selection.start + selectedStart;
    const end = selection.start + selectedEnd;
    setContent(next);
    setSelection({ start, end });
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setNativeProps({ selection: { start, end } });
    });
  };

  const formatLines = (kind: "heading" | "bullet" | "ordered") => {
    const lineStart = content.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
    const followingBreak = content.indexOf("\n", selection.end);
    const lineEnd = followingBreak === -1 ? content.length : followingBreak;
    const selected = content.slice(lineStart, lineEnd) || (kind === "heading" ? "Section heading" : "List item");
    const lines = selected.split("\n").map((line, index) => {
      const clean = line.replace(/^\s*(?:#{1,3}\s+|[-*+]\s+|\d+[.)]\s+)/, "");
      if (kind === "heading") return `## ${clean}`;
      if (kind === "ordered") return `${index + 1}. ${clean}`;
      return `* ${clean}`;
    });
    const replacement = lines.join("\n");
    const next = `${content.slice(0, lineStart)}${replacement}${content.slice(lineEnd)}`;
    setContent(next);
    const caret = lineStart + replacement.length;
    setSelection({ start: caret, end: caret });
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const boldSelection = () => {
    const selected = content.slice(selection.start, selection.end);
    const label = selected || "important text";
    replaceSelection(`**${label}**`, 2, 2 + label.length);
  };

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
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 72 }}>
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
                      <Text className="text-muted-foreground text-xs mt-1">Use the toolbar or Markdown shortcuts. The preview updates as you type.</Text>
                    </View>
                    <View className={dirty ? "px-2.5 py-1 rounded-full bg-amber-500/10" : "px-2.5 py-1 rounded-full bg-emerald-500/10"}>
                      <Text className={dirty ? "text-amber-700 text-caption font-bold" : "text-emerald-700 text-caption font-bold"}>{dirty ? "Unsaved" : "Saved"}</Text>
                    </View>
                  </View>
                  <View accessibilityRole="toolbar" className="flex-row flex-wrap gap-2 mb-3">
                    {[
                      { label: "Heading", icon: Heading2, action: () => formatLines("heading") },
                      { label: "Bullets", icon: List, action: () => formatLines("bullet") },
                      { label: "Numbered", icon: ListOrdered, action: () => formatLines("ordered") },
                      { label: "Bold", icon: Bold, action: boldSelection },
                    ].map(({ label, icon: Icon, action }) => (
                      <Pressable
                        key={label}
                        accessibilityRole="button"
                        accessibilityLabel={`Format as ${label.toLowerCase()}`}
                        onPress={action}
                        className="min-h-11 px-3 rounded-xl border border-border bg-background flex-row items-center justify-center gap-2 active:scale-[0.97]"
                      >
                        <Icon size={16} className="text-foreground" />
                        <Text className="text-foreground text-xs font-semibold">{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    ref={editorRef}
                    accessibilityLabel={`${title} content`}
                    value={content}
                    onChangeText={setContent}
                    onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                    multiline
                    textAlignVertical="top"
                    placeholder={`Enter the ${title}`}
                    placeholderTextColor="#787178"
                    className="min-h-[520px] rounded-xl bg-background border border-border px-4 py-4 text-foreground text-sm leading-6"
                  />
                  <Text className="text-muted-foreground text-caption mt-2">Shortcuts: <Text className="font-bold">## heading</Text> · <Text className="font-bold">* bullet</Text> · <Text className="font-bold">1. numbered</Text> · <Text className="font-bold">**bold**</Text></Text>
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
                  <LegalDocumentRenderer content={content} compact />
                </View>
              </View>
            </>
          )}
        </ResponsiveContainer>
      </KeyboardAwareScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
