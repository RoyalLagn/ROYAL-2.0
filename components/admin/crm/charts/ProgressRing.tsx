import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

type ProgressRingProps = {
  value: number;
  total: number;
  size?: number;
  label?: string;
};

export function ProgressRing({ value, total, size = 120, label }: ProgressRingProps) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <View className="items-center">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#F3E9EE" strokeWidth={12} fill="none" />
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E91E63"
              strokeWidth={12}
              fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
            />
          </G>
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-foreground text-2xl font-bold">{percent}%</Text>
          <Text className="text-muted-foreground text-metadata">{value} / {total}</Text>
        </View>
      </View>
      {label ? <Text className="text-muted-foreground text-xs mt-2 text-center">{label}</Text> : null}
    </View>
  );
}
