import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

type LineChartProps = {
  data: { date: string; count: number }[];
  height?: number;
};

export function LineChart({ data, height = 140 }: LineChartProps) {
  if (!data.length) {
    return <Text className="text-muted-foreground text-xs">No data yet.</Text>;
  }
  const width = Math.max(240, data.length * 24);
  const max = Math.max(1, ...data.map((point) => point.count));
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const toY = (value: number) => height - 16 - (value / max) * (height - 32);
  const points = data.map((point, index) => `${index * stepX},${toY(point.count)}`).join(" ");

  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={0} y1={height - 16} x2={width} y2={height - 16} stroke="#E7E1E4" strokeWidth={1} />
        <Polyline points={points} fill="none" stroke="#E91E63" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((point, index) => (
          <Circle key={point.date} cx={index * stepX} cy={toY(point.count)} r={3} fill="#E91E63" />
        ))}
      </Svg>
      <View className="flex-row justify-between mt-1">
        <Text className="text-muted-foreground text-[9px]">{data[0]?.date.slice(5)}</Text>
        <Text className="text-muted-foreground text-[9px]">{data[data.length - 1]?.date.slice(5)}</Text>
      </View>
    </View>
  );
}
