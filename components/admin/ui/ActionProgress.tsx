import React from "react";
import { Text, View } from "react-native";
export function ActionProgress({ completed, total, label }: { completed: number; total: number; label: string }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return <View className="bg-card border border-primary/30 rounded-2xl p-4"><View className="flex-row justify-between"><Text className="text-foreground font-semibold">{label}</Text><Text className="text-primary font-bold">{completed}/{total}</Text></View><View className="h-2 bg-muted rounded-full overflow-hidden mt-3"><View className="h-full bg-primary rounded-full" style={{ width: `${percent}%` }} /></View><Text className="text-muted-foreground text-xs mt-2">{Math.max(0, total - completed)} remaining</Text></View>;
}
