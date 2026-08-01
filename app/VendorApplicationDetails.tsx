import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import { supabase } from "@/services/supabase";
import { AdminVendorService } from "@/services/adminVendorService";

type Details = Record<string, any> & { categories?: { name: string } | null };
export default function VendorApplicationDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    if (!id) { setLoading(false); Alert.alert("Application not found", "The application ID is missing."); return; }
    const { data, error } = await supabase.from("vendor_applications").select("*,categories(name)").eq("id", id).single();
    if (error) Alert.alert("Unable to load application", error.message); else setItem(data);
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const review = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !reason.trim()) return Alert.alert("Reason required", "Enter a rejection reason.");
    setWorking(true);
    try {
      await AdminVendorService.reviewApplication(id, decision, decision === "rejected" ? reason : undefined);
      setRejectOpen(false);
      router.replace("/VendorApplications");
      Alert.alert(
        decision === "approved" ? "Vendor approved" : "Application rejected",
        decision === "approved"
          ? "The verified vendor is now available in the marketplace."
          : "The rejection reason was saved.",
      );
    } catch (cause) {
      Alert.alert(`${decision === "approved" ? "Approval" : "Rejection"} failed`, cause instanceof Error ? cause.message : "Please try again.");
    } finally { setWorking(false); }
  };
  if (loading) return <SafeAreaView className="flex-1 bg-background items-center justify-center"><ActivityIndicator color="#EC4899" /></SafeAreaView>;
  if (!item) return <SafeAreaView className="flex-1 bg-background items-center justify-center px-6"><Text className="text-foreground font-bold">Application not found</Text><TouchableOpacity className="min-h-11 mt-3 justify-center" onPress={() => router.replace("/VendorApplications")}><Text className="text-primary font-semibold">Back to approvals</Text></TouchableOpacity></SafeAreaView>;
  const rows = [
    ["Owner Name", item.full_name], ["Email", item.email], ["Phone", item.phone], ["Business Name", item.business_name],
    ["Category", item.categories?.name], ["Description", item.description], ["Experience", `${item.experience} years`],
    ["Address", item.address], ["City", item.city], ["State", item.state], ["Pincode", item.pincode], ["Country", item.country],
    ["Instagram", item.instagram], ["Facebook", item.facebook], ["Website", item.website], ["Submitted", new Date(item.submitted_at).toLocaleString()], ["Status", item.status],
  ];
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
    <View className="flex-row items-center px-5 py-4 border-b border-border"><TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/VendorApplications")} className="w-10 h-10 rounded-full bg-card border border-border items-center justify-center"><ArrowLeft size={20} className="text-foreground" /></TouchableOpacity><Text className="text-foreground text-xl font-bold ml-4">Application Details</Text></View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 130 }}><View className="items-center bg-card border border-border rounded-3xl p-5 mb-5"><Image source={{ uri: item.logo_url }} className="w-24 h-24 rounded-3xl bg-muted mb-3" /><Text className="text-foreground text-xl font-bold">{item.business_name}</Text><Text className="text-primary text-sm font-semibold mt-1">{item.status.toUpperCase()}</Text></View>
      <View className="bg-card border border-border rounded-3xl overflow-hidden">{rows.map(([label, value]) => value ? <View key={label} className="px-5 py-4 border-b border-border"><Text className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{label}</Text><Text className="text-foreground leading-5">{value}</Text></View> : null)}</View>
    </ScrollView>
    {item.status === "pending" ? <View className="absolute bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex-row gap-3"><TouchableOpacity className="flex-1 border border-destructive rounded-2xl py-4 items-center" onPress={() => setRejectOpen(true)} disabled={working}><Text className="text-destructive font-bold">Reject</Text></TouchableOpacity><TouchableOpacity className="flex-1 bg-primary rounded-2xl py-4 items-center" onPress={() => Alert.alert("Approve vendor?", "This creates or activates the vendor marketplace record.", [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => void review("approved") }])} disabled={working}>{working ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-bold">Approve</Text>}</TouchableOpacity></View> : null}
    <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}><View className="flex-1 bg-black/60 items-center justify-center px-6"><View className="bg-card border border-border rounded-3xl p-5 w-full max-w-lg"><View className="flex-row justify-between mb-4"><Text className="text-foreground text-lg font-bold">Reject Application</Text><TouchableOpacity onPress={() => setRejectOpen(false)}><X className="text-foreground" /></TouchableOpacity></View><TextInput className="bg-background border border-border rounded-2xl p-4 text-foreground min-h-28" multiline placeholder="Rejection reason" placeholderTextColor="#8A8589" value={reason} onChangeText={setReason} /><TouchableOpacity className="bg-destructive rounded-2xl py-4 items-center mt-4" onPress={() => review("rejected")} disabled={working}>{working ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-bold">Confirm Rejection</Text>}</TouchableOpacity></View></View></Modal>
  </SafeAreaView>;
}
