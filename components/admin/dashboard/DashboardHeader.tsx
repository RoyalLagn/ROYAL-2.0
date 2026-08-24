import React from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { adminPalette } from "@/theme";

export function DashboardHeader({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) {
  const { identity } = useAdminAuth();
  return <ResponsiveContainer
    className="border-b border-border bg-background"
    style={{ maxWidth: 1440, alignSelf: "center", width: "100%" }}
  >
    <AdminPageHeader
      title="Admin Dashboard"
      subtitle={`Welcome back, ${identity?.profile.full_name || "Administrator"}`}
      action={<View className="flex-row items-center gap-2">
        <Pressable accessibilityLabel="Refresh dashboard" accessibilityState={{ disabled: refreshing, busy: refreshing }} disabled={refreshing} className="min-w-11 min-h-11 rounded-xl border border-border bg-card items-center justify-center active:opacity-70" style={({ pressed }) => ({ transitionProperty: "transform, opacity", transitionDuration: "160ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", ...(pressed ? { transform: [{ scale: 0.97 }], opacity: 0.82 } : {}) } as any)} onPress={onRefresh}>{refreshing ? <ActivityIndicator size="small" color={adminPalette.brand} /> : <RefreshCw size={18} className="text-primary" />}</Pressable>
      </View>}
    />
  </ResponsiveContainer>;
}
