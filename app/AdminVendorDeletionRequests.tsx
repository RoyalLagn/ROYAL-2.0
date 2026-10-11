import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { CheckCircle2, Clock3, Phone, RefreshCw, ShieldAlert, X, XCircle } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { listVendorDeletionRequests, processVendorDeletion, type VendorDeletionRequest } from "@/services/vendorDeletionAdmin";

export default function AdminVendorDeletionRequests() {
  const params = useLocalSearchParams<{ requestId?: string }>();
  const requestedId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const [requests, setRequests] = useState<VendorDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<VendorDeletionRequest | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => { setLoading(true); setError(""); try { const next=await listVendorDeletionRequests(); setRequests(requestedId ? [...next.filter((item)=>item.id===requestedId),...next.filter((item)=>item.id!==requestedId)] : next); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load requests."); } finally { setLoading(false); } }, [requestedId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const open = (request: VendorDeletionRequest, action: "approve" | "reject") => { setSelected(request); setDecision(action); setReason(""); };
  const callVendor = async (phone: string) => {
    const dialablePhone = phone.replace(/[^\d+]/g, "");
    if (!dialablePhone) return Alert.alert("Phone number unavailable", "This request does not contain a valid vendor phone number.");
    try {
      await Linking.openURL(`tel:${dialablePhone}`);
    } catch {
      Alert.alert("Unable to open dialler", `Please call the vendor manually on ${phone}.`);
    }
  };
  const submit = async () => {
    if (!selected || reason.trim().length < 5) return Alert.alert("Reason required", "Enter at least 5 characters for the audit record.");
    setBusy(true);
    try { await processVendorDeletion(selected.id, decision, reason.trim()); setSelected(null); await refresh(); Alert.alert(decision === "approve" ? "Vendor deleted" : "Request rejected", decision === "approve" ? "The vendor workspace and login account were permanently deleted." : "The vendor deletion request was rejected."); }
    catch (caught) { Alert.alert("Request not processed", caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <SafeAreaView className="flex-1 bg-background" edges={["top","left","right"]}><ScrollView contentContainerStyle={{paddingBottom:72}}><ResponsiveContainer><AdminPageHeader title="Vendor deletion requests" subtitle="Approve only after reviewing the verified vendor details" action={<Pressable accessibilityLabel="Refresh requests" onPress={refresh} className="w-10 h-10 rounded-xl border border-border items-center justify-center"><RefreshCw size={18} className="text-primary" /></Pressable>} />
    <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex-row"><ShieldAlert size={20} color="#B45309" /><Text className="text-amber-900 text-xs leading-5 flex-1 ml-3">Approval permanently removes the vendor workspace, public profile, portfolio, albums and vendor login. The action cannot be undone.</Text></View>
    {loading ? <ActivityIndicator className="my-12" /> : error ? <Text className="text-destructive text-sm my-5">{error}</Text> : requests.length === 0 ? <View className="border border-border bg-card rounded-2xl p-8 items-center"><CheckCircle2 size={28} className="text-primary" /><Text className="text-foreground font-bold mt-3">No deletion requests</Text></View> : requests.map((request) => { const pending=["pending","verified"].includes(request.status); const retry=request.status === "processing" && !!request.processing_error; return <View key={request.id} className="bg-card border border-border rounded-2xl p-4 mb-3"><View className="flex-row items-start"><View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center"><Clock3 size={18} className="text-primary" /></View><View className="flex-1 ml-3"><View className="flex-row items-center justify-between"><Text className="text-foreground font-bold flex-1">{request.vendor_snapshot?.business_name || request.full_name || "Vendor"}</Text><Text className="text-primary text-xs font-bold uppercase">{request.status}</Text></View><Text className="text-muted-foreground text-xs mt-1">{request.request_reference}</Text></View></View><View className="border-t border-border mt-4 pt-3"><Text className="text-muted-foreground text-xs">Registered email</Text><Text selectable className="text-foreground text-sm mt-1">{request.email}</Text><Text className="text-muted-foreground text-xs mt-3">Vendor phone</Text>{request.phone ? <View className="flex-row items-center mt-1 gap-3"><Text selectable className="text-foreground text-sm flex-1">{request.phone}</Text><Pressable accessibilityRole="link" accessibilityLabel={`Call vendor on ${request.phone}`} onPress={()=>void callVendor(request.phone!)} className="min-h-11 px-4 rounded-xl bg-primary/10 flex-row items-center justify-center"><Phone size={16} className="text-primary" /><Text className="text-primary font-bold text-sm ml-2">Call vendor</Text></Pressable></View> : <Text className="text-muted-foreground text-sm mt-1">Not provided</Text>}<Text className="text-muted-foreground text-xs mt-3">Vendor reason</Text><Text className="text-foreground text-sm leading-5 mt-1">{request.reason || "No reason provided"}</Text><Text className="text-muted-foreground text-xs mt-3">Requested {new Date(request.requested_at).toLocaleString()}</Text>{request.processing_error ? <Text className="text-destructive text-xs mt-3">Last error: {request.processing_error}</Text> : null}</View>{(pending || retry) && <View className="flex-row gap-2 mt-4">{pending && <Pressable onPress={()=>open(request,"reject")} className="flex-1 min-h-11 border border-border rounded-xl items-center justify-center flex-row"><XCircle size={16} className="text-muted-foreground" /><Text className="text-foreground font-bold text-sm ml-2">Reject</Text></Pressable>}<Pressable onPress={()=>open(request,"approve")} className="flex-1 min-h-11 bg-destructive rounded-xl items-center justify-center flex-row"><CheckCircle2 size={16} color="#FFF" /><Text className="text-white font-bold text-sm ml-2">{retry ? "Retry deletion" : "Approve delete"}</Text></Pressable></View>}</View>; })}
  </ResponsiveContainer></ScrollView><AdminFooter activeTab="profile" />
  <Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>!busy&&setSelected(null)}><View className="flex-1 bg-black/50 items-center justify-center p-5"><View className="bg-card rounded-3xl border border-border w-full max-w-lg p-5"><View className="flex-row items-center justify-between"><Text className="text-foreground text-xl font-bold">{decision === "approve" ? "Approve permanent deletion" : "Reject deletion request"}</Text><Pressable disabled={busy} onPress={()=>setSelected(null)} className="w-9 h-9 items-center justify-center"><X size={20} className="text-foreground" /></Pressable></View><Text className="text-muted-foreground text-sm leading-5 mt-2">{selected?.vendor_snapshot?.business_name} · {selected?.email}</Text><Text className="text-foreground text-sm font-bold mt-5">Admin decision reason</Text><TextInput value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="Required for the audit trail" placeholderTextColor="#9CA3AF" className="border border-border bg-background text-foreground rounded-2xl min-h-28 p-3 mt-2" textAlignVertical="top" /><Pressable disabled={busy} onPress={submit} className={decision === "approve" ? "min-h-12 bg-destructive rounded-xl items-center justify-center mt-4" : "min-h-12 bg-primary rounded-xl items-center justify-center mt-4"}>{busy ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-bold">{decision === "approve" ? "Permanently delete vendor" : "Reject request"}</Text>}</Pressable></View></View></Modal>
  </SafeAreaView>;
}
