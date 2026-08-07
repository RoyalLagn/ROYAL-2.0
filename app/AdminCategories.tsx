import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FolderTree, RefreshCw, Search, Store } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { useCategories } from "@/context/CategoryContext";

export default function AdminCategories() {
  const { categories, loading, refresh } = useCategories();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return categories.filter((category) => !needle || [category.name, category.slug, category.description].some((value) => value.toLowerCase().includes(needle))).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); }, [categories, query]);
  const reload = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };
  return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor="#E91E63" />}>
    <ResponsiveContainer><AdminPageHeader title="Categories" subtitle="Live marketplace category directory" action={<Pressable accessibilityLabel="Refresh categories" onPress={() => void reload()} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>} />
      <View className="flex-row gap-3 mb-4"><Metric icon={FolderTree} value={categories.length} label="Categories" /><Metric icon={Store} value={categories.reduce((sum, item) => sum + item.vendorCount, 0)} label="Listed vendors" /></View>
      <View className="bg-card border border-border rounded-2xl px-4 h-12 flex-row items-center mb-4"><Search size={18} className="text-muted-foreground" /><TextInput value={query} onChangeText={setQuery} placeholder="Search categories" placeholderTextColor="#8A8589" className="flex-1 h-12 ml-3 text-foreground" /></View>
      {loading ? <AdminLoadingState label="Loading categories…" /> : !filtered.length ? <AdminEmptyState title="No categories found" message="Try another search." /> : <View className="gap-3">{filtered.map((category) => { const Icon = category.icon; return <View key={category.id} className="bg-card border border-border rounded-2xl p-4 flex-row items-center"><View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: category.iconBg }}><Icon size={20} color={category.iconColor} /></View><View className="flex-1 min-w-0 ml-3"><Text className="text-foreground font-bold">{category.name}</Text><Text numberOfLines={1} className="text-muted-foreground text-xs mt-1">{category.description || category.slug}</Text></View><View className="items-end"><Text className="text-foreground font-bold">{category.vendorCount}</Text><Text className="text-muted-foreground text-caption">vendors</Text><Text className={category.isActive ? "text-emerald-600 text-caption mt-1" : "text-muted-foreground text-caption mt-1"}>{category.isActive ? "Active" : "Inactive"}</Text></View></View>; })}</View>}
    </ResponsiveContainer>
  </ScrollView><AdminFooter activeTab="profile" /></SafeAreaView>;
}
function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) { return <View className="flex-1 bg-card border border-border rounded-2xl p-4"><Icon size={18} className="text-primary" /><Text className="text-foreground text-2xl font-bold mt-2">{value}</Text><Text className="text-muted-foreground text-xs mt-1">{label}</Text></View>; }
