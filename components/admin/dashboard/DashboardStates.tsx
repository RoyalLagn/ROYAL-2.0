import React from "react";
import { Text, View } from "react-native";
import { SkeletonBone, SkeletonLines } from "@/components/loading/Skeleton";

export function DashboardSkeleton() {
  // Content-shaped placeholder instead of a bare spinner -- most dashboard
  // widgets render either a small stat row or a short list, so a stat-tile
  // row plus a couple of text lines reads plausibly for either without
  // needing a bespoke skeleton per widget.
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <SkeletonBone width={64} height={44} radius={12} />
        <SkeletonBone width={64} height={44} radius={12} />
        <SkeletonBone width={64} height={44} radius={12} />
      </View>
      <SkeletonLines lines={2} lastLineWidth="50%" />
    </View>
  );
}

export function DashboardError({ message }: { message: string }) {
  return (
    <View className="bg-red-500/5 border border-red-300 rounded-xl p-4">
      <Text className="text-red-500 text-sm">{message}</Text>
    </View>
  );
}

export function DashboardEmpty({ message }: { message: string }) {
  return (
    <View className="bg-background border border-border rounded-xl p-6 items-center">
      <Text className="text-muted-foreground text-sm text-center">{message}</Text>
    </View>
  );
}
