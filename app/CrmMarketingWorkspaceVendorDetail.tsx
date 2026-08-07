import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, MessageCircle, Phone, Square } from "lucide-react-native";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import SuccessToast, { type SuccessToastHandle } from "@/components/animated/SuccessToast";
import { useMarketingWorkspaceVendorDetail } from "@/hooks/crm/useMarketingWorkspaceVendorDetail";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { notInterestedReasons, type MarketingInterestStatus } from "@/types/crm/marketingWorkspace";

const pipelineSteps = ["Contacted", "Meeting", "Interested", "Registered"];

// Every editable field on this screen, held as one local draft so a single
// Save button can submit the full pipeline state in one atomic RPC call.
type ProgressDraft = {
  contacted: boolean;
  meetingDone: boolean;
  interestStatus: MarketingInterestStatus;
  notInterestedReason: string;
  registered: boolean;
  followupDate: string;
  notes: string;
  remarks: string;
  callOutcome: string;
};

function CheckboxRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center py-3 border-b border-border">
      {checked ? <Check size={18} className="text-primary" /> : <Square size={18} className="text-muted-foreground" />}
      <Text className="text-foreground text-sm font-semibold ml-3">{label}</Text>
    </Pressable>
  );
}

export default function CrmMarketingWorkspaceVendorDetail() {
  const router = useRouter();
  const { token, vendorId } = useLocalSearchParams<{ token?: string; vendorId?: string }>();
  const { vendor, loading, saving, error, setError, updateProgress, logActivity } = useMarketingWorkspaceVendorDetail(token ?? null, vendorId ?? null);

  const [notInterestedOpen, setNotInterestedOpen] = useState(false);
  const [draft, setDraft] = useState<ProgressDraft | null>(null);
  // Which vendor id the draft was last seeded from. Reseed only when we
  // actually navigate to a different vendor — never on a post-Save reload of
  // the *same* vendor. Re-seeding on every `vendor` reference change was the
  // root cause of "Save does nothing": previously every checkbox/interest
  // toggle fired its own immediate save + reload, and that reload silently
  // overwrote whatever the team member had just typed into Notes/Remarks/
  // Call Outcome/Follow-up Date before they got a chance to press Save.
  // Consolidating everything into one draft, submitted once, removes that
  // failure mode entirely rather than papering over it.
  const seededVendorIdRef = useRef<string | null>(null);
  const toastRef = useRef<SuccessToastHandle>(null);

  useEffect(() => {
    if (!vendor || seededVendorIdRef.current === vendor.vendor_id) return;
    seededVendorIdRef.current = vendor.vendor_id;
    setDraft({
      contacted: vendor.contacted,
      meetingDone: vendor.meeting_done,
      interestStatus: vendor.interest_status,
      notInterestedReason: vendor.not_interested_reason ?? "",
      registered: vendor.registered,
      followupDate: vendor.next_followup_date ?? "",
      notes: vendor.notes ?? "",
      remarks: vendor.remarks ?? "",
      callOutcome: vendor.call_outcome ?? "",
    });
  }, [vendor]);

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
  if (!vendor || !draft) return null;

  const currentStepIndex = draft.registered ? 3 : draft.interestStatus === "interested" ? 2 : draft.meetingDone ? 1 : draft.contacted ? 0 : -1;

  const callVendor = () => {
    if (!vendor.phone) { Alert.alert("Phone number not available."); return; }
    logActivity("call_started");
    void Linking.openURL(`tel:${vendor.phone}`);
  };
  const whatsAppVendor = () => {
    const phone = vendor.whatsapp || vendor.phone;
    if (!phone) { Alert.alert("Phone number not available."); return; }
    logActivity("whatsapp_opened");
    void Linking.openURL(`https://wa.me/${normalizeWhatsAppPhone(phone)}`);
  };

  const patchDraft = (patch: Partial<ProgressDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  // Single Save button → one RPC call → one Postgres transaction. Every
  // editable field is sent together so the whole edit either fully persists
  // (assignment row + crm_vendors status sync + activity log, all inside
  // marketing_workspace_update_vendor_progress) or fully rolls back — never
  // a partially-saved vendor.
  const saveDetails = () => {
    if (!draft || saving) return;
    void updateProgress({
      contacted: draft.contacted,
      meetingDone: draft.meetingDone,
      interestStatus: draft.interestStatus,
      notInterestedReason: draft.interestStatus === "not_interested" ? draft.notInterestedReason.trim() : null,
      registered: draft.registered,
      nextFollowupDate: draft.followupDate.trim(),
      notes: draft.notes.trim(),
      remarks: draft.remarks.trim(),
      callOutcome: draft.callOutcome.trim(),
    }).then(() => {
      toastRef.current?.show("Progress saved");
    }).catch((reason) => {
      toastRef.current?.showError(reason instanceof Error ? reason.message : "Unable to save. Please try again.");
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/CrmMarketingWorkspace", params: { token } }))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{vendor.business_name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{vendor.category_name ?? "Uncategorized"}</Text>
        </View>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center">
                {pipelineSteps.map((step, index) => (
                  <View key={step} className={index === pipelineSteps.length - 1 ? "items-center" : "items-center flex-1"}>
                    <View className="flex-row items-center w-full">
                      <View className={`w-6 h-6 rounded-full items-center justify-center ${index <= currentStepIndex ? "bg-primary" : "bg-muted"}`}>
                        {index <= currentStepIndex ? <Check size={12} color="#FFFFFF" /> : <Text className="text-metadata text-muted-foreground font-bold">{index + 1}</Text>}
                      </View>
                      {index < pipelineSteps.length - 1 ? <View className={`flex-1 h-0.5 ${index < currentStepIndex ? "bg-primary" : "bg-border"}`} /> : null}
                    </View>
                    <Text className="text-caption mt-1 text-muted-foreground text-center">{step}</Text>
                  </View>
                ))}
              </View>

              <View className="flex-row gap-2 mt-4">
                <Pressable onPress={callVendor} className="flex-1 h-11 rounded-2xl items-center justify-center flex-row" style={{ backgroundColor: "#16A34A", opacity: vendor.phone ? 1 : 0.5 }}>
                  <Phone size={15} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-2">Call</Text>
                </Pressable>
                <Pressable onPress={whatsAppVendor} className="flex-1 h-11 rounded-2xl items-center justify-center flex-row" style={{ backgroundColor: "#25D366", opacity: (vendor.whatsapp || vendor.phone) ? 1 : 0.5 }}>
                  <MessageCircle size={15} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-2">WhatsApp</Text>
                </Pressable>
              </View>
            </CRMCard>
          </ResponsiveSection>

          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => setError(null)} /></ResponsiveSection> : null}

          <ResponsiveSection>
            <CRMCard className="p-4">
              <CheckboxRow label="Contacted" checked={draft.contacted} onToggle={() => patchDraft({ contacted: !draft.contacted })} />
              <CheckboxRow label="Meeting Done" checked={draft.meetingDone} onToggle={() => patchDraft({ meetingDone: !draft.meetingDone })} />

              <View className="py-3 border-b border-border">
                <Text className="text-foreground text-sm font-semibold mb-2">Interest</Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => patchDraft({ interestStatus: "interested", notInterestedReason: "" })}
                    className={`flex-1 h-10 rounded-xl items-center justify-center border ${draft.interestStatus === "interested" ? "bg-emerald-500 border-emerald-500" : "border-border"}`}
                  >
                    <Text className={`text-xs font-bold ${draft.interestStatus === "interested" ? "text-white" : "text-foreground"}`}>Interested</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setNotInterestedOpen(true)}
                    className={`flex-1 h-10 rounded-xl items-center justify-center border ${draft.interestStatus === "not_interested" ? "border-red-500" : "border-border"}`}
                    style={draft.interestStatus === "not_interested" ? { backgroundColor: "#FEE2E2" } : undefined}
                  >
                    <Text className="text-xs font-bold" style={{ color: draft.interestStatus === "not_interested" ? "#DC3545" : undefined }}>Not Interested</Text>
                  </Pressable>
                </View>
                {draft.interestStatus === "not_interested" && draft.notInterestedReason ? (
                  <Text className="text-muted-foreground text-xs mt-2">Reason: {draft.notInterestedReason}</Text>
                ) : null}
                {notInterestedOpen ? (
                  <View className="flex-row flex-wrap gap-2 mt-3">
                    {notInterestedReasons.map((reason) => (
                      <Pressable
                        key={reason}
                        onPress={() => { patchDraft({ interestStatus: "not_interested", notInterestedReason: reason }); setNotInterestedOpen(false); }}
                        className="px-3 py-2 rounded-full border border-border"
                      >
                        <Text className="text-foreground text-xs">{reason}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <CheckboxRow label="Registered" checked={draft.registered} onToggle={() => patchDraft({ registered: !draft.registered })} />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Text className="text-foreground text-xs font-semibold mb-1.5">Next Follow-up Date</Text>
              <TextInput
                value={draft.followupDate}
                onChangeText={(text) => patchDraft({ followupDate: text })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Call Outcome</Text>
              <TextInput
                value={draft.callOutcome}
                onChangeText={(text) => patchDraft({ callOutcome: text })}
                placeholder="e.g. Spoke to owner, will follow up"
                placeholderTextColor="#9CA3AF"
                className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Notes</Text>
              <TextInput
                value={draft.notes}
                onChangeText={(text) => patchDraft({ notes: text })}
                placeholder="Notes about this vendor"
                placeholderTextColor="#9CA3AF"
                multiline
                className="min-h-16 border border-border rounded-2xl px-3 py-2 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Remarks</Text>
              <TextInput
                value={draft.remarks}
                onChangeText={(text) => patchDraft({ remarks: text })}
                placeholder="Any remarks"
                placeholderTextColor="#9CA3AF"
                className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background"
              />
              <Pressable
                disabled={saving}
                onPress={saveDetails}
                className="h-11 rounded-2xl bg-primary items-center justify-center mt-4"
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-white text-xs font-bold">Save</Text>}
              </Pressable>
            </CRMCard>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <SuccessToast ref={toastRef} />
    </SafeAreaView>
  );
}
