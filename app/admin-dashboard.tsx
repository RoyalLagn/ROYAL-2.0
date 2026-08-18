import React from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
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
import { DashboardClipViewsChart } from "@/components/admin/dashboard/DashboardClipViewsChart";

function DashboardContent() {
  const { snapshot, loading, refreshing, refresh } = useAdminDashboard();
  const { width } = useWindowDimensions();
  const statistics = snapshot?.statistics.data;
  const health = snapshot?.health.data;
  const desktop = width >= 1120;
  const updatedAt = snapshot?.loadedAt ?? Date.now();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <DashboardHeader refreshing={refreshing} onRefresh={() => void refresh()} health={health} />

        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          <ResponsiveSection>
            <DashboardWidget title="Platform Overview" subtitle={`Live platform workload · Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} icon={LayoutGrid} loading={loading && !snapshot} error={snapshot?.statistics.error} onRefresh={() => void refresh()}>
              {statistics ? <StatisticsGrid statistics={statistics} /> : <DashboardEmpty message="Statistics are currently unavailable." />}
            </DashboardWidget>
          </ResponsiveSection>

          <View className={desktop ? "flex-row gap-5 items-start" : "gap-0"} style={{ zIndex: 20 }}>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <ResponsiveSection>
                <DashboardWidget title="Pending Tasks" subtitle="Current administrator workload" icon={ListTodo} loading={loading && !snapshot} error={snapshot?.statistics.error || snapshot?.health.error} onRefresh={() => void refresh()}>
                  {statistics && health ? <PendingTasks statistics={statistics} health={health} /> : <DashboardEmpty message="Tasks are unavailable." />}
                </DashboardWidget>
              </ResponsiveSection>
            </View>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <ResponsiveSection>
                <DashboardClipViewsChart />
              </ResponsiveSection>
            </View>
          </View>

          <ResponsiveSection style={{ zIndex: 10 }}>
            <EquityRevenueDashboard />
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
