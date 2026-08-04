import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { X } from "lucide-react-native";
import { crmVendorStatusColors, crmVendorStatusLabels, type CrmVendorStatus } from "@/types/crm/vendor";

const allStatuses = Object.keys(crmVendorStatusLabels) as CrmVendorStatus[];

export function StatusBottomSheet({
  visible, current, saving, onSelect, onClose,
}: {
  visible: boolean;
  current: CrmVendorStatus | null;
  saving: boolean;
  onSelect: (status: CrmVendorStatus) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <Pressable className="bg-card rounded-t-3xl p-5 max-h-[75%]" onPress={(event) => event.stopPropagation()}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-foreground text-lg font-bold">Change Status</Text>
            <Pressable accessibilityLabel="Close" onPress={onClose}><X size={20} className="text-foreground" /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {allStatuses.map((status) => {
              const [background, foreground] = crmVendorStatusColors[status].split(" ");
              const active = status === current;
              return (
                <Pressable
                  key={status}
                  disabled={saving}
                  onPress={() => onSelect(status)}
                  className={`flex-row items-center justify-between min-h-14 px-4 rounded-2xl mb-2 ${active ? "border-2 border-primary" : "border border-border"}`}
                >
                  <View className={`px-2.5 py-1.5 rounded-full ${background}`}>
                    <Text className={`text-xs font-semibold ${foreground}`}>{crmVendorStatusLabels[status]}</Text>
                  </View>
                  {active && saving ? <ActivityIndicator size="small" color="#E91E63" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
