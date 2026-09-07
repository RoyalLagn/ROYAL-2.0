import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bell, CheckCheck, ChevronRight, Inbox } from "lucide-react-native";
import { useRouter } from "expo-router";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { adminNotificationTarget, listAdminNotifications, markAdminNotificationRead, markAllAdminNotificationsRead, subscribeToAdminNotifications, type AdminNotification } from "@/services/adminNotifications";

const sortUnreadFirst = (items: AdminNotification[]) => [...items].sort(
  (a, b) => Number(a.is_read) - Number(b.is_read)
    || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
);

export default function AdminNotifications() {
  const router = useRouter();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (refresh = false) => { if (refresh) setRefreshing(true); else setLoading(true); setError(""); try { setItems(await listAdminNotifications()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load notifications."); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { void load(); return subscribeToAdminNotifications(() => void load(true)); }, [load]);
  const open = async (item: AdminNotification) => { if (!item.is_read) { await markAdminNotificationRead(item.id); setItems((current) => sortUnreadFirst(current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry))); } const target = adminNotificationTarget(item); if (target) router.push(target as never); };
  const unread = items.filter((item) => !item.is_read).length;
  return <SafeAreaView className="flex-1 bg-background" edges={["top","left","right"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />} contentContainerStyle={{paddingBottom:72}}><ResponsiveContainer><AdminPageHeader title="Admin notifications" subtitle={unread ? `${unread} unread operational ${unread === 1 ? "notification" : "notifications"}` : "You are up to date"} action={unread ? <Pressable accessibilityLabel="Mark all notifications as read" onPress={() => void markAllAdminNotificationsRead().then(() => setItems((current) => sortUnreadFirst(current.map((item) => ({...item,is_read:true}))))) } className="w-11 h-11 rounded-xl border border-border items-center justify-center"><CheckCheck size={19} className="text-primary" /></Pressable> : undefined} />
    {loading ? <ActivityIndicator className="my-12" /> : error ? <Text accessibilityRole="alert" className="text-destructive text-sm py-5">{error}</Text> : !items.length ? <View className="bg-card border border-border rounded-2xl items-center py-12 px-6"><View className="w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center"><Inbox size={25} className="text-primary" /></View><Text className="text-foreground text-lg font-bold mt-4">No notifications yet</Text><Text className="text-muted-foreground text-sm text-center mt-2">Vendor approvals and deletion requests will appear here.</Text></View> : <View className="bg-card border border-border rounded-2xl overflow-hidden">{items.map((item,index)=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.is_read ? "Read" : "Unread"}: ${item.title}`} onPress={()=>void open(item)} className={`${index ? "border-t border-border" : ""} min-h-20 p-4 flex-row items-center active:opacity-70`}><View className={`${item.is_read ? "bg-muted" : "bg-primary/10"} w-11 h-11 rounded-xl items-center justify-center`}><Bell size={19} className={item.is_read ? "text-muted-foreground" : "text-primary"} /></View><View className="flex-1 min-w-0 ml-3"><View className="flex-row items-center"><Text numberOfLines={2} className="text-foreground text-sm font-bold flex-1">{item.title}</Text>{!item.is_read&&<View accessibilityLabel="Unread" className="w-2.5 h-2.5 rounded-full bg-primary ml-2" />}</View>{item.body&&<Text numberOfLines={2} className="text-muted-foreground text-xs leading-5 mt-1">{item.body}</Text>}<Text className="text-muted-foreground text-xs mt-1">{new Date(item.created_at).toLocaleString()}</Text></View>{adminNotificationTarget(item)&&<ChevronRight size={17} className="text-muted-foreground ml-2" />}</Pressable>)}</View>}
  </ResponsiveContainer></ScrollView><AdminFooter activeTab="dashboard" /></SafeAreaView>;
}
