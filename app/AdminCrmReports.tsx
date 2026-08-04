import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Edit3 } from "lucide-react-native";
import { AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { PieChart } from "@/components/admin/crm/charts/PieChart";
import { BarChart } from "@/components/admin/crm/charts/BarChart";
import { LineChart } from "@/components/admin/crm/charts/LineChart";
import { ProgressRing } from "@/components/admin/crm/charts/ProgressRing";
import { territoryCompletion } from "@/types/crm/territory";
import {
  CrmReportService,
  type CategoryBreakdownItem,
  type ConversionRates,
  type DailyRegistrationPoint,
  type ExecutivePerformanceItem,
} from "@/services/crm/reportService";
import type { CrmTerritoryNode } from "@/types/crm/territory";

const periods = [7, 30, 90];

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load reports.";
}

function ConversionCard({ label, value }: { label: string; value: number }) {
  return (
    <CRMCard className="p-4 flex-1 min-w-[140px]">
      <Text className="text-primary text-2xl font-bold">{value}%</Text>
      <Text className="text-muted-foreground text-xs mt-1">{label}</Text>
    </CRMCard>
  );
}

const coverageColor = (percent: number) => (percent >= 70 ? "#10B981" : percent >= 35 ? "#F59E0B" : "#EF4444");

export default function AdminCrmReports() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(30);

  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [districts, setDistricts] = useState<CrmTerritoryNode[]>([]);
  const [executives, setExecutives] = useState<ExecutivePerformanceItem[]>([]);
  const [daily, setDaily] = useState<DailyRegistrationPoint[]>([]);
  const [conversion, setConversion] = useState<ConversionRates | null>(null);
  const [target, setTarget] = useState(50);
  const [monthToDate, setMonthToDate] = useState(0);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState("50");
  const [savingTarget, setSavingTarget] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [categoryRows, districtRows, executiveRows, dailyRows, conversionRows, targetValue, monthToDateValue] = await Promise.all([
        CrmReportService.categoryBreakdown(),
        CrmReportService.districtPerformance(),
        CrmReportService.executivePerformance(),
        CrmReportService.dailyRegistrations(period),
        CrmReportService.conversionRates(),
        CrmReportService.getTarget(),
        CrmReportService.registrationsThisMonth(),
      ]);
      setCategories(categoryRows);
      setDistricts(districtRows);
      setExecutives(executiveRows);
      setDaily(dailyRows);
      setConversion(conversionRows);
      setTarget(targetValue);
      setTargetDraft(String(targetValue));
      setMonthToDate(monthToDateValue);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const saveTarget = async () => {
    const value = Number(targetDraft);
    if (!Number.isFinite(value) || value < 0) return;
    setSavingTarget(true);
    try {
      await CrmReportService.setTarget(value);
      setTarget(value);
      setEditingTarget(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSavingTarget(false);
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
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Reports</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>Conversion, coverage and team performance</Text>
        </View>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load(true)} /></ResponsiveSection> : null}

          {loading ? (
            <ResponsiveSection><CrmSkeletonGrid count={4} /></ResponsiveSection>
          ) : (
            <>
              <ResponsiveSection>
                <View className="flex-row flex-wrap gap-3">
                  <ConversionCard label="Registration Conversion" value={conversion?.registrationConversion ?? 0} />
                  <ConversionCard label="Premium Conversion" value={conversion?.premiumConversion ?? 0} />
                  <ConversionCard label="Call Conversion" value={conversion?.callConversion ?? 0} />
                  <ConversionCard label="Meeting Conversion" value={conversion?.meetingConversion ?? 0} />
                </View>
              </ResponsiveSection>

              <ResponsiveSection>
                <CRMCard className="p-4 items-center">
                  <View className="flex-row items-center justify-between w-full mb-2">
                    <Text className="text-foreground text-sm font-bold">Monthly Sales Target</Text>
                    <Pressable accessibilityLabel="Edit target" onPress={() => setEditingTarget((current) => !current)}>
                      <Edit3 size={16} className="text-primary" />
                    </Pressable>
                  </View>
                  {editingTarget ? (
                    <View className="flex-row items-center gap-2 mb-3 w-full">
                      <TextInput
                        value={targetDraft}
                        onChangeText={setTargetDraft}
                        keyboardType="numeric"
                        className="flex-1 h-11 border border-border rounded-2xl px-3 text-foreground bg-background"
                      />
                      <Pressable disabled={savingTarget} onPress={() => void saveTarget()} className="px-4 h-11 rounded-2xl bg-primary items-center justify-center">
                        {savingTarget ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-xs font-bold">Save</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                  <ProgressRing value={monthToDate} total={target} label="Vendors registered this month" />
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <Text className="text-foreground text-sm font-bold mb-2">Vendor Categories</Text>
                <CRMCard className="p-4">
                  <PieChart data={categories.map((item) => ({ label: item.name, value: item.count }))} />
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <Text className="text-foreground text-sm font-bold mb-2">District Performance</Text>
                <CRMCard className="p-4">
                  <BarChart data={districts.slice(0, 8).map((district) => ({
                    label: district.name, value: district.vendor_count,
                    sublabel: `${district.vendor_count} (${territoryCompletion(district)}%)`,
                  }))} />
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <Text className="text-foreground text-sm font-bold mb-2">Marketing Coverage</Text>
                <CRMCard className="p-4">
                  {!districts.length ? (
                    <Text className="text-muted-foreground text-xs">No coverage data yet.</Text>
                  ) : (
                    <View className="flex-row flex-wrap gap-2">
                      {districts.map((district) => {
                        const percent = territoryCompletion(district);
                        return (
                          <View key={district.id} className="px-3 py-2 rounded-xl" style={{ backgroundColor: `${coverageColor(percent)}22` }}>
                            <Text className="text-[11px] font-bold" style={{ color: coverageColor(percent) }}>{district.name}</Text>
                            <Text className="text-[9px] mt-0.5" style={{ color: coverageColor(percent) }}>{percent}% registered</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-foreground text-sm font-bold">Daily Registrations</Text>
                  <View className="flex-row gap-1">
                    {periods.map((value) => (
                      <Pressable
                        key={value}
                        onPress={() => setPeriod(value)}
                        className={`px-2.5 py-1 rounded-full border ${period === value ? "bg-primary border-primary" : "border-border"}`}
                      >
                        <Text className={`text-[10px] font-bold ${period === value ? "text-white" : "text-foreground"}`}>{value}d</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <CRMCard className="p-4">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart data={daily} />
                  </ScrollView>
                </CRMCard>
              </ResponsiveSection>

              <ResponsiveSection>
                <Text className="text-foreground text-sm font-bold mb-2">Executive Performance</Text>
                <CRMCard className="p-4">
                  <BarChart data={executives.map((executive) => ({
                    label: executive.name, value: executive.total,
                    sublabel: `${executive.total} · ${executive.registered} registered`,
                  }))} />
                </CRMCard>
              </ResponsiveSection>
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
