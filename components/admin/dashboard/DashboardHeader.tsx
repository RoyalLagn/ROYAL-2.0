import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { DashboardHealth } from "@/types/adminDashboard";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export function DashboardHeader({ refreshing, onRefresh, health }: { refreshing: boolean; onRefresh: () => void; health?: DashboardHealth | null }) {
  const { identity } = useAdminAuth();
  const unavailable = health ? Object.entries(health).filter(([key, value]) => key !== "lastCheckedAt" && value === "unavailable").length : null;
  const healthy = unavailable === 0;
  return <ResponsiveContainer>
    <AdminPageHeader
      title="Admin Dashboard"
      subtitle={`Welcome back, ${identity?.profile.full_name || "Administrator"}`}
      action={<View className="flex-row items-center gap-2">
        {unavailable !== null ? <View className={`hidden md:flex min-h-9 px-3 rounded-xl flex-row items-center ${healthy ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>{healthy ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertTriangle size={15} className="text-amber-600" />}<Text className={`text-xs font-semibold ml-2 ${healthy ? "text-emerald-700" : "text-amber-700"}`}>{healthy ? "All systems operational" : `${unavailable} system warning${unavailable === 1 ? "" : "s"}`}</Text></View> : null}
        <Pressable accessibilityLabel="Refresh dashboard" accessibilityState={{ disabled: refreshing, busy: refreshing }} disabled={refreshing} className="min-w-11 min-h-11 rounded-xl border border-border bg-card items-center justify-center active:opacity-70" onPress={onRefresh}>{refreshing ? <ActivityIndicator size="small" color="#E91E63" /> : <RefreshCw size={18} className="text-primary" />}</Pressable>
      </View>}
    />
  </ResponsiveContainer>;
}
