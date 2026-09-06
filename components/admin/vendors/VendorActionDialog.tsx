import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import {
  Archive, BadgeCheck, BadgeX, PauseCircle, PlayCircle,
  RotateCcw, Trash2, UserCheck, UserX, type LucideIcon,
} from "lucide-react-native";
import type { AdminVendorRecord, VendorAction } from "@/types/adminVendors";
import { adminPalette } from "@/theme";

export type ManagementOperation = VendorAction | "approve" | "reject";

type Tone = "success" | "destructive" | "primary";

const copy: Record<ManagementOperation, { title: string; description: (count: number) => string; confirmLabel: string; tone: Tone; icon: LucideIcon }> = {
  approve: {
    title: "Approve",
    description: (count) => `The vendor profile will go live in the marketplace immediately and ${count === 1 ? "the vendor" : "these vendors"} will be notified of approval.`,
    confirmLabel: "Approve",
    tone: "success",
    icon: UserCheck,
  },
  reject: {
    title: "Reject application",
    description: () => "The vendor will be notified their application was not approved. Add a reason so they understand why and can reapply.",
    confirmLabel: "Reject application",
    tone: "destructive",
    icon: UserX,
  },
  suspend: {
    title: "Suspend",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will be hidden from the marketplace immediately until reactivated. Explain why for the record.`,
    confirmLabel: "Suspend",
    tone: "destructive",
    icon: PauseCircle,
  },
  activate: {
    title: "Activate",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will become visible in the marketplace again.`,
    confirmLabel: "Activate",
    tone: "success",
    icon: PlayCircle,
  },
  verify: {
    title: "Mark verified",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will display a verified badge to customers.`,
    confirmLabel: "Mark verified",
    tone: "success",
    icon: BadgeCheck,
  },
  unverify: {
    title: "Remove verification",
    description: (count) => `The verified badge will be removed from ${count === 1 ? "this vendor" : "these vendors"}.`,
    confirmLabel: "Remove verification",
    tone: "primary",
    icon: BadgeX,
  },
  archive: {
    title: "Archive",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will be removed from active listings but kept on record. This can be undone from Restore.`,
    confirmLabel: "Archive",
    tone: "destructive",
    icon: Archive,
  },
  restore: {
    title: "Restore",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will be restored to active status.`,
    confirmLabel: "Restore",
    tone: "success",
    icon: RotateCcw,
  },
  soft_delete: {
    title: "Delete",
    description: (count) => `${count === 1 ? "This vendor" : "These vendors"} will be deleted from active listings. Explain why for the record; this can be reversed from Restore.`,
    confirmLabel: "Delete",
    tone: "destructive",
    icon: Trash2,
  },
};

const toneStyles: Record<Tone, { bg: string; icon: string }> = {
  success: { bg: "bg-emerald-600", icon: "#059669" },
  destructive: { bg: "bg-destructive", icon: "#DC2626" },
  primary: { bg: "bg-primary", icon: adminPalette.brand },
};

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
  const meta = copy[operation];
  const tone = toneStyles[meta.tone];
  const Icon = meta.icon;
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
          <View className="flex-row items-center gap-3">
            <View className={`w-11 h-11 rounded-2xl items-center justify-center ${meta.tone === "destructive" ? "bg-destructive/10" : meta.tone === "success" ? "bg-emerald-600/10" : "bg-primary/10"}`}>
              <Icon size={20} color={tone.icon} />
            </View>
            <Text className="text-foreground text-xl font-bold flex-1" numberOfLines={2}>
              {meta.title} {records.length === 1 ? records[0]?.business_name ?? "vendor" : `${records.length} vendors`}
            </Text>
          </View>
          <Text className="text-muted-foreground text-sm mt-3 leading-5">
            {meta.description(records.length)}
          </Text>
          {needsReason ? (
            <TextInput
              accessibilityLabel="Reason"
              className="bg-background border border-border rounded-2xl p-4 text-foreground min-h-24 mt-4"
              multiline
              placeholder="Reason (shown to the vendor and saved to the activity log)"
              placeholderTextColor="#8A8589"
              value={reason}
              onChangeText={setReason}
            />
          ) : null}
          <View className="flex-row gap-3 mt-5">
            <Pressable
              className="flex-1 min-h-11 border border-border rounded-2xl items-center justify-center"
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
              onPress={onCancel}
              disabled={working}
            >
              <Text className="text-foreground font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={meta.confirmLabel}
              accessibilityState={{ disabled: working || (needsReason && !reason.trim()), busy: working }}
              className={`flex-1 min-h-11 rounded-2xl items-center justify-center ${tone.bg}`}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: working || (needsReason && !reason.trim()) ? 0.6 : 1 })}
              onPress={() => void submit()}
              disabled={working || (needsReason && !reason.trim())}
            >
              {working ? <ActivityIndicator color="#FFF" /> : <Text className="text-white font-semibold">{meta.confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
