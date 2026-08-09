import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IndianRupee, RefreshCw } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { StatisticsGrid } from "@/components/admin/dashboard/StatisticsGrid";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminDashboardService } from "@/services/adminDashboardService";
import { SubscriptionAdminService } from "@/subscriptions/services/SubscriptionAdminService";
import type { AdminDashboardSnapshot } from "@/types/adminDashboard";

export default function AdminReports() {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (refresh = false) => { if (refresh) setRefreshing(true); else setLoading(true); setError(null); try { const [next, paymentRows] = await Promise.all([AdminDashboardService.load(true), SubscriptionAdminService.listPayments()]); setSnapshot(next); setPayments(paymentRows as Record<string, unknown>[]); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load reports."); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const paid = payments.filter((item) => ["verified"].includes(String(item.payment_status ?? "").toLowerCase()));
  const revenue = paid.reduce((sum, item) => sum + Number(item.amount ?? item.amount_paid ?? 0), 0);
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
    <ResponsiveContainer><AdminPageHeader title="Reports" subtitle="Live platform and payment summaries" action={<Pressable accessibilityLabel="Refresh reports" onPress={() => void load(true)} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
      {loading ? <AdminLoadingState label="Loading reports…" /> : error ? <AdminErrorState message={error} onRetry={() => void load()} /> : <>
        <Text className="text-foreground font-bold mb-3">Payment summary</Text><View className="flex-row flex-wrap gap-3"><ReportMetric label="Payment records" value={String(payments.length)} /><ReportMetric label="Verified payments" value={String(paid.length)} /><ReportMetric label="Verified revenue" value={`₹${revenue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} icon={IndianRupee} /></View>
        <Text className="text-foreground font-bold mt-7 mb-3">Platform records</Text>{snapshot?.statistics.data ? <StatisticsGrid statistics={snapshot.statistics.data} updatedAt={snapshot.loadedAt} /> : snapshot?.statistics.error ? <AdminErrorState message={snapshot.statistics.error} /> : null}
        <Text className="text-foreground font-bold mt-7 mb-3">Platform services</Text><View className="bg-card border border-border rounded-2xl overflow-hidden">{snapshot?.health.data ? Object.entries(snapshot.health.data).filter(([key]) => key !== "lastCheckedAt").map(([key, value], index) => <View key={key} className={index ? "min-h-12 px-4 flex-row items-center border-t border-border" : "min-h-12 px-4 flex-row items-center"}><Text className="text-foreground text-sm capitalize flex-1">{key.replaceAll("_", " ")}</Text><Text className={value === "online" || value === "configured" ? "text-emerald-600 text-xs font-semibold capitalize" : "text-amber-600 text-xs font-semibold capitalize"}>{value}</Text></View>) : <Text className="text-muted-foreground text-xs p-4">Service status is unavailable.</Text>}</View>
      </>}
    </ResponsiveContainer>
  </ScrollView><AdminFooter activeTab="profile" /></SafeAreaView>;
}
function ReportMetric({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) { return <View className="bg-card border border-border rounded-2xl p-4 min-w-44 flex-1">{Icon ? <Icon size={17} className="text-primary mb-2" /> : null}<Text className="text-foreground text-2xl font-bold">{value}</Text><Text className="text-muted-foreground text-xs mt-1">{label}</Text></View>; }
