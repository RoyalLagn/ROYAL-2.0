import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, Copy, RefreshCw, Share2 } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CrmWorkspaceService, type CrmFieldWorkspaceWithNames } from "@/services/crm/workspaceService";
import { copyWorkspaceLink, shareWorkspaceLink } from "@/services/crm/workspaceShare";
import {
  workspaceStatusColors,
  workspaceStatusLabels,
  type CrmWorkspacePermissions,
  type WorkspaceStatus,
} from "@/types/crm/workspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Something went wrong. Please try again.";
}

const statusFilters: { key: WorkspaceStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

const extendPresets = [
  { label: "+24 Hours", hours: 24 },
  { label: "+48 Hours", hours: 48 },
  { label: "+7 Days", hours: 24 * 7 },
];

const permissionFields: { key: keyof CrmWorkspacePermissions; label: string }[] = [
  { key: "add_vendors", label: "Add Vendors" },
  { key: "edit_own_vendors", label: "Edit Own Vendors" },
  { key: "add_notes", label: "Add Notes" },
  { key: "add_followups", label: "Add Follow-ups" },
  { key: "upload_photos", label: "Upload Photos" },
  { key: "call_vendor", label: "Call Vendor" },
  { key: "whatsapp_vendor", label: "WhatsApp Vendor" },
  { key: "view_assigned_vendors", label: "View Assigned Vendors" },
  { key: "delete_vendors", label: "Delete Vendors" },
  { key: "export_data", label: "Export Data" },
  { key: "view_reports", label: "View Reports" },
  { key: "view_analytics", label: "View Analytics" },
  { key: "view_settings", label: "View Settings" },
  { key: "vendor_approval", label: "Vendor Approval" },
  { key: "subscription_access", label: "Subscription Access" },
  { key: "other_clusters", label: "Other Clusters" },
];

function formatExpiry(iso: string) {
  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const abs = date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (diffMs <= 0) return `Expired ${abs}`;
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `Expires in ${hours}h · ${abs}`;
  return `Expires in ${Math.round(hours / 24)}d · ${abs}`;
}

// The `active → expired` status transition only happens lazily, inside the
// employee-facing workspace_authenticate/resolve_active_workspace RPCs, the
// moment someone opens the link past its expiry. A workspace nobody has
// opened since expiring is still stored as `active` even though it can no
// longer be used — this reconciles what the admin sees with that reality
// without needing a cron job or writing to the row just to render a list.
function effectiveStatus(workspace: Pick<CrmFieldWorkspaceWithNames, "status" | "expires_at">): WorkspaceStatus {
  if (workspace.status === "active" && new Date(workspace.expires_at).getTime() < Date.now()) return "expired";
  return workspace.status;
}

function WorkspaceRow({
  workspace,
  busy,
  onSetStatus,
  onExtend,
  onRegenerate,
  onCopy,
  onShare,
  onLoadPermissions,
  onSavePermissions,
}: {
  workspace: CrmFieldWorkspaceWithNames;
  busy: boolean;
  onSetStatus: (status: Extract<WorkspaceStatus, "active" | "paused" | "revoked">) => void;
  onExtend: (hours: number) => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onShare: () => void;
  onLoadPermissions: () => Promise<CrmWorkspacePermissions | null>;
  onSavePermissions: (permissions: Partial<CrmWorkspacePermissions>) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [permissions, setPermissions] = useState<CrmWorkspacePermissions | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !permissions && !permissionsLoading) {
      setPermissionsLoading(true);
      setPermissionsError(null);
      try {
        setPermissions(await onLoadPermissions());
      } catch (reason) {
        setPermissionsError(errorMessage(reason));
      } finally {
        setPermissionsLoading(false);
      }
    }
  };

  const flipPermission = async (key: keyof CrmWorkspacePermissions, value: boolean) => {
    if (!permissions) return;
    const previous = permissions;
    setPermissions({ ...permissions, [key]: value });
    setPermissionsSaving(true);
    setPermissionsError(null);
    try {
      await onSavePermissions({ [key]: value });
    } catch (reason) {
      setPermissions(previous);
      setPermissionsError(errorMessage(reason));
    } finally {
      setPermissionsSaving(false);
    }
  };

  const display = effectiveStatus(workspace);
  const isExpired = display === "expired";
  const [background, foreground] = workspaceStatusColors[display].split(" ");

  return (
    <CRMCard className="p-4">
      <Pressable onPress={() => void toggle()} className="min-h-11">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 min-w-0 pr-2">
            <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{workspace.name}</Text>
            <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
              {workspace.employee_name}{workspace.employee_phone ? ` · ${workspace.employee_phone}` : ""}
            </Text>
            <Text className="text-muted-foreground text-[10px] mt-1" numberOfLines={1}>
              {workspace.cluster_name ?? "Unknown cluster"}{workspace.campaign_name ? ` · ${workspace.campaign_name}` : ""}
            </Text>
            <Text className={`text-[10px] mt-1 ${isExpired ? "text-red-500" : "text-muted-foreground"}`}>
              {formatExpiry(workspace.expires_at)}
            </Text>
          </View>
          <View className="items-end gap-2">
            <View className={`px-2.5 py-1.5 rounded-full ${background}`}>
              <Text className={`text-[10px] font-semibold ${foreground}`}>{workspaceStatusLabels[display]}</Text>
            </View>
            <ChevronDown size={16} className="text-muted-foreground" style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }} />
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View className="mt-4 pt-4 border-t border-border">
          {isExpired ? (
            <View className="bg-red-500/10 rounded-2xl px-3 py-2 mb-3">
              <Text className="text-red-500 text-[11px] font-semibold">
                This link stopped working when it expired. Extend the expiry below to reactivate it — the employee can use the same link once you do.
              </Text>
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {workspace.status === "paused" ? (
              <Pressable disabled={busy} onPress={() => onSetStatus("active")} className="px-3 py-2 rounded-full border border-emerald-500/40 bg-emerald-500/10">
                <Text className="text-emerald-500 text-[11px] font-bold">Activate</Text>
              </Pressable>
            ) : null}
            {workspace.status === "active" && !isExpired ? (
              <Pressable disabled={busy} onPress={() => onSetStatus("paused")} className="px-3 py-2 rounded-full border border-amber-500/40 bg-amber-500/10">
                <Text className="text-amber-500 text-[11px] font-bold">Pause</Text>
              </Pressable>
            ) : null}
            {workspace.status !== "revoked" ? (
              <Pressable disabled={busy} onPress={() => onSetStatus("revoked")} className="px-3 py-2 rounded-full border border-red-500/40 bg-red-500/10">
                <Text className="text-red-500 text-[11px] font-bold">Revoke</Text>
              </Pressable>
            ) : null}
            <Pressable disabled={busy} onPress={onCopy} className="px-3 py-2 rounded-full border border-border flex-row items-center">
              <Copy size={12} className="text-primary" />
              <Text className="text-foreground text-[11px] font-bold ml-1.5">Copy Link</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={onShare} className="px-3 py-2 rounded-full border border-border flex-row items-center">
              <Share2 size={12} className="text-primary" />
              <Text className="text-foreground text-[11px] font-bold ml-1.5">Share</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={onRegenerate} className="px-3 py-2 rounded-full border border-border flex-row items-center">
              <RefreshCw size={12} className="text-primary" />
              <Text className="text-foreground text-[11px] font-bold ml-1.5">Regenerate</Text>
            </Pressable>
          </View>

          <Text className="text-foreground text-xs font-semibold mt-4 mb-1.5">Extend Expiry</Text>
          <View className="flex-row flex-wrap gap-2">
            {extendPresets.map((preset) => (
              <Pressable key={preset.label} disabled={busy} onPress={() => onExtend(preset.hours)} className="px-3 py-2 rounded-full border border-border">
                <Text className="text-foreground text-[11px] font-bold">{preset.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-foreground text-xs font-semibold mt-4 mb-1.5">Permissions</Text>
          {permissionsError ? <Text className="text-red-500 text-[11px] mb-2">{permissionsError}</Text> : null}
          {permissionsLoading ? (
            <ActivityIndicator color="#E91E63" />
          ) : permissions ? (
            <View>
              {permissionFields.map((field) => (
                <View key={field.key} className="flex-row items-center justify-between py-1.5">
                  <Text className="text-foreground text-xs font-semibold">{field.label}</Text>
                  <Switch
                    disabled={permissionsSaving}
                    value={permissions[field.key]}
                    onValueChange={(value) => void flipPermission(field.key, value)}
                    trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }}
                    thumbColor={permissions[field.key] ? "#E91E63" : "#FFFFFF"}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-muted-foreground text-xs">Permissions unavailable.</Text>
          )}
        </View>
      ) : null}
    </CRMCard>
  );
}

export default function AdminCrmWorkspaces() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<CrmFieldWorkspaceWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<WorkspaceStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setWorkspaces(await CrmWorkspaceService.list());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => CrmWorkspaceService.subscribe(() => void load(true)), [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return workspaces.filter((workspace) => {
      if (statusFilter !== "all" && effectiveStatus(workspace) !== statusFilter) return false;
      if (!trimmed) return true;
      return (
        workspace.name.toLowerCase().includes(trimmed) ||
        workspace.employee_name.toLowerCase().includes(trimmed) ||
        (workspace.cluster_name ?? "").toLowerCase().includes(trimmed)
      );
    });
  }, [workspaces, statusFilter, query]);

  const applyLocalUpdate = (updated: CrmFieldWorkspaceWithNames | { id: string } & Record<string, unknown>) => {
    setWorkspaces((current) => current.map((workspace) => (workspace.id === updated.id ? { ...workspace, ...updated } : workspace)));
  };

  const withBusy = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusyId(null);
    }
  };

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
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Workspaces</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>Manage field workspace links, expiry and permissions</Text>
        </View>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by workspace, employee or cluster"
          placeholderTextColor="#9CA3AF"
          className="h-11 border border-border rounded-2xl px-4 text-foreground bg-background mb-2"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2 py-1">
            {statusFilters.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setStatusFilter(item.key)}
                className={`px-4 py-2 rounded-full border ${statusFilter === item.key ? "bg-primary border-primary" : "border-border"}`}
              >
                <Text className={`text-xs font-semibold ${statusFilter === item.key ? "text-white" : "text-foreground"}`}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </ResponsiveContainer>

      {toast ? (
        <ResponsiveContainer>
          <View className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-2 mb-2">
            <Text className="text-emerald-600 text-xs font-semibold">{toast}</Text>
          </View>
        </ResponsiveContainer>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load(true)} /></ResponsiveSection>
          ) : null}
          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={3} />
            ) : !filtered.length ? (
              <AdminEmptyState
                title={workspaces.length ? "No workspaces match" : "No workspaces yet"}
                message={workspaces.length ? "Try a different search or status filter." : "Create one from a cluster's category screen to get started."}
              />
            ) : (
              <View className="gap-3">
                {filtered.map((workspace) => (
                  <WorkspaceRow
                    key={workspace.id}
                    workspace={workspace}
                    busy={busyId === workspace.id}
                    onSetStatus={(status) => void withBusy(workspace.id, async () => {
                      const updated = await CrmWorkspaceService.setStatus(workspace.id, status);
                      applyLocalUpdate(updated);
                      setToast(`Workspace ${workspaceStatusLabels[status].toLowerCase()}.`);
                    })}
                    onExtend={(hours) => void withBusy(workspace.id, async () => {
                      const newExpiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();
                      const updated = await CrmWorkspaceService.extendExpiry(workspace.id, newExpiresAt);
                      applyLocalUpdate(updated);
                      setToast("Expiry extended.");
                    })}
                    onRegenerate={() => void withBusy(workspace.id, async () => {
                      const updated = await CrmWorkspaceService.regenerateToken(workspace.id);
                      applyLocalUpdate(updated);
                      setToast("Link regenerated — the old link no longer works.");
                    })}
                    onCopy={() => void withBusy(workspace.id, async () => {
                      await copyWorkspaceLink(workspace.token);
                      setToast("Link copied.");
                    })}
                    onShare={() => void withBusy(workspace.id, async () => {
                      await shareWorkspaceLink(workspace.token, workspace.name);
                    })}
                    onLoadPermissions={() => CrmWorkspaceService.getPermissions(workspace.id)}
                    onSavePermissions={async (permissions) => {
                      await CrmWorkspaceService.updatePermissions(workspace.id, permissions);
                    }}
                  />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
