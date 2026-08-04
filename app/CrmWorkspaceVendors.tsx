import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus } from "lucide-react-native";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CrmSearchBar } from "@/components/admin/crm/ui/SearchBar";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { WorkspaceVendorCard } from "@/components/workspace/WorkspaceVendorCard";
import { WorkspaceVendorEditor } from "@/components/workspace/WorkspaceVendorEditor";
import { useWorkspaceVendors } from "@/hooks/crm/useWorkspaceVendors";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import type { CrmWorkspaceVendorInput } from "@/types/crm/workspace";

export default function CrmWorkspaceVendors() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { query, setQuery, rows, total, loading, refreshing, error, setError, refresh } = useWorkspaceVendors(token ?? null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveVendor = async (input: CrmWorkspaceVendorInput) => {
    if (!token) return;
    setSaving(true);
    setFormError(null);
    try {
      await CrmWorkspaceSessionService.createVendor(token, input);
      setAddOpen(false);
      await refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to add vendor.");
    } finally {
      setSaving(false);
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
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>My Vendors</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{total} vendors in your cluster</Text>
        </View>
        <Pressable
          accessibilityLabel="Add vendor"
          className="min-w-11 min-h-11 items-center justify-center rounded-full bg-primary"
          onPress={() => setAddOpen(true)}
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
          <ResponsiveSection>
            <CrmSearchBar value={query} placeholder="Search business, owner, phone" onChangeText={setQuery} />
          </ResponsiveSection>

          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => { setError(null); void refresh(); }} /></ResponsiveSection>
          ) : null}

          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={4} />
            ) : !rows.length ? (
              <AdminEmptyState
                title={total ? "No vendors match your search" : "No vendors yet"}
                message={total ? "Try a different search term." : "Tap + to add the first vendor in your cluster."}
              />
            ) : (
              <View className="gap-3">
                {rows.map((vendor) => (
                  <WorkspaceVendorCard
                    key={vendor.id}
                    vendor={vendor}
                    onPress={() => router.push({ pathname: "/CrmWorkspaceVendorDetail", params: { token, vendorId: vendor.id } })}
                  />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>

      <WorkspaceVendorEditor
        visible={addOpen}
        isEdit={false}
        saving={saving}
        error={formError}
        onSave={saveVendor}
        onClose={() => setAddOpen(false)}
      />
    </SafeAreaView>
  );
}
