import React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";

export function CategoryTile({ name, vendorCount, onPress }: { name: string; vendorCount: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="min-h-11">
      <CRMCard className="p-4 flex-row items-center">
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{name}</Text>
          <Text className="text-muted-foreground text-xs mt-1">{vendorCount} vendors</Text>
        </View>
        <ChevronRight size={18} className="text-muted-foreground" />
      </CRMCard>
    </Pressable>
  );
}
