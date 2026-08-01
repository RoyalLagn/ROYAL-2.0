import React from "react";
import { Text, View } from "react-native";

export type AdminChartDataset = {
  label: string;
  data: number[];
  borderColor?: string;
  backgroundColor?: string;
};

export type AdminChartProps = {
  type: "line" | "bar";
  labels: string[];
  datasets: AdminChartDataset[];
  currency?: boolean;
  height?: number;
};

export default function AdminChart({ labels, datasets, currency, height = 240 }: AdminChartProps) {
  const values = datasets.flatMap((dataset) => dataset.data);
  const max = Math.max(1, ...values);
  return <View style={{ minHeight: height }} className="justify-end">
    <View className="flex-1 flex-row items-end gap-2 px-2 pt-5">
      {labels.map((label, index) => {
        const value = datasets.reduce((sum, dataset) => sum + Number(dataset.data[index] ?? 0), 0);
        return <View key={`${label}-${index}`} className="flex-1 min-w-0 items-center justify-end"><Text className="text-muted-foreground text-[8px] mb-1" numberOfLines={1}>{currency ? `₹${value.toLocaleString("en-IN")}` : value}</Text><View className="w-full max-w-8 bg-primary rounded-t-md" style={{ height: `${Math.max(2, value / max * 75)}%` }} /><Text className="text-muted-foreground text-[8px] mt-2" numberOfLines={1}>{label}</Text></View>;
      })}
    </View>
  </View>;
}
