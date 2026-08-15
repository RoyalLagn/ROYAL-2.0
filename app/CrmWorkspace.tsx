import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarCheck, CalendarClock, Plus, ShieldAlert, Users } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { WorkspaceHomeTile } from "@/components/workspace/WorkspaceHomeTile";
import { WorkspaceVendorEditor } from "@/components/workspace/WorkspaceVendorEditor";
import { useWorkspaceSession } from "@/hooks/crm/useWorkspaceSession";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import type { CrmWorkspaceVendorInput } from "@/types/crm/workspace";
import PageLoader from "@/components/loading/PageLoader";

function formatCountdown(expiresAt: string) {
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

export default function CrmWorkspace() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session, progress, loading, error, refresh, refreshProgress } = useWorkspaceSession(token ?? null);
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
      await refreshProgress();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Unable to add vendor.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageLoader />;
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
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void refresh(); }} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <ResponsiveSection>
            <Text className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-4">RoyalLagn Field Workspace</Text>
            <Text className="text-foreground text-2xl font-bold mt-1">{session.workspace_name}</Text>
            <Text className="text-muted-foreground text-sm mt-1">
              {session.employee_name}{session.campaign_name ? ` · ${session.campaign_name}` : ""}
            </Text>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-muted-foreground text-metadata font-bold uppercase">Assigned Cluster</Text>
                  <Text className="text-foreground text-base font-bold mt-0.5">{session.cluster_name}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-muted-foreground text-metadata font-bold uppercase">Expires</Text>
                  <Text className="text-primary text-sm font-bold mt-0.5">{formatCountdown(session.expires_at)}</Text>
                </View>
              </View>
              <View className="mt-4 pt-4 border-t border-border">
                <Text className="text-muted-foreground text-metadata font-bold uppercase mb-1">Today&apos;s Progress</Text>
                <Text className="text-foreground text-xl font-bold">{progress?.vendors_added ?? 0} Vendors Added</Text>
                <Text className="text-muted-foreground text-xs mt-1">
                  {progress?.interested ?? 0} interested · {progress?.meetings ?? 0} meetings · {progress?.registered ?? 0} registered
                </Text>
              </View>
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <View className="flex-row flex-wrap gap-3">
              <WorkspaceHomeTile label="Add Vendor" icon={Plus} onPress={() => setAddOpen(true)} />
              <WorkspaceHomeTile label="My Vendors" icon={Users} onPress={() => router.push({ pathname: "/CrmWorkspaceVendors", params: { token } })} />
              <WorkspaceHomeTile
                label="Pending Follow-ups"
                icon={CalendarClock}
                badge={progress?.followups_pending}
                onPress={() => router.push({ pathname: "/CrmWorkspaceFollowups", params: { token, status: "pending" } })}
              />
              <WorkspaceHomeTile
                label="Completed Follow-ups"
                icon={CalendarCheck}
                onPress={() => router.push({ pathname: "/CrmWorkspaceFollowups", params: { token, status: "completed" } })}
              />
            </View>
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
