import React from "react";
import { Pressable } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { DashboardHealth } from "@/types/adminDashboard";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";

export function DashboardHeader({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void; health?: DashboardHealth | null }) {
  const { identity } = useAdminAuth();
  return <ResponsiveContainer>
    <AdminPageHeader
      title="Admin Dashboard"
      subtitle={`Welcome back, ${identity?.profile.full_name || "Administrator"}`}
      action={<Pressable accessibilityLabel="Refresh dashboard" disabled={refreshing} className="min-w-11 min-h-11 items-center justify-center" onPress={onRefresh}><RefreshCw size={20} className="text-primary" /></Pressable>}
    />
  </ResponsiveContainer>;
}
