import React from "react";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminFooter from "@/components/AdminFooter";
import { AdminDashboardProvider, useAdminDashboard } from "@/context/AdminDashboardContext";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { StatisticsGrid } from "@/components/admin/dashboard/StatisticsGrid";
import { QuickActions } from "@/components/admin/dashboard/QuickActions";
import { RecentApplications } from "@/components/admin/dashboard/RecentApplications";
import { RecentUsers } from "@/components/admin/dashboard/RecentUsers";
import { RecentActivity } from "@/components/admin/dashboard/RecentActivity";
import { SystemHealth } from "@/components/admin/dashboard/SystemHealth";
import {
  DashboardEmpty,
} from "@/components/admin/dashboard/DashboardStates";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import { TodaySummary } from "@/components/admin/dashboard/TodaySummary";
import { PendingTasks } from "@/components/admin/dashboard/PendingTasks";
import { PriorityAlerts } from "@/components/admin/dashboard/PriorityAlerts";
import { Activity, AlertTriangle, ClipboardCheck, HeartPulse, LayoutGrid, ListTodo, Users } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveColumns } from "@/components/responsive/ResponsiveColumns";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";

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
          <DashboardWidget title="Platform Overview" subtitle="Live platform workload" icon={LayoutGrid} loading={loading && !snapshot} error={snapshot?.statistics.error} onRefresh={() => void refresh()}>
            {statistics ? <StatisticsGrid statistics={statistics} updatedAt={snapshot?.loadedAt ?? Date.now()} /> : <DashboardEmpty message="Statistics are currently unavailable." />}
          </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
          <DashboardWidget title="Today's Summary" subtitle="Activity since midnight" icon={ClipboardCheck} loading={loading && !snapshot} error={snapshot?.statistics.error} onRefresh={() => void refresh()}>
            {statistics ? <TodaySummary data={statistics} /> : <DashboardEmpty message="Today's activity is unavailable." />}
          </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
          <ResponsiveColumns>
              <DashboardWidget title="Pending Tasks" subtitle="Current administrator workload" icon={ListTodo} loading={loading && !snapshot} error={snapshot?.statistics.error || snapshot?.health.error} onRefresh={() => void refresh()}>
                {statistics && health ? <PendingTasks statistics={statistics} health={health} /> : <DashboardEmpty message="Tasks are unavailable." />}
              </DashboardWidget>
              <DashboardWidget title="Priority Alerts" subtitle="Issues that may require attention" icon={AlertTriangle} loading={loading && !snapshot} error={snapshot?.health.error} onRefresh={() => void refresh()}>
                {statistics && health ? <PriorityAlerts statistics={statistics} health={health} /> : <DashboardEmpty message="Alerts are unavailable." />}
              </DashboardWidget>
          </ResponsiveColumns>
          </ResponsiveSection>

          <ResponsiveSection>
          <DashboardWidget title="Quick Actions" subtitle="Navigate to administrator workspaces" icon={Activity}>
            <QuickActions />
          </DashboardWidget>
          </ResponsiveSection>

          <ResponsiveSection>
          <ResponsiveColumns>
              <DashboardWidget title="Recent Applications" subtitle="Latest vendor applications" icon={ListTodo} loading={loading && !snapshot} error={snapshot?.applications.error} empty={!snapshot?.applications.data?.length} emptyMessage="No vendor applications yet." onRefresh={() => void refresh()}>
                <RecentApplications items={snapshot?.applications.data ?? []} />
              </DashboardWidget>
              <DashboardWidget title="Recent Public Users" subtitle="Newest customer registrations" icon={Users} loading={loading && !snapshot} error={snapshot?.users.error} empty={!snapshot?.users.data?.length} emptyMessage="No public users have registered yet." onRefresh={() => void refresh()}>
                <RecentUsers items={snapshot?.users.data ?? []} />
              </DashboardWidget>
          </ResponsiveColumns>
          </ResponsiveSection>

          <ResponsiveSection>
          <ResponsiveColumns>
              <DashboardWidget title="Recent Activity" subtitle="Newest platform events first" icon={Activity} loading={loading && !snapshot} error={snapshot?.activity.error} empty={!snapshot?.activity.data?.length} emptyMessage="No recent platform activity." onRefresh={() => void refresh()}>
                <RecentActivity items={snapshot?.activity.data ?? []} />
              </DashboardWidget>
              <DashboardWidget title="System Health" subtitle="Live service availability" icon={HeartPulse} loading={loading && !snapshot} error={snapshot?.health.error} onRefresh={() => void refresh()}>
                {health ? <SystemHealth health={health} /> : <DashboardEmpty message="System health is unavailable." />}
              </DashboardWidget>
          </ResponsiveColumns>
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
