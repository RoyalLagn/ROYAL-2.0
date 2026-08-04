import React from "react";
import { Pressable, Text, View } from "react-native";
import { MapPin } from "lucide-react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { StatusChip } from "@/components/admin/crm/ui/StatusChip";
import type { CrmWorkspaceVendor } from "@/types/crm/workspace";

const priorityDot: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };

export function WorkspaceVendorCard({ vendor, onPress }: { vendor: CrmWorkspaceVendor; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="min-h-11">
      <CRMCard className="p-4">
        <View className="flex-row items-center gap-2">
          <View className={`w-2 h-2 rounded-full ${priorityDot[vendor.priority]}`} />
          <Text className="text-foreground text-base font-bold flex-1" numberOfLines={1}>{vendor.business_name}</Text>
          {vendor.is_own ? (
            <View className="px-2 py-0.5 rounded-full bg-primary/10">
              <Text className="text-primary text-[9px] font-bold">MINE</Text>
            </View>
          ) : null}
        </View>
        <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
          {vendor.category_name ?? "Uncategorized"}
        </Text>
        {vendor.area ? (
          <View className="flex-row items-center mt-1">
            <MapPin size={11} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-[11px] ml-1" numberOfLines={1}>{vendor.area}</Text>
          </View>
        ) : null}
        <View className="mt-3 pt-3 border-t border-border">
          <StatusChip status={vendor.status} size="sm" />
        </View>
      </CRMCard>
    </Pressable>
  );
}
