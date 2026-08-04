import React from "react";
import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Circle, MapPin, MoreVertical, Phone } from "lucide-react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { StatusChip } from "@/components/admin/crm/ui/StatusChip";
import type { CrmVendorListItem } from "@/types/crm/vendor";

const priorityDot: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" };

export function VendorCard({
  vendor, onPress, onLongPress, onMenu, selectionMode = false, selected = false, onToggleSelect,
}: {
  vendor: CrmVendorListItem;
  onPress: () => void;
  onLongPress: () => void;
  onMenu: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <CRMCard className="p-4">
      <Pressable onPress={selectionMode ? onToggleSelect : onPress} onLongPress={selectionMode ? undefined : onLongPress} className="min-h-11">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 min-w-0 pr-2 flex-row items-start">
            {selectionMode ? (
              <View className="mr-2 mt-0.5">
                {selected ? <CheckCircle2 size={18} className="text-primary" /> : <Circle size={18} className="text-muted-foreground" />}
              </View>
            ) : null}
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <View className={`w-2 h-2 rounded-full ${priorityDot[vendor.priority]}`} />
                <Text className="text-foreground text-base font-bold flex-1" numberOfLines={1}>{vendor.business_name}</Text>
              </View>
              <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                {vendor.category_name ?? "Uncategorized"} · {vendor.cluster_name ?? "—"}
              </Text>
              {vendor.area ? (
                <View className="flex-row items-center mt-1">
                  <MapPin size={11} className="text-muted-foreground" />
                  <Text className="text-muted-foreground text-[11px] ml-1" numberOfLines={1}>{vendor.area}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {!selectionMode ? (
            <Pressable accessibilityLabel={`Actions for ${vendor.business_name}`} onPress={onMenu} className="w-9 h-9 items-center justify-center -mr-2 -mt-1">
              <MoreVertical size={18} className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border">
          <StatusChip status={vendor.status} size="sm" />
          {vendor.phone ? (
            <View className="flex-row items-center">
              <Phone size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] ml-1">{vendor.phone}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </CRMCard>
  );
}
