import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertTriangle, ArrowLeft, Ban, CalendarClock, Check, Copy, Pause, Play, RefreshCw, Share2, ShieldOff, Trash2, UserCog } from "lucide-react-native";
import { AdminErrorState } from "@/components/admin/ui/AdminState";
import PageLoader from "@/components/loading/PageLoader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { DateField } from "@/components/admin/crm/ui/DateField";
import SuccessToast, { type SuccessToastHandle } from "@/components/animated/SuccessToast";
import { useMarketingWorkspaceDetail } from "@/hooks/crm/useMarketingWorkspaceDetail";
import { buildMarketingWorkspaceUrl, copyMarketingWorkspaceLink, shareMarketingWorkspaceLink } from "@/services/crm/marketingWorkspaceShare";

// private.resolve_active_marketing_workspace (the function every share-link
// request goes through) blocks access the moment `end_date < current_date`
// — evaluated fresh on every request, independent of the `status` column —
// and current_date there is the Postgres server's date, which this project
// runs in UTC. Mirrored here with the UTC date (not the device's local
// date/DateField's local-part formatting) so this banner only ever appears
// exactly when the real server-side check would also block the link.
function todayUtcIso() {
  return new Date().toISOString().slice(0, 10);
}

// Same status palette as AdminCrmMarketingWorkspaces.tsx's list row badge —
// kept in sync deliberately rather than shared, since that file doesn't
// export it and this is the only other place a workspace status is shown.
const statusColor: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-500",
  paused: "bg-amber-500/10 text-amber-500",
  completed: "bg-primary/10 text-primary",
  revoked: "bg-red-500/10 text-red-500",
};

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
  const { workspace, stats, loading, saving, error, setError, setStatus, regenerateToken, update, refresh } = useMarketingWorkspaceDetail(workspaceId ?? null);
  const [copied, setCopied] = useState(false);
  const [extending, setExtending] = useState(false);
  const [draftEndDate, setDraftEndDate] = useState("");
  const toastRef = useRef<SuccessToastHandle>(null);

  if (loading && !workspace) {
    return <PageLoader />;
  }
  if (error && !workspace) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <ResponsiveContainer className="pt-6"><AdminErrorState message={error} onRetry={() => void refresh()} /></ResponsiveContainer>
      </SafeAreaView>
    );
  }
  if (!workspace) return null;

  const currentLink = buildMarketingWorkspaceUrl(workspace.token);
  const [statusBg, statusFg] = (statusColor[workspace.status] ?? statusColor.active).split(" ");
  // Access is blocked by an expired end_date regardless of the `status`
  // column (see private.resolve_active_marketing_workspace) — and that
  // column doesn't reliably get flipped to "completed" for it (the write
  // and the access-denial both happen in the one request that discovers the
  // expiry, so the denial rolls the write back). So this is computed here
  // rather than trusted from workspace.status, and it's what actually
  // explains "the link won't open" independent of Pause/Regenerate/Revoke.
  const isExpired = workspace.status === "active" && !!workspace.end_date && workspace.end_date < todayUtcIso();
  const endDateLabel = workspace.end_date ? new Date(`${workspace.end_date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

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

  // Every action below waits for the RPC to actually succeed (setStatus /
  // regenerateToken only resolve `true` once the database row has been
  // updated and re-fetched) before showing any success feedback — on
  // failure the hook leaves `workspace` untouched and surfaces `error`
  // through the AdminErrorState banner instead, so the visible status/link
  // never silently flips ahead of the backend.
  const doPause = async () => { if (await setStatus("paused")) toastRef.current?.show("Workspace paused"); };
  const doResume = async () => { if (await setStatus("active")) toastRef.current?.show("Workspace resumed"); };
  const doRevoke = async () => { if (await setStatus("revoked")) toastRef.current?.show("Workspace revoked"); };
  const doRegenerate = async () => { if (await regenerateToken()) toastRef.current?.show("New link generated"); };

  // Picking a date saves immediately (no separate Save step to forget) —
  // `draftEndDate` still holds the picker's own value for its display, but
  // the actual persistence happens the instant a date is chosen.
  const openExtend = () => { setDraftEndDate(workspace.end_date ?? ""); setExtending(true); };
  const applyNewEndDate = async (value: string) => {
    setDraftEndDate(value);
    try {
      await update({ endDate: value || null });
      setExtending(false);
      toastRef.current?.show("End date updated — link is active again");
    } catch {
      // update() already set `error`, surfaced via the AdminErrorState banner above; keep the picker open to retry.
    }
  };

  const confirmPause = () => {
    Alert.alert("Pause this workspace?", "The shared link will temporarily stop working. You can resume it later.", [
      { text: "Cancel", style: "cancel" },
      { text: "Pause Workspace", onPress: () => void doPause() },
    ]);
  };
  const confirmRegenerate = () => {
    Alert.alert("Generate a new workspace link?", "Your current shared link will immediately stop working.", [
      { text: "Cancel", style: "cancel" },
      { text: "Regenerate Link", onPress: () => void doRegenerate() },
    ]);
  };
  const confirmRevoke = () => {
    Alert.alert(
      "Revoke workspace access?",
      "This will permanently disable the shared link. Assigned vendors and workspace data will remain stored, but the link will no longer be accessible.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke Workspace", style: "destructive", onPress: () => void doRevoke() },
      ],
    );
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

              <View className="mt-3 px-3 py-2.5 rounded-2xl bg-muted/50 border border-border">
                <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-wide mb-1">Current link</Text>
                <Text selectable numberOfLines={2} className="text-foreground text-xs">{currentLink}</Text>
              </View>

              {workspace.status === "revoked" ? (
                <View className="mt-3 px-3 py-2.5 rounded-2xl flex-row items-start gap-2" style={{ backgroundColor: "#FEE2E2" }}>
                  <ShieldOff size={14} color="#DC3545" style={{ marginTop: 1 }} />
                  <Text className="text-xs font-semibold flex-1" style={{ color: "#DC3545" }}>Workspace access has been revoked.</Text>
                </View>
              ) : workspace.status === "paused" ? (
                <View className="mt-3 px-3 py-2.5 rounded-2xl bg-amber-500/10 flex-row items-start gap-2">
                  <AlertTriangle size={14} color="#D97706" style={{ marginTop: 1 }} />
                  <Text className="text-amber-600 text-xs font-semibold flex-1">Workspace is paused. The shared link is temporarily inactive.</Text>
                </View>
              ) : isExpired ? (
                <View className="mt-3 px-3 py-2.5 rounded-2xl bg-amber-500/10 gap-2">
                  <View className="flex-row items-start gap-2">
                    <CalendarClock size={14} color="#D97706" style={{ marginTop: 1 }} />
                    <Text className="text-amber-600 text-xs font-semibold flex-1">
                      This workspace&apos;s End Date ({endDateLabel}) has passed, so the shared link is blocked — regenerating alone won&apos;t reopen it. Extend the end date to restore access.
                    </Text>
                  </View>
                  {!extending ? (
                    <Pressable disabled={saving} onPress={openExtend} className="self-start px-3 py-1.5 rounded-full bg-amber-500/15">
                      <Text className="text-amber-700 text-xs font-bold">Extend end date</Text>
                    </Pressable>
                  ) : (
                    <View>
                      <DateField label="New end date" value={draftEndDate} onChange={(value) => void applyNewEndDate(value)} minimumDate={workspace.start_date ?? undefined} placeholder="Select a new end date" />
                      <Text className="text-muted-foreground text-metadata mt-0.5">Picking a date saves it immediately.</Text>
                      <Pressable disabled={saving} onPress={() => setExtending(false)} className="self-start mt-1.5 px-4 py-2 rounded-full border border-border">
                        <Text className="text-foreground text-xs font-bold">Cancel</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}

              <Pressable
                disabled={saving || workspace.status === "revoked"}
                onPress={confirmRegenerate}
                className={`mt-3 h-11 rounded-2xl border items-center justify-center flex-row px-4 ${workspace.status === "revoked" ? "border-border opacity-50" : "border-primary/30 bg-primary/5"}`}
              >
                <RefreshCw size={14} className="text-primary" />
                <Text className="text-primary text-xs font-bold ml-2">Regenerate Link</Text>
              </Pressable>
              <Text className="text-muted-foreground text-metadata mt-1.5 text-center">
                {workspace.status === "revoked"
                  ? "This workspace has been revoked — the link can no longer be reactivated."
                  : "Generates a new link and immediately invalidates the previous link."}
              </Text>
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard className="p-4">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-foreground text-sm font-bold">Workspace Controls</Text>
                <View className={`px-2.5 py-1 rounded-full ${statusBg}`}>
                  <Text className={`text-metadata font-bold uppercase ${statusFg}`}>{workspace.status}</Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {workspace.status === "active" ? (
                  <Pressable disabled={saving} onPress={confirmPause} className="px-4 py-2 rounded-full bg-amber-500/10 flex-row items-center">
                    <Pause size={14} className="text-amber-500" />
                    <Text className="text-amber-500 text-xs font-bold ml-1.5">Pause</Text>
                  </Pressable>
                ) : workspace.status === "paused" ? (
                  <Pressable disabled={saving} onPress={() => void doResume()} className="px-4 py-2 rounded-full bg-emerald-500/10 flex-row items-center">
                    <Play size={14} className="text-emerald-500" />
                    <Text className="text-emerald-500 text-xs font-bold ml-1.5">Resume</Text>
                  </Pressable>
                ) : null}
                {workspace.status !== "revoked" ? (
                  <Pressable disabled={saving} onPress={confirmRevoke} className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: "#FEE2E2" }}>
                    <Trash2 size={14} color="#DC3545" />
                    <Text className="text-xs font-bold ml-1.5" style={{ color: "#DC3545" }}>Revoke</Text>
                  </Pressable>
                ) : (
                  <View className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: "#FEE2E2" }}>
                    <Ban size={14} color="#DC3545" />
                    <Text className="text-xs font-bold ml-1.5" style={{ color: "#DC3545" }}>Revoked</Text>
                  </View>
                )}
                {saving ? <ActivityIndicator size="small" color="#E91E63" /> : null}
              </View>
              {workspace.status === "revoked" ? (
                <Text className="text-muted-foreground text-xs mt-3">This workspace has been permanently revoked. Vendors, assignments, and progress remain stored — only the shared link is disabled.</Text>
              ) : isExpired ? (
                <Text className="text-muted-foreground text-xs mt-3">This workspace shows as active, but its End Date ({endDateLabel}) has passed — the shared link is blocked until you extend it above.</Text>
              ) : null}
            </CRMCard>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <SuccessToast ref={toastRef} />
    </SafeAreaView>
  );
}
