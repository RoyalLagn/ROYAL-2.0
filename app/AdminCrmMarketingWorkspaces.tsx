import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { useMarketingWorkspaces } from "@/hooks/crm/useMarketingWorkspaces";
import type { CrmMarketingWorkspace } from "@/types/crm/marketingWorkspace";

const statusColor: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-amber-500/10 text-amber-500",
  completed: "bg-primary/10 text-primary",
  revoked: "bg-red-500/10 text-red-500",
};

function WorkspaceRow({ workspace, completion, assigned, onPress }: {
  workspace: CrmMarketingWorkspace; completion: number; assigned: number; onPress: () => void;
}) {
  const [background, foreground] = (statusColor[workspace.status] ?? statusColor.active).split(" ");
  return (
    <CRMCard onPress={onPress} className="p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 min-w-0 pr-2">
          <Text className="text-foreground text-base font-bold" numberOfLines={1}>{workspace.name}</Text>
          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>{workspace.team_name}</Text>
        </View>
        <View className={`px-2.5 py-1 rounded-full ${background}`}>
          <Text className={`text-[10px] font-bold capitalize ${foreground}`}>{workspace.status}</Text>
        </View>
      </View>
      <View className="mt-3">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-muted-foreground text-[10px] font-semibold">{assigned} VENDORS ASSIGNED</Text>
          <Text className="text-primary text-[10px] font-bold">{completion}%</Text>
        </View>
        <View className="h-1.5 rounded-full bg-muted overflow-hidden">
          <View className="h-1.5 rounded-full bg-primary" style={{ width: `${completion}%` }} />
        </View>
      </View>
    </CRMCard>
  );
}

export default function AdminCrmMarketingWorkspaces() {
  const router = useRouter();
  const { rows, stats, loading, refreshing, error, refresh } = useMarketingWorkspaces();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrm"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Marketing Workspaces</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{rows.length} workspaces</Text>
        </View>
        <Pressable
          accessibilityLabel="Create marketing workspace"
          className="min-w-11 min-h-11 items-center justify-center rounded-full bg-primary"
          onPress={() => router.push("/AdminCrmMarketingWorkspaceCreate")}
        >
          <Plus size={19} color="#FFFFFF" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => void refresh()} /></ResponsiveSection> : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={3} />
            ) : !rows.length ? (
              <AdminEmptyState
                title="No marketing workspaces yet"
                message="Create one to assign vendor categories and vendors to a marketing team."
              />
            ) : (
              <View className="gap-3">
                {rows.map((workspace) => (
                  <WorkspaceRow
                    key={workspace.id}
                    workspace={workspace}
                    completion={stats[workspace.id]?.weighted_completion ?? 0}
                    assigned={stats[workspace.id]?.assigned ?? 0}
                    onPress={() => router.push({ pathname: "/AdminCrmMarketingWorkspaceDetail", params: { workspaceId: workspace.id } })}
                  />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
