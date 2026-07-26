import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import type { AdminVendorRecord, VendorAction } from "@/types/adminVendors";

export type ManagementOperation = VendorAction | "approve" | "reject";

export function VendorActionDialog({
  visible,
  operation,
  records,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  operation: ManagementOperation | null;
  records: AdminVendorRecord[];
  onCancel: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  if (!operation) return null;
  const needsReason = operation === "reject" || operation === "suspend" || operation === "archive" || operation === "soft_delete";
  const submit = async () => {
    if (needsReason && !reason.trim()) return;
    setWorking(true);
    try {
      await onConfirm(reason.trim() || undefined);
      setReason("");
    } finally {
      setWorking(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/60 items-center justify-center px-5">
        <View className="bg-card border border-border rounded-3xl p-5 w-full max-w-lg">
          <Text className="text-foreground text-xl font-bold capitalize">{operation.replace("_", " ")} vendor{records.length === 1 ? "" : "s"}</Text>
          <Text className="text-muted-foreground text-sm mt-2">
            This action will affect {records.length} selected vendor{records.length === 1 ? "" : "s"}. The operation is recorded in the Admin activity log.
          </Text>
          {needsReason ? <TextInput className="bg-background border border-border rounded-2xl p-4 text-foreground min-h-24 mt-4" multiline placeholder="Reason required" placeholderTextColor="#8A8589" value={reason} onChangeText={setReason} /> : null}
          <View className="flex-row gap-3 mt-5">
            <Pressable className="flex-1 min-h-11 border border-border rounded-2xl items-center justify-center" onPress={onCancel} disabled={working}><Text className="text-foreground font-semibold">Cancel</Text></Pressable>
            <Pressable className={`flex-1 min-h-11 rounded-2xl items-center justify-center ${operation === "archive" || operation === "soft_delete" || operation === "reject" ? "bg-destructive" : "bg-primary"}`} onPress={() => void submit()} disabled={working || (needsReason && !reason.trim())}>
              {working ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-semibold">Confirm</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
