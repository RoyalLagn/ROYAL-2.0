import React, { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Camera, Edit3, MessageCircle, Phone } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { StatusChip } from "@/components/admin/crm/ui/StatusChip";
import { StatusBottomSheet } from "@/components/admin/crm/vendor/StatusBottomSheet";
import { WorkspaceVendorEditor } from "@/components/workspace/WorkspaceVendorEditor";
import { useWorkspaceVendorDetail } from "@/hooks/crm/useWorkspaceVendorDetail";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { crmFollowupTypeLabels, type CrmFollowupType } from "@/types/crm/followup";

type Tab = "overview" | "notes" | "followups";
const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "notes", label: "Notes" },
  { key: "followups", label: "Follow-ups" },
];
const followupTypes = Object.keys(crmFollowupTypeLabels) as CrmFollowupType[];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function CrmWorkspaceVendorDetail() {
  const router = useRouter();
  const { token, vendorId } = useLocalSearchParams<{ token?: string; vendorId?: string }>();
  const {
    vendor, notes, followups, loading, saving, error, setError,
    changeStatus, updateVendor, addNote, addFollowup, completeFollowup, logActivity,
  } = useWorkspaceVendorDetail(token ?? null, vendorId ?? null);

  const [tab, setTab] = useState<Tab>("overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [followupType, setFollowupType] = useState<CrmFollowupType>("call");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNotes, setFollowupNotes] = useState("");

  if (loading && !vendor) {
    return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><AdminLoadingState label="Loading vendor…" /></SafeAreaView>;
  }
  if (error && !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <ResponsiveContainer className="pt-6"><AdminErrorState message={error} onRetry={() => setError(null)} /></ResponsiveContainer>
      </SafeAreaView>
    );
  }
  if (!vendor) return null;

  const callVendor = () => {
    if (!vendor.phone) { Alert.alert("Phone number not available."); return; }
    logActivity("call_started");
    void Linking.openURL(`tel:${vendor.phone}`);
  };
  const whatsAppVendor = () => {
    if (!vendor.phone) { Alert.alert("Phone number not available."); return; }
    logActivity("whatsapp_opened");
    void Linking.openURL(`https://wa.me/${normalizeWhatsAppPhone(vendor.phone)}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/CrmWorkspace", params: { token } }))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{vendor.business_name}</Text>
        </View>
        <Pressable accessibilityLabel="Edit vendor" className="min-w-11 min-h-11 items-center justify-center" onPress={() => setEditorOpen(true)}>
          <Edit3 size={19} className="text-primary" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between">
                <Pressable onPress={() => setStatusOpen(true)}><StatusChip status={vendor.status} /></Pressable>
              </View>
              <View className="flex-row gap-2 mt-4">
                <Pressable onPress={callVendor} className="flex-1 h-12 rounded-2xl items-center justify-center flex-row" style={{ backgroundColor: "#16A34A", opacity: vendor.phone ? 1 : 0.5 }}>
                  <Phone size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-2">Call</Text>
                </Pressable>
                <Pressable onPress={whatsAppVendor} className="flex-1 h-12 rounded-2xl items-center justify-center flex-row" style={{ backgroundColor: "#25D366", opacity: vendor.phone ? 1 : 0.5 }}>
                  <MessageCircle size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-2">WhatsApp</Text>
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert("Coming soon", "Photo upload arrives in a future update.")}
                  className="flex-1 h-12 rounded-2xl items-center justify-center flex-row border border-border"
                >
                  <Camera size={16} className="text-primary" />
                  <Text className="text-primary text-xs font-bold ml-2">Photo</Text>
                </Pressable>
              </View>
            </CRMCard>
          </ResponsiveSection>

          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => setError(null)} /></ResponsiveSection> : null}

          <ResponsiveSection>
            <View className="flex-row gap-2">
              {tabs.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setTab(item.key)}
                  className={`px-4 py-2 rounded-full border ${tab === item.key ? "bg-primary border-primary" : "border-border"}`}
                >
                  <Text className={`text-xs font-semibold ${tab === item.key ? "text-white" : "text-foreground"}`}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </ResponsiveSection>

          {tab === "overview" ? (
            <ResponsiveSection>
              <CRMCard className="p-4">
                {[
                  ["Owner", vendor.owner_name], ["Phone", vendor.phone], ["WhatsApp", vendor.whatsapp],
                  ["Area", vendor.area], ["Priority", vendor.priority], ["Notes", vendor.notes],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <View key={label} className="py-2.5 border-b border-border">
                    <Text className="text-muted-foreground text-xs">{label}</Text>
                    <Text className="text-foreground text-sm font-semibold mt-0.5">{value}</Text>
                  </View>
                ))}
              </CRMCard>
            </ResponsiveSection>
          ) : null}

          {tab === "notes" ? (
            <ResponsiveSection>
              <CRMCard className="p-3 mb-3">
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="Add a note about this vendor…"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  className="text-foreground text-sm min-h-16"
                />
                <Pressable
                  disabled={saving || !noteDraft.trim()}
                  onPress={() => void addNote(noteDraft).then(() => setNoteDraft(""))}
                  className="self-end mt-2 px-4 py-2 rounded-full bg-primary"
                  style={{ opacity: saving || !noteDraft.trim() ? 0.6 : 1 }}
                >
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-xs font-bold">Add Note</Text>}
                </Pressable>
              </CRMCard>
              {!notes.length ? (
                <AdminEmptyState title="No notes yet" message="Notes from calls and visits will appear here." />
              ) : (
                <View className="gap-2">
                  {notes.map((note) => (
                    <CRMCard key={note.id} className="p-3">
                      <Text className="text-foreground text-sm">{note.body}</Text>
                      <Text className="text-muted-foreground text-[10px] mt-1.5">{formatDateTime(note.created_at)}</Text>
                    </CRMCard>
                  ))}
                </View>
              )}
            </ResponsiveSection>
          ) : null}

          {tab === "followups" ? (
            <ResponsiveSection>
              <CRMCard className="p-3 mb-3">
                <Text className="text-foreground text-xs font-semibold mb-1.5">Schedule a follow-up</Text>
                <View className="flex-row gap-2 mb-2">
                  {followupTypes.map((type) => (
                    <Pressable
                      key={type}
                      onPress={() => setFollowupType(type)}
                      className={`px-3 py-1.5 rounded-full border ${followupType === type ? "bg-primary border-primary" : "border-border"}`}
                    >
                      <Text className={`text-[11px] font-semibold ${followupType === type ? "text-white" : "text-foreground"}`}>{crmFollowupTypeLabels[type]}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={followupDate}
                  onChangeText={setFollowupDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background mb-2"
                />
                <TextInput
                  value={followupNotes}
                  onChangeText={setFollowupNotes}
                  placeholder="What's this follow-up about?"
                  placeholderTextColor="#9CA3AF"
                  className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background"
                />
                <Pressable
                  disabled={saving || !followupDate.trim()}
                  onPress={() => void addFollowup({ type: followupType, scheduledDate: followupDate, notes: followupNotes }).then(() => { setFollowupDate(""); setFollowupNotes(""); })}
                  className="self-end mt-2 px-4 py-2 rounded-full bg-primary"
                  style={{ opacity: saving || !followupDate.trim() ? 0.6 : 1 }}
                >
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-xs font-bold">Schedule</Text>}
                </Pressable>
              </CRMCard>
              {!followups.length ? (
                <AdminEmptyState title="No follow-ups scheduled" message="Schedule the next call or visit above." />
              ) : (
                <View className="gap-2">
                  {followups.map((followup) => (
                    <CRMCard key={followup.id} className="p-3 flex-row items-center justify-between">
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold">{crmFollowupTypeLabels[followup.type]} · {followup.scheduled_date}{followup.scheduled_time ? ` · ${followup.scheduled_time}` : ""}</Text>
                        {followup.notes ? <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{followup.notes}</Text> : null}
                        <Text className={`text-[10px] font-bold mt-1 capitalize ${followup.status === "completed" ? "text-emerald-500" : followup.status === "cancelled" ? "text-muted-foreground" : "text-amber-500"}`}>{followup.status}</Text>
                      </View>
                      {followup.status === "pending" ? (
                        <Pressable onPress={() => void completeFollowup(followup.id)} className="px-3 py-2 rounded-full bg-emerald-500/10">
                          <Text className="text-emerald-500 text-[10px] font-bold">Mark done</Text>
                        </Pressable>
                      ) : null}
                    </CRMCard>
                  ))}
                </View>
              )}
            </ResponsiveSection>
          ) : null}
        </ResponsiveContainer>
      </ScrollView>

      <StatusBottomSheet
        visible={statusOpen}
        current={vendor.status}
        saving={statusSaving}
        onSelect={(status) => {
          setStatusSaving(true);
          void changeStatus(status).finally(() => { setStatusSaving(false); setStatusOpen(false); });
        }}
        onClose={() => setStatusOpen(false)}
      />

      <WorkspaceVendorEditor
        visible={editorOpen}
        isEdit
        initial={{
          businessName: vendor.business_name, categoryId: vendor.category_id, ownerName: vendor.owner_name,
          phone: vendor.phone, whatsapp: vendor.whatsapp, area: vendor.area, notes: vendor.notes,
          priority: vendor.priority,
        }}
        saving={saving}
        error={error}
        onSave={async (input) => { await updateVendor(input); setEditorOpen(false); }}
        onClose={() => setEditorOpen(false)}
      />
    </SafeAreaView>
  );
}
