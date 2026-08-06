import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  Crown,
  FileWarning,
  FolderTree,
  MapPinned,
  Phone,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { AnalyticsCard } from "@/components/admin/crm/ui/AnalyticsCard";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { useCrmDashboard } from "@/hooks/crm/useCrmDashboard";

export default function AdminCrm() {
  const router = useRouter();
  const { statistics, loading, refreshing, error, refresh } = useCrmDashboard();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Vendor Acquisition CRM"
            subtitle="Field marketing pipeline — territories, leads and follow-ups"
          />

          <ResponsiveSection>
            {loading && !statistics ? (
              <CrmSkeletonGrid count={4} />
            ) : error ? (
              <AdminErrorState message={error} onRetry={() => void refresh()} />
            ) : (
              <View className="flex-row flex-wrap gap-3">
                <AnalyticsCard label="Total Vendors Tracked" value={statistics?.total ?? 0} icon={Users} tone="primary" />
                <AnalyticsCard label="Registered on RoyalLagn" value={statistics?.registered ?? 0} icon={UserCheck} tone="success" />
                <AnalyticsCard label="Premium Vendors" value={statistics?.premium ?? 0} icon={Crown} tone="warning" />
                <AnalyticsCard label="Interested Leads" value={statistics?.interested ?? 0} icon={Sparkles} tone="primary" />
                <AnalyticsCard label="Today's Calls" value={statistics?.callsPendingToday ?? 0} icon={Phone} tone="neutral" onPress={() => router.push({ pathname: "/AdminCrmTasks", params: { tab: "calls" } })} />
                <AnalyticsCard label="Today's Meetings" value={statistics?.meetingsPendingToday ?? 0} icon={CalendarClock} tone="neutral" onPress={() => router.push({ pathname: "/AdminCrmTasks", params: { tab: "meetings" } })} />
                <AnalyticsCard label="Pending Follow-ups" value={statistics?.followUpsPending ?? 0} icon={CalendarClock} tone="warning" onPress={() => router.push({ pathname: "/AdminCrmTasks", params: { tab: "followups" } })} />
                <AnalyticsCard label="Documents Pending" value={statistics?.documentsPending ?? 0} icon={FileWarning} tone="warning" onPress={() => router.push({ pathname: "/AdminCrmTasks", params: { tab: "documents" } })} />
              </View>
            )}
          </ResponsiveSection>

          <ResponsiveSection>
            <View className="flex-row items-center mb-2">
              <MapPinned size={16} className="text-primary" />
              <Text className="text-foreground text-sm font-bold ml-2">Territory</Text>
            </View>
            <CRMCard onPress={() => router.push("/AdminCrmStates")} className="p-4 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <MapPinned size={18} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0 ml-3">
                <Text className="text-foreground text-sm font-bold">Browse States → Districts → Talukas → Clusters</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Organize territory for the field team</Text>
              </View>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard onPress={() => router.push("/AdminCrmCategories")} className="p-4 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <FolderTree size={18} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0 ml-3">
                <Text className="text-foreground text-sm font-bold">Vendor Categories</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Venues, Photographers, Decorators and more</Text>
              </View>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard onPress={() => router.push("/AdminCrmWorkspaces")} className="p-4 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <ShieldCheck size={18} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0 ml-3">
                <Text className="text-foreground text-sm font-bold">Workspaces</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Manage field workspace links, expiry and permissions</Text>
              </View>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CRMCard>
          </ResponsiveSection>

          <ResponsiveSection>
            <CRMCard onPress={() => router.push("/AdminCrmReports")} className="p-4 flex-row items-center">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
                <BarChart3 size={18} className="text-primary" />
              </View>
              <View className="flex-1 min-w-0 ml-3">
                <Text className="text-foreground text-sm font-bold">Reports</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Conversion, coverage and executive performance</Text>
              </View>
              <ChevronRight size={18} className="text-muted-foreground" />
            </CRMCard>
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
