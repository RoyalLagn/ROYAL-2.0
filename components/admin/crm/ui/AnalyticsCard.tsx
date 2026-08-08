import React from "react";
import { Text, View } from "react-native";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";

type AnalyticsCardProps = {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone?: "primary" | "success" | "warning" | "neutral";
  onPress?: () => void;
};

const toneStyles: Record<NonNullable<AnalyticsCardProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  neutral: "bg-muted text-muted-foreground",
};

export function AnalyticsCard({ label, value, icon: Icon, tone = "primary", onPress }: AnalyticsCardProps) {
  const [background, foreground] = toneStyles[tone].split(" ");
  return (
    <View className="flex-1 min-w-[150px]">
      <CRMCard onPress={onPress} className="p-4">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${background}`}>
          <Icon size={18} className={foreground} />
        </View>
        <Text className="text-foreground text-2xl font-bold mt-3">{value}</Text>
        <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{label}</Text>
      </CRMCard>
    </View>
  );
}
