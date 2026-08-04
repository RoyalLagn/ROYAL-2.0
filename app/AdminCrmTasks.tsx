import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Phone } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveSection } from "@/components/responsive/ResponsiveSection";
import { CRMCard } from "@/components/admin/crm/ui/CRMCard";
import { CrmSkeletonGrid } from "@/components/admin/crm/ui/SkeletonLoader";
import { CrmFollowupService } from "@/services/crm/followupService";
import { CrmTaskService, type CrmTaskDocumentItem, type CrmTaskFollowupItem } from "@/services/crm/taskService";

type TaskTab = "calls" | "meetings" | "followups" | "documents";
const tabs: { key: TaskTab; label: string }[] = [
  { key: "calls", label: "Today's Calls" },
  { key: "meetings", label: "Today's Meetings" },
  { key: "followups", label: "Today's Follow-ups" },
  { key: "documents", label: "Pending Documents" },
];

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load tasks.";
}

function FollowupRow({ item, onComplete }: { item: CrmTaskFollowupItem; onComplete: () => void }) {
  const router = useRouter();
  return (
    <CRMCard className="p-3">
      <Pressable onPress={() => router.push({ pathname: "/AdminCrmVendorProfile", params: { vendorId: item.vendor_id } })} className="min-h-11">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 min-w-0 pr-2">
            <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{item.business_name}</Text>
            <Text className="text-muted-foreground text-xs mt-1">
              {item.scheduled_time ? `${item.scheduled_time} · ` : ""}{item.priority} priority
            </Text>
            {item.notes ? <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{item.notes}</Text> : null}
          </View>
          {item.phone ? (
            <Pressable onPress={() => void Linking.openURL(`tel:${item.phone}`)} className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
              <Phone size={15} className="text-primary" />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
      <Pressable onPress={onComplete} className="mt-3 pt-3 border-t border-border self-start">
        <Text className="text-emerald-500 text-[11px] font-bold">Mark done</Text>
      </Pressable>
    </CRMCard>
  );
}

function DocumentRow({ item }: { item: CrmTaskDocumentItem }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push({ pathname: "/AdminCrmVendorProfile", params: { vendorId: item.vendor_id } })} className="min-h-11">
      <CRMCard className="p-3 flex-row items-center justify-between">
        <View className="flex-1 min-w-0 pr-2">
          <Text className="text-foreground text-sm font-bold" numberOfLines={1}>{item.business_name}</Text>
          <Text className="text-muted-foreground text-xs mt-1">{item.category_name ?? "Uncategorized"}</Text>
        </View>
        {item.phone ? (
          <Pressable onPress={() => void Linking.openURL(`tel:${item.phone}`)} className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
            <Phone size={15} className="text-primary" />
          </Pressable>
        ) : null}
      </CRMCard>
    </Pressable>
  );
}

export default function AdminCrmTasks() {
  const router = useRouter();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: TaskTab }>();
  const [tab, setTab] = useState<TaskTab>(initialTab && tabs.some((item) => item.key === initialTab) ? initialTab : "calls");
  const [followups, setFollowups] = useState<CrmTaskFollowupItem[]>([]);
  const [documents, setDocuments] = useState<CrmTaskDocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      if (tab === "documents") {
        setDocuments(await CrmTaskService.pendingDocumentVendors());
      } else {
        const type = tab === "calls" ? "call" : tab === "meetings" ? "meeting" : null;
        setFollowups(await CrmTaskService.todaysFollowups(type));
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const completeFollowup = async (id: string) => {
    try {
      await CrmFollowupService.setStatus(id, "completed");
      await load(true);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const emptyCopy: Record<TaskTab, { title: string; message: string }> = {
    calls: { title: "No calls scheduled today", message: "Follow-ups of type Call scheduled for today will show up here." },
    meetings: { title: "No meetings scheduled today", message: "Follow-ups of type Meeting scheduled for today will show up here." },
    followups: { title: "No follow-ups due today", message: "Everything scheduled for today across all types will show up here." },
    documents: { title: "No vendors waiting on documents", message: "Vendors with status \"Documents Pending\" will show up here." },
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
          <Text className="text-foreground text-xl font-bold" numberOfLines={1}>Today&apos;s Tasks</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>What the field team needs to do today</Text>
        </View>
      </ResponsiveContainer>

      <ResponsiveContainer>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <View className="flex-row gap-2 py-1">
            {tabs.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                className={`px-4 py-2 rounded-full border ${tab === item.key ? "bg-primary border-primary" : "border-border"}`}
              >
                <Text className={`text-xs font-semibold ${tab === item.key ? "text-white" : "text-foreground"}`}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </ResponsiveContainer>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          {error ? (
            <ResponsiveSection><AdminErrorState message={error} onRetry={() => void load(true)} /></ResponsiveSection>
          ) : null}
          <ResponsiveSection>
            {loading ? (
              <CrmSkeletonGrid count={3} />
            ) : tab === "documents" ? (
              !documents.length ? (
                <AdminEmptyState title={emptyCopy.documents.title} message={emptyCopy.documents.message} />
              ) : (
                <View className="gap-3">
                  {documents.map((item) => <DocumentRow key={item.vendor_id} item={item} />)}
                </View>
              )
            ) : !followups.length ? (
              <AdminEmptyState title={emptyCopy[tab].title} message={emptyCopy[tab].message} />
            ) : (
              <View className="gap-3">
                {followups.map((item) => (
                  <FollowupRow key={item.id} item={item} onComplete={() => void completeFollowup(item.id)} />
                ))}
              </View>
            )}
          </ResponsiveSection>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
