import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, MessageCircle, Phone, Square } from "lucide-react-native";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { useMarketingWorkspaceVendorDetail } from "@/hooks/crm/useMarketingWorkspaceVendorDetail";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { notInterestedReasons } from "@/types/crm/marketingWorkspace";

const pipelineSteps = ["Contacted", "Meeting", "Interested", "Registered"];

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
  const [followupDate, setFollowupDate] = useState("");
  const [notes, setNotes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [callOutcome, setCallOutcome] = useState("");

  useEffect(() => {
    if (!vendor) return;
    setFollowupDate(vendor.next_followup_date ?? "");
    setNotes(vendor.notes ?? "");
    setRemarks(vendor.remarks ?? "");
    setCallOutcome(vendor.call_outcome ?? "");
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
  if (!vendor) return null;

  const currentStepIndex = vendor.registered ? 3 : vendor.interest_status === "interested" ? 2 : vendor.meeting_done ? 1 : vendor.contacted ? 0 : -1;

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

  const saveDetails = () => void updateProgress({
    nextFollowupDate: followupDate.trim() || null,
    notes: notes.trim() || null,
    remarks: remarks.trim() || null,
    callOutcome: callOutcome.trim() || null,
  });

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
                        {index <= currentStepIndex ? <Check size={12} color="#FFFFFF" /> : <Text className="text-[10px] text-muted-foreground font-bold">{index + 1}</Text>}
                      </View>
                      {index < pipelineSteps.length - 1 ? <View className={`flex-1 h-0.5 ${index < currentStepIndex ? "bg-primary" : "bg-border"}`} /> : null}
                    </View>
                    <Text className="text-[9px] mt-1 text-muted-foreground text-center">{step}</Text>
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
              <CheckboxRow label="Contacted" checked={vendor.contacted} onToggle={() => void updateProgress({ contacted: !vendor.contacted })} />
              <CheckboxRow label="Meeting Done" checked={vendor.meeting_done} onToggle={() => void updateProgress({ meetingDone: !vendor.meeting_done })} />

              <View className="py-3 border-b border-border">
                <Text className="text-foreground text-sm font-semibold mb-2">Interest</Text>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => void updateProgress({ interestStatus: "interested" })}
                    className={`flex-1 h-10 rounded-xl items-center justify-center border ${vendor.interest_status === "interested" ? "bg-emerald-500 border-emerald-500" : "border-border"}`}
                  >
                    <Text className={`text-xs font-bold ${vendor.interest_status === "interested" ? "text-white" : "text-foreground"}`}>Interested</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setNotInterestedOpen(true)}
                    className={`flex-1 h-10 rounded-xl items-center justify-center border ${vendor.interest_status === "not_interested" ? "border-red-500" : "border-border"}`}
                    style={vendor.interest_status === "not_interested" ? { backgroundColor: "#FEE2E2" } : undefined}
                  >
                    <Text className="text-xs font-bold" style={{ color: vendor.interest_status === "not_interested" ? "#DC3545" : undefined }}>Not Interested</Text>
                  </Pressable>
                </View>
                {vendor.interest_status === "not_interested" && vendor.not_interested_reason ? (
                  <Text className="text-muted-foreground text-xs mt-2">Reason: {vendor.not_interested_reason}</Text>
                ) : null}
                {notInterestedOpen ? (
                  <View className="flex-row flex-wrap gap-2 mt-3">
                    {notInterestedReasons.map((reason) => (
                      <Pressable
                        key={reason}
                        onPress={() => { void updateProgress({ interestStatus: "not_interested", notInterestedReason: reason }); setNotInterestedOpen(false); }}
                        className="px-3 py-2 rounded-full border border-border"
                      >
                        <Text className="text-foreground text-xs">{reason}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <CheckboxRow label="Registered" checked={vendor.registered} onToggle={() => void updateProgress({ registered: !vendor.registered })} />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Text className="text-foreground text-xs font-semibold mb-1.5">Next Follow-up Date</Text>
              <TextInput
                value={followupDate}
                onChangeText={setFollowupDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Call Outcome</Text>
              <TextInput
                value={callOutcome}
                onChangeText={setCallOutcome}
                placeholder="e.g. Spoke to owner, will follow up"
                placeholderTextColor="#9CA3AF"
                className="h-11 border border-border rounded-2xl px-3 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes about this vendor"
                placeholderTextColor="#9CA3AF"
                multiline
                className="min-h-16 border border-border rounded-2xl px-3 py-2 text-foreground bg-background mb-3"
              />
              <Text className="text-foreground text-xs font-semibold mb-1.5">Remarks</Text>
              <TextInput
                value={remarks}
                onChangeText={setRemarks}
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
    </SafeAreaView>
  );
}
