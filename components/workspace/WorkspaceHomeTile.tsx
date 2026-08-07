import React from "react";
import { Text, View } from "react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";

type WorkspaceHomeTileProps = {
  label: string;
  icon: React.ElementType;
  badge?: number;
  onPress: () => void;
};

// Large one-hand-friendly tile for the employee home screen — the spec is
// explicit that this screen shows "large buttons... nothing else."
export function WorkspaceHomeTile({ label, icon: Icon, badge, onPress }: WorkspaceHomeTileProps) {
  return (
    <CRMCard onPress={onPress} className="p-5 items-center justify-center flex-1 min-w-[140px] min-h-[120px]">
      <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
        <Icon size={24} className="text-primary" />
      </View>
      <Text className="text-foreground text-sm font-bold mt-3 text-center">{label}</Text>
      {badge !== undefined ? (
        <View className="absolute top-3 right-3 min-w-6 h-6 px-1.5 rounded-full bg-primary items-center justify-center">
          <Text className="text-white text-metadata font-bold">{badge}</Text>
        </View>
      ) : null}
    </CRMCard>
  );
}
