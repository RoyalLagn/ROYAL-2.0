import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SkeletonBone, SkeletonLines } from "@/components/loading/Skeleton";
export function AdminLoadingState({ label = "Loading…" }: { label?: string }) { return <View className="py-16 items-center"><ActivityIndicator color="#E91E63" /><Text className="text-muted-foreground text-sm mt-3">{label}</Text></View>; }
export function AdminErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <View className="bg-destructive/5 border border-destructive/30 rounded-2xl p-5"><Text className="text-destructive font-body text-body">{message}</Text>{onRetry ? <Pressable className="min-h-11 mt-3 justify-center" onPress={onRetry}><Text className="text-primary font-inter-semibold text-body">Try again</Text></Pressable> : null}</View>; }
export function AdminEmptyState({ title, message }: { title: string; message: string }) { return <View className="bg-card border border-border rounded-2xl p-8 items-center"><Text className="text-foreground font-inter-bold text-card-title">{title}</Text><Text className="text-muted-foreground font-body text-body text-center mt-2">{message}</Text></View>; }

/** One admin-table row placeholder, roughly matching VendorCard's shape
 *  (logo + name/owner/contact lines + a badge row) so the real content
 *  doesn't jump into place once it loads. */
function AdminRowSkeleton() {
  return (
    <View className="bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3">
      <SkeletonBone width={56} height={56} radius={16} />
      <View className="flex-1 min-w-0">
        <SkeletonLines lines={3} gap={7} lastLineWidth="55%" />
        <View className="flex-row gap-2 mt-3">
          <SkeletonBone width={60} height={20} radius={999} />
          <SkeletonBone width={70} height={20} radius={999} />
          <SkeletonBone width={50} height={20} radius={999} />
        </View>
      </View>
    </View>
  );
}

/** Only used for the *initial* table load (no rows on screen yet) --
 *  background refreshes keep the real rows visible, see useAdminVendors'
 *  `refreshing` flag and AdminRefreshIndicator below. */
export function AdminTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: rows }).map((_, index) => <AdminRowSkeleton key={index} />)}
    </View>
  );
}

/** Small, non-blocking "updating" hint for background refreshes -- never
 *  replaces the already-rendered rows the way AdminTableSkeleton does. */
export function AdminRefreshIndicator({ label = "Updating…" }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-2 py-2">
      <ActivityIndicator size="small" color="#E91E63" />
      <Text className="text-muted-foreground text-xs">{label}</Text>
    </View>
  );
}
