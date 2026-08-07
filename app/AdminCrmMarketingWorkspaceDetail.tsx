import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Copy, Pause, Play, Share2, Trash2, UserCog } from "lucide-react-native";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { useMarketingWorkspaceDetail } from "@/hooks/crm/useMarketingWorkspaceDetail";
import { copyMarketingWorkspaceLink, shareMarketingWorkspaceLink } from "@/services/crm/marketingWorkspaceShare";

function StatTile({ label, value, tone = "primary" }: { label: string; value: number; tone?: "primary" | "success" | "warning" | "neutral" }) {
  const colors = {
    primary: "text-primary", success: "text-emerald-500", warning: "text-amber-500", neutral: "text-foreground",
  };
  return (
    <CRMCard className="p-4 flex-1 min-w-[120px]">
      <Text className={`text-2xl font-bold ${colors[tone]}`}>{value}</Text>
      <Text className="text-muted-foreground text-xs mt-1">{label}</Text>
    </CRMCard>
  );
}

export default function AdminCrmMarketingWorkspaceDetail() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const { workspace, stats, loading, saving, error, setError, setStatus, regenerateToken, refresh } = useMarketingWorkspaceDetail(workspaceId ?? null);
  const [copied, setCopied] = useState(false);

  if (loading && !workspace) {
    return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><AdminLoadingState label="Loading workspace…" /></SafeAreaView>;
  }
  if (error && !workspace) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <ResponsiveContainer className="pt-6"><AdminErrorState message={error} onRetry={() => void refresh()} /></ResponsiveContainer>
      </SafeAreaView>
    );
  }
  if (!workspace) return null;

  const copyLink = async () => {
    try {
      await copyMarketingWorkspaceLink(workspace.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (reason) {
      Alert.alert("Copy failed", reason instanceof Error ? reason.message : "Unable to copy the link.");
    }
  };
  const shareLink = async () => {
    try {
      await shareMarketingWorkspaceLink(workspace.token, workspace.name);
    } catch (reason) {
      Alert.alert("Share failed", reason instanceof Error ? reason.message : "Unable to share the link.");
    }
  };
  const confirmRevoke = () => {
    Alert.alert("Revoke workspace?", "The team will immediately lose access to this link.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => void setStatus("revoked") },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ResponsiveContainer className="flex-row items-center py-2">
        <Pressable
          accessibilityLabel="Go back"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/AdminCrmMarketingWorkspaces"))}
        >
          <ArrowLeft size={21} className="text-foreground" />
        </Pressable>
        <View className="flex-1 px-2 min-w-0">
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>{workspace.name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{workspace.team_name}</Text>
        </View>
        <Pressable
          accessibilityLabel="Manage vendors"
          className="min-w-11 min-h-11 items-center justify-center"
          onPress={() => router.push({ pathname: "/AdminCrmMarketingWorkspaceAssign", params: { workspaceId } })}
        >
          <UserCog size={19} className="text-primary" />
        </Pressable>
      </ResponsiveContainer>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <ResponsiveContainer>
          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => setError(null)} /></ResponsiveSection> : null}

          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-foreground text-sm font-bold">Overall Completion</Text>
                <Text className="text-primary text-lg font-bold">{stats?.weighted_completion ?? 0}%</Text>
              </View>
              <View className="h-2.5 rounded-full bg-muted overflow-hidden">
                <View className="h-2.5 rounded-full bg-primary" style={{ width: `${stats?.weighted_completion ?? 0}%` }} />
              </View>
              {workspace.description ? <Text className="text-muted-foreground text-xs mt-3">{workspace.description}</Text> : null}
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <View className="flex-row flex-wrap gap-3">
              <StatTile label="Assigned Vendors" value={stats?.assigned ?? 0} tone="neutral" />
              <StatTile label="Contacted" value={stats?.contacted ?? 0} tone="primary" />
              <StatTile label="Meeting Done" value={stats?.meeting_done ?? 0} tone="primary" />
              <StatTile label="Interested" value={stats?.interested ?? 0} tone="success" />
              <StatTile label="Not Interested" value={stats?.not_interested ?? 0} tone="warning" />
              <StatTile label="Registered" value={stats?.registered ?? 0} tone="success" />
              <StatTile label="Pending" value={stats?.pending ?? 0} tone="warning" />
            </View>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Text className="text-foreground text-sm font-bold mb-3">Share with {workspace.team_name}</Text>
              <View className="flex-row gap-3">
                <Pressable onPress={() => void copyLink()} className="flex-1 h-12 rounded-2xl border border-border items-center justify-center flex-row">
                  {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-primary" />}
                  <Text className="text-foreground text-xs font-bold ml-2">{copied ? "Copied" : "Copy Link"}</Text>
                </Pressable>
                <Pressable onPress={() => void shareLink()} className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center flex-row">
                  <Share2 size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-2">Share Link</Text>
                </Pressable>
              </View>
              <Pressable disabled={saving} onPress={() => void regenerateToken()} className="mt-3 self-center">
                <Text className="text-red-500 text-xs font-semibold">Regenerate Link (invalidates the old one)</Text>
              </Pressable>
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <Text className="text-foreground text-sm font-bold mb-3">Workspace Controls</Text>
              <View className="flex-row flex-wrap gap-2">
                {workspace.status === "active" ? (
                  <Pressable disabled={saving} onPress={() => void setStatus("paused")} className="px-4 py-2 rounded-full bg-amber-500/10 flex-row items-center">
                    <Pause size={14} className="text-amber-500" />
                    <Text className="text-amber-500 text-xs font-bold ml-1.5">Pause</Text>
                  </Pressable>
                ) : workspace.status === "paused" ? (
                  <Pressable disabled={saving} onPress={() => void setStatus("active")} className="px-4 py-2 rounded-full bg-emerald-500/10 flex-row items-center">
                    <Play size={14} className="text-emerald-500" />
                    <Text className="text-emerald-500 text-xs font-bold ml-1.5">Resume</Text>
                  </Pressable>
                ) : null}
                {workspace.status !== "revoked" ? (
                  <Pressable disabled={saving} onPress={confirmRevoke} className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: "#FEE2E2" }}>
                    <Trash2 size={14} color="#DC3545" />
                    <Text className="text-xs font-bold ml-1.5" style={{ color: "#DC3545" }}>Revoke</Text>
                  </Pressable>
                ) : null}
                {saving ? <ActivityIndicator size="small" color="#E91E63" /> : null}
              </View>
            </CRMCard>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
