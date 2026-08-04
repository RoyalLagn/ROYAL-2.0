import React, { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Edit3, ExternalLink, FileText, MapPin, Phone } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { StatusChip } from "@/components/admin/crm/ui/StatusChip";
import { ProgressStepper } from "@/components/admin/crm/ui/ProgressStepper";
import { StatusBottomSheet } from "@/components/admin/crm/vendor/StatusBottomSheet";
import { VendorEditorModal } from "@/components/admin/crm/vendor/VendorEditorModal";
import { useCrmVendorProfile } from "@/hooks/crm/useCrmVendorProfile";
import { crmVendorStatusLabels } from "@/types/crm/vendor";
import { crmFollowupTypeLabels, type CrmFollowupType } from "@/types/crm/followup";

const followupTypes = Object.keys(crmFollowupTypeLabels) as CrmFollowupType[];

type Tab = "overview" | "activity" | "notes" | "followups" | "documents";
const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "notes", label: "Notes" },
  { key: "followups", label: "Follow-ups" },
  { key: "documents", label: "Documents" },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function InfoRow({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null;
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-border">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      {href ? (
        <Pressable onPress={() => void Linking.openURL(href)} className="flex-row items-center">
          <Text className="text-primary text-sm font-semibold mr-1" numberOfLines={1}>{value}</Text>
          <ExternalLink size={12} className="text-primary" />
        </Pressable>
      ) : (
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>{value}</Text>
      )}
    </View>
  );
}

export default function AdminCrmVendorProfile() {
  const router = useRouter();
  const { vendorId } = useLocalSearchParams<{ vendorId: string }>();
  const {
    vendor, notes, followups, activities, documents,
    loading, saving, error, setError,
    changeStatus, updateVendor, addNote, addFollowup, completeFollowup, refresh,
  } = useCrmVendorProfile(vendorId ?? null);

  const [tab, setTab] = useState<Tab>("overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [followupType, setFollowupType] = useState<CrmFollowupType>("call");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNotes, setFollowupNotes] = useState("");

  if (loading && !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <AdminLoadingState label="Loading vendor…" />
      </SafeAreaView>
    );
  }

  if (error && !vendor) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <ResponsiveContainer className="pt-6">
          <AdminErrorState message={error} onRetry={() => void refresh()} />
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (!vendor) return null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{vendor.business_name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{vendor.category_name} · {vendor.cluster_name}</Text>
        </View>
        <Pressable accessibilityLabel="Edit vendor" className="min-w-11 min-h-11 items-center justify-center" onPress={() => setEditorOpen(true)}>
          <Edit3 size={19} className="text-primary" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Pressable onPress={() => setStatusOpen(true)}>
                  <StatusChip status={vendor.status} />
                </Pressable>
                {vendor.phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${vendor.phone}`)}
                    className="flex-row items-center bg-primary/10 px-3 py-2 rounded-full"
                  >
                    <Phone size={14} className="text-primary" />
                    <Text className="text-primary text-xs font-bold ml-1.5">Call</Text>
                  </Pressable>
                ) : null}
              </View>
              <ProgressStepper status={vendor.status} />
            </CRMCard>
          </ResponsiveSection>

          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => setError(null)} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
            </ScrollView>
          </ResponsiveSection>

          {tab === "overview" ? (
            <ResponsiveSection>
              <CRMCard className="p-4">
                <InfoRow label="Owner" value={vendor.owner_name} />
                <InfoRow label="Phone" value={vendor.phone} href={vendor.phone ? `tel:${vendor.phone}` : undefined} />
                <InfoRow label="Alternate Phone" value={vendor.alternate_phone} href={vendor.alternate_phone ? `tel:${vendor.alternate_phone}` : undefined} />
                <InfoRow label="WhatsApp" value={vendor.whatsapp} href={vendor.whatsapp ? `https://wa.me/${vendor.whatsapp.replace(/\D/g, "")}` : undefined} />
                <InfoRow label="Email" value={vendor.email} href={vendor.email ? `mailto:${vendor.email}` : undefined} />
                <InfoRow label="Website" value={vendor.website} href={vendor.website ?? undefined} />
                <InfoRow label="Instagram" value={vendor.instagram} />
                <InfoRow label="Area" value={vendor.area} />
                <InfoRow label="Priority" value={vendor.priority} />
                <InfoRow label="Lead Source" value={vendor.lead_source} />
                <InfoRow label="Visited Date" value={vendor.visited_date} />
                <InfoRow label="Rating" value={vendor.rating ? `${vendor.rating} / 5` : null} />
                {vendor.google_maps_url ? (
                  <Pressable
                    onPress={() => void Linking.openURL(vendor.google_maps_url!)}
                    className="flex-row items-center mt-3 bg-primary/10 rounded-2xl px-4 py-3"
                  >
                    <MapPin size={16} className="text-primary" />
                    <Text className="text-primary text-sm font-semibold ml-2">Open in Google Maps</Text>
                  </Pressable>
                ) : null}
                {vendor.notes ? (
                  <View className="mt-3">
                    <Text className="text-muted-foreground text-xs font-semibold mb-1">Summary</Text>
                    <Text className="text-foreground text-sm">{vendor.notes}</Text>
                  </View>
                ) : null}
              </CRMCard>
            </ResponsiveSection>
          ) : null}

          {tab === "activity" ? (
            <ResponsiveSection>
              {!activities.length ? (
                <AdminEmptyState title="No activity yet" message="Status changes will be logged here automatically." />
              ) : (
                <View className="gap-2">
                  {activities.map((activity) => (
                    <CRMCard key={activity.id} className="p-3">
                      <Text className="text-foreground text-sm font-semibold capitalize">{activity.action.replace(/_/g, " ")}</Text>
                      {activity.from_status && activity.to_status ? (
                        <Text className="text-muted-foreground text-xs mt-1">
                          {crmVendorStatusLabels[activity.from_status]} → {crmVendorStatusLabels[activity.to_status]}
                        </Text>
                      ) : null}
                      {typeof activity.metadata?.note === "string" && activity.metadata.note ? (
                        <Text className="text-foreground text-xs mt-1">{activity.metadata.note}</Text>
                      ) : null}
                      <Text className="text-muted-foreground text-[10px] mt-1.5">{formatDateTime(activity.created_at)}</Text>
                    </CRMCard>
                  ))}
                </View>
              )}
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

          {tab === "documents" ? (
            <ResponsiveSection>
              {!documents.length ? (
                <AdminEmptyState title="No documents yet" message="Document upload arrives in a later phase — this tab already reads live data." />
              ) : (
                <View className="gap-2">
                  {documents.map((document) => (
                    <Pressable key={document.id} onPress={() => void Linking.openURL(document.file_url)}>
                      <CRMCard className="p-3 flex-row items-center">
                        <FileText size={16} className="text-primary" />
                        <Text className="text-foreground text-sm font-semibold ml-2 flex-1" numberOfLines={1}>{document.label}</Text>
                      </CRMCard>
                    </Pressable>
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

      <VendorEditorModal
        visible={editorOpen}
        clusterId={vendor.cluster_id}
        defaultCategoryId={vendor.category_id}
        vendor={vendor}
        saving={saving}
        error={error}
        onSave={async (input) => { await updateVendor(input); setEditorOpen(false); }}
        onClose={() => setEditorOpen(false)}
      />
    </SafeAreaView>
  );
}
