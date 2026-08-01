import React from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminFooter from "@/components/AdminFooter";
import { AdminDashboardProvider, useAdminDashboard } from "@/context/AdminDashboardContext";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { StatisticsGrid } from "@/components/admin/dashboard/StatisticsGrid";
import {
  DashboardEmpty,
} from "@/components/admin/dashboard/DashboardStates";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import { PendingTasks } from "@/components/admin/dashboard/PendingTasks";
import { LayoutGrid, ListTodo } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { EquityRevenueDashboard } from "@/components/admin/revenue/EquityRevenueDashboard";

function DashboardContent() {
  const { snapshot, loading, refreshing, refresh } = useAdminDashboard();
  const statistics = snapshot?.statistics.data;
  const health = snapshot?.health.data;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <DashboardHeader refreshing={refreshing} onRefresh={() => void refresh()} health={health} />

        <ResponsiveContainer>
          <ResponsiveSection>
            <EquityRevenueDashboard />
          </ResponsiveSection>

          <ResponsiveSection>
          <DashboardWidget title="Platform Overview" subtitle="Live platform workload" icon={LayoutGrid} loading={loading && !snapshot} error={snapshot?.statistics.error} onRefresh={() => void refresh()}>
            {statistics ? <StatisticsGrid statistics={statistics} updatedAt={snapshot?.loadedAt ?? Date.now()} /> : <DashboardEmpty message="Statistics are currently unavailable." />}
          </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
            <DashboardWidget title="Pending Tasks" subtitle="Current administrator workload" icon={ListTodo} loading={loading && !snapshot} error={snapshot?.statistics.error || snapshot?.health.error} onRefresh={() => void refresh()}>
              {statistics && health ? <PendingTasks statistics={statistics} health={health} /> : <DashboardEmpty message="Tasks are unavailable." />}
            </DashboardWidget>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="dashboard" />
    </SafeAreaView>
  );
}

export default function AdminDashboard() {
  return (
    <AdminDashboardProvider>
      <DashboardContent />
    </AdminDashboardProvider>
  );
}
