import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

export function DashboardSkeleton() {
  return (
    <View className="bg-card border border-border rounded-2xl p-5 items-center">
      <ActivityIndicator color="#E91E63" />
      <Text className="text-muted-foreground text-sm mt-3">Loading live data…</Text>
    </View>
  );
}

export function DashboardError({ message }: { message: string }) {
  return (
    <View className="bg-card border border-red-300 rounded-2xl p-4">
      <Text className="text-red-500 text-sm">{message}</Text>
    </View>
  );
}

export function DashboardEmpty({ message }: { message: string }) {
  return (
    <View className="bg-card border border-border rounded-2xl p-6 items-center">
      <Text className="text-muted-foreground text-sm text-center">{message}</Text>
    </View>
  );
}
