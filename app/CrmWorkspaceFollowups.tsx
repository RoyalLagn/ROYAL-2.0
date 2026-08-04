import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import { crmFollowupTypeLabels } from "@/types/crm/followup";
import type { CrmWorkspaceFollowup } from "@/types/crm/workspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load follow-ups.";
}

export default function CrmWorkspaceFollowups() {
  const router = useRouter();
  const { token, status } = useLocalSearchParams<{ token?: string; status?: "pending" | "completed" }>();
  const activeStatus = status === "completed" ? "completed" : "pending";
  const [rows, setRows] = useState<CrmWorkspaceFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setRows(await CrmWorkspaceSessionService.listFollowups(token, activeStatus));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, activeStatus]);

  useEffect(() => { void load(); }, [load]);

  const complete = async (followupId: string) => {
    if (!token) return;
    try {
      await CrmWorkspaceSessionService.setFollowupStatus(token, followupId, "completed");
      await load(true);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: "/CrmWorkspace", params: { token } }))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>
            {activeStatus === "pending" ? "Pending Follow-ups" : "Completed Follow-ups"}
          </Text>
        </View>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load(true)} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={3} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={activeStatus === "pending" ? "No pending follow-ups" : "No completed follow-ups yet"}
                message="Follow-ups you schedule from a vendor's profile show up here."
              />
            ) : (
              <View className="gap-3">
                {rows.map((item) => (
                  <CRMCard key={item.id} className="p-3">
                    <Pressable onPress={() => router.push({ pathname: "/CrmWorkspaceVendorDetail", params: { token, vendorId: item.vendor_id } })}>
                      <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{item.business_name}</Text>
                      <Text className="text-muted-foreground text-xs mt-1">
                        {crmFollowupTypeLabels[item.type]} · {item.scheduled_date}{item.scheduled_time ? ` · ${item.scheduled_time}` : ""}
                      </Text>
                      {item.notes ? <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{item.notes}</Text> : null}
                    </Pressable>
                    {activeStatus === "pending" ? (
                      <Pressable onPress={() => void complete(item.id)} className="mt-3 pt-3 border-t border-border self-start">
                        <Text className="text-emerald-500 text-[11px] font-bold">Mark done</Text>
                      </Pressable>
                    ) : null}
                  </CRMCard>
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
