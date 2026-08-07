import React from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Phone, ShieldAlert } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { useMarketingWorkspaceSession } from "@/hooks/crm/useMarketingWorkspaceSession";
import { useMarketingWorkspaceVendors } from "@/hooks/crm/useMarketingWorkspaceVendors";
import type { MarketingInterestStatus } from "@/types/crm/marketingWorkspace";

const interestFilters: { key: "all" | MarketingInterestStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not Interested" },
];

export default function CrmMarketingWorkspace() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, progress, loading, error, refresh, refreshProgress } = useMarketingWorkspaceSession(token ?? null);
  const {
    query, setQuery, interestFilter, setInterestFilter, rows, total, loading: vendorsLoading,
    refreshing, error: vendorsError, setError: setVendorsError, refresh: refreshVendors,
  } = useMarketingWorkspaceVendors(token ?? null, Boolean(session));

  // Re-pull progress + the vendor list every time this screen regains focus
  // — most notably when coming back from the vendor detail screen after a
  // Save, so "Overall Progress" and each vendor's pipeline badges reflect
  // the just-saved values immediately, without requiring a manual
  // pull-to-refresh. Uses the lightweight refreshProgress() (progress only)
  // rather than the full session refresh() (which re-authenticates), since
  // a focus event isn't a reason to re-validate the token.
  useFocusEffect(React.useCallback(() => {
    if (!session) return;
    void refreshProgress();
    void refreshVendors();
  }, [session, refreshProgress, refreshVendors]));

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#E91E63" />
        <Text className="text-muted-foreground mt-3">Opening workspace…</Text>
      </SafeAreaView>
    );
  }

  if (error || !session) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center px-8">
        <ShieldAlert size={40} color="#DC3545" />
        <Text className="text-foreground text-lg font-bold mt-4 text-center">This link isn&apos;t available</Text>
        <Text className="text-muted-foreground text-sm mt-2 text-center">{error || "Unable to open this workspace."}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); void refreshVendors(); }} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-4">RoyalLagn Marketing Workspace</Text>
            <Text className="text-foreground text-2xl font-bold mt-1">{session.workspace_name}</Text>
            <Text className="text-muted-foreground text-sm mt-1">{session.team_name}</Text>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-foreground text-sm font-bold">Overall Progress</Text>
                <Text className="text-primary text-lg font-bold">{progress?.weighted_completion ?? 0}%</Text>
              </View>
              <View className="h-2.5 rounded-full bg-muted overflow-hidden">
                <View className="h-2.5 rounded-full bg-primary" style={{ width: `${progress?.weighted_completion ?? 0}%` }} />
              </View>
              <Text className="text-muted-foreground text-xs mt-3">
                {progress?.assigned ?? 0} vendors assigned · {progress?.contacted ?? 0} contacted · {progress?.meeting_done ?? 0} meetings · {progress?.interested ?? 0} interested · {progress?.registered ?? 0} registered
              </Text>
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder="Search vendors" onChangeText={setQuery} />
          </ResponsiveSection>

          <ResponsiveSection>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {interestFilters.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setInterestFilter(item.key)}
                    className={`px-3 py-2 rounded-full border ${interestFilter === item.key ? "bg-primary border-primary" : "border-border"}`}
                  >
                    <Text className={`text-xs font-semibold ${interestFilter === item.key ? "text-white" : "text-foreground"}`}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </ResponsiveSection>

          {vendorsError ? (
            <ResponsiveSection><AdminErrorState message={vendorsError} onRetry={() => { setVendorsError(null); void refreshVendors(); }} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {vendorsLoading ? (
              <CrmSkeletonGrid count={4} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={total ? "No vendors match your filters" : "No vendors assigned yet"}
                message={total ? "Try a different search or filter." : "Vendors assigned to this workspace by the admin will show up here."}
              />
            ) : (
              <View className="gap-3">
                {rows.map((vendor) => (
                  <Pressable
                    key={vendor.assignment_id}
                    onPress={() => router.push({ pathname: "/CrmMarketingWorkspaceVendorDetail", params: { token, vendorId: vendor.vendor_id } })}
                  >
                    <CRMCard className="p-4">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 min-w-0 pr-2">
                          <Text className="text-foreground text-base font-bold" numberOfLines={1}>{vendor.business_name}</Text>
                          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                            {vendor.category_name ?? "Uncategorized"} · {vendor.area ?? "No location"}
                          </Text>
                        </View>
                        {vendor.phone ? <Phone size={16} className="text-muted-foreground" /> : null}
                      </View>
                      <View className="flex-row items-center gap-3 mt-3 pt-3 border-t border-border">
                        <View className="flex-row items-center">
                          <CheckCircle2 size={13} className={vendor.contacted ? "text-emerald-500" : "text-muted-foreground"} />
                          <Text className={`text-metadata ml-1 ${vendor.contacted ? "text-emerald-500" : "text-muted-foreground"}`}>Contacted</Text>
                        </View>
                        <View className="flex-row items-center">
                          <CheckCircle2 size={13} className={vendor.meeting_done ? "text-emerald-500" : "text-muted-foreground"} />
                          <Text className={`text-metadata ml-1 ${vendor.meeting_done ? "text-emerald-500" : "text-muted-foreground"}`}>Meeting</Text>
                        </View>
                        <View className="flex-row items-center">
                          <CheckCircle2 size={13} className={vendor.interest_status === "interested" ? "text-emerald-500" : "text-muted-foreground"} />
                          <Text className={`text-metadata ml-1 ${vendor.interest_status === "interested" ? "text-emerald-500" : "text-muted-foreground"}`}>Interested</Text>
                        </View>
                        <View className="flex-row items-center">
                          <CheckCircle2 size={13} className={vendor.registered ? "text-emerald-500" : "text-muted-foreground"} />
                          <Text className={`text-metadata ml-1 ${vendor.registered ? "text-emerald-500" : "text-muted-foreground"}`}>Registered</Text>
                        </View>
                      </View>
                    </CRMCard>
                  </Pressable>
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
