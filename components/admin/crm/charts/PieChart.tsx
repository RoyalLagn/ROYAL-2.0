import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { chartColorFor } from "@/components/admin/crm/charts/palette";

type PieChartProps = {
  data: { label: string; value: number }[];
  size?: number;
};

// Simple pie chart drawn as stacked circle strokes (stroke-dasharray trick) —
// no charting library is installed in this project, so this uses the
// already-available react-native-svg directly.
export function PieChart({ data, size = 160 }: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!total) {
    return <Text className="text-muted-foreground text-xs">No data yet.</Text>;
  }

  return (
    <View className="flex-row items-center flex-wrap gap-4">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          {data.map((item, index) => {
            const fraction = item.value / total;
            const dash = fraction * circumference;
            const circle = (
              <Circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={chartColorFor(index)}
                strokeWidth={16}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return circle;
          })}
        </G>
      </Svg>
      <View className="gap-1.5">
        {data.map((item, index) => (
          <View key={item.label} className="flex-row items-center">
            <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: chartColorFor(index) }} />
            <Text className="text-foreground text-xs font-medium" numberOfLines={1}>
              {item.label} <Text className="text-muted-foreground">({item.value})</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
