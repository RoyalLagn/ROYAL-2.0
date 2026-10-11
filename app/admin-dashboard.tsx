import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AdminFooter from "@/components/AdminFooter";
import { AdminDashboardProvider, useAdminDashboard } from "@/context/AdminDashboardContext";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { StatisticsGrid } from "@/components/admin/dashboard/StatisticsGrid";
import {
  DashboardEmpty,
} from "@/components/admin/dashboard/DashboardStates";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import { PendingTasks } from "@/components/admin/dashboard/PendingTasks";
import { LayoutGrid, ListTodo, ShieldCheck } from "lucide-react-native";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { EquityRevenueDashboard } from "@/components/admin/revenue/EquityRevenueDashboard";
import { AdminBookingsWidget } from "@/components/admin/dashboard/AdminBookingsWidget";
import { useAppTheme } from "@/components/ThemeProvider";

function DashboardContent() {
  const router = useRouter();
  const { snapshot, loading, refreshing, refresh } = useAdminDashboard();
  const { colorScheme } = useAppTheme();
  const { width } = useWindowDimensions();
  const statistics = snapshot?.statistics.data;
  const desktop = width >= 1120;
  const updatedAt = snapshot?.loadedAt ?? Date.now();
  const royal = colorScheme !== "dark";
  return (
    <SafeAreaView className={royal ? undefined : "flex-1 bg-background"} style={{ flex: 1, backgroundColor: royal ? "#F5F8FC" : undefined }} edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        // Native momentum keeps the admin workspace feeling deliberate on
        // touch devices while the content remains a normal, accessible scroll.
        decelerationRate="normal"
        contentContainerStyle={{ paddingBottom: 72 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <DashboardHeader royal={royal} refreshing={refreshing} onRefresh={() => void refresh()} />

        <ResponsiveContainer style={{ maxWidth: 1600, alignSelf: "center" }}>
          {/* Team Portal Quick Access Banner */}
          <ResponsiveSection>
            <Pressable
              onPress={() => router.push("/team")}
              className="bg-card border border-border rounded-3xl p-4 sm:p-5 flex-row items-center justify-between shadow-sm hover:border-primary/40 active:opacity-85 transition-colors"
            >
              <View className="flex-row items-center gap-3.5 flex-1">
                <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
                  <ShieldCheck size={24} color="#E11D48" />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-bold text-base">RoyalLagn Team Portal</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Shared operational queues: payment verifications, tiered manual withdrawals & vendor approvals
                  </Text>
                </View>
              </View>
              <View className="px-4 py-2 rounded-xl bg-primary items-center justify-center ml-2">
                <Text className="text-white text-xs font-bold">Open Portal →</Text>
              </View>
            </Pressable>
          </ResponsiveSection>

          {/* Direct Bookings Widget with 3 Tabs and Bookings Button */}
          <ResponsiveSection>
            <AdminBookingsWidget royal={royal} />
          </ResponsiveSection>

          <ResponsiveSection>
            <DashboardWidget royal={royal} title="Platform Overview" subtitle={`Live platform workload · Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`} icon={LayoutGrid} loading={loading && !snapshot} error={snapshot?.statistics.error} onRefresh={() => void refresh()}>
              {statistics ? <StatisticsGrid statistics={statistics} royal={royal} /> : <DashboardEmpty message="Statistics are currently unavailable." />}
            </DashboardWidget>
          </ResponsiveSection>

          <View className={desktop ? "flex-row gap-6 items-start" : "gap-0"} style={{ zIndex: 20 }}>
            <View style={desktop ? { flex: 1, minWidth: 0 } : undefined}>
              <ResponsiveSection>
                <DashboardWidget royal={royal} title="Pending Tasks" subtitle="Current administrator workload" icon={ListTodo} loading={loading && !snapshot} error={snapshot?.statistics.error || snapshot?.health.error} onRefresh={() => void refresh()}>
                  {statistics ? <PendingTasks statistics={statistics} royal={royal} /> : <DashboardEmpty message="Tasks are unavailable." />}
                </DashboardWidget>
              </ResponsiveSection>
            </View>
            
          </View>

          <ResponsiveSection style={{ zIndex: 10 }}>
            <EquityRevenueDashboard royal={royal} />
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
