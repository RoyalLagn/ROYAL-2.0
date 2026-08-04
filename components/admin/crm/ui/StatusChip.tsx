import React from "react";
import { Text, View } from "react-native";
import { crmVendorStatusColors, crmVendorStatusLabels, type CrmVendorStatus } from "@/types/crm/vendor";

export function StatusChip({ status, size = "md" }: { status: CrmVendorStatus; size?: "sm" | "md" }) {
  const [background, foreground] = crmVendorStatusColors[status].split(" ");
  const padding = size === "sm" ? "px-2 py-1" : "px-2.5 py-1.5";
  const text = size === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <View className={`${padding} rounded-full ${background}`}>
      <Text className={`${text} font-semibold ${foreground}`} numberOfLines={1}>
        {crmVendorStatusLabels[status]}
      </Text>
    </View>
  );
}
