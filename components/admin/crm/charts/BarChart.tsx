import React from "react";
import { Text, View } from "react-native";
import { chartColorFor } from "@/components/admin/crm/charts/palette";

type BarChartProps = {
  data: { label: string; value: number; sublabel?: string }[];
};

// Horizontal bar rows (View widths, not raw SVG) — simplest reliable
// rendering across web/iOS/Android for a small ranked list like district or
// executive performance.
export function BarChart({ data }: BarChartProps) {
  const max = Math.max(1, ...data.map((item) => item.value));
  if (!data.length) {
    return <Text className="text-muted-foreground text-xs">No data yet.</Text>;
  }
  return (
    <View className="gap-3">
      {data.map((item, index) => (
        <View key={item.label}>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-foreground text-xs font-semibold flex-1" numberOfLines={1}>{item.label}</Text>
            <Text className="text-muted-foreground text-xs ml-2">{item.sublabel ?? item.value}</Text>
          </View>
          <View className="h-2 rounded-full bg-muted overflow-hidden">
            <View
              className="h-2 rounded-full"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, backgroundColor: chartColorFor(index) }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
