import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail, Phone, RefreshCw, Search, UserRound, Users } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminUserService, type AdminPublicUser } from "@/services/adminUsers";

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminPublicUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setUsers(await AdminUserService.list());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load public users.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return AdminUserService.subscribe(() => void load(true));
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      [user.full_name, user.email, user.phone, user.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)));
  }, [query, users]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Public User Management"
            subtitle="Live customer profiles from Supabase"
            action={<Pressable accessibilityLabel="Refresh users" className="min-w-11 min-h-11 items-center justify-center" onPress={() => void load(true)}><RefreshCw size={20} className="text-primary" /></Pressable>}
          />
        </ResponsiveContainer>

        <ResponsiveContainer>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-card border border-border rounded-2xl p-4">
              <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mb-3"><Users size={19} className="text-primary" /></View>
              <Text className="text-foreground text-2xl font-bold">{users.length}</Text>
              <Text className="text-muted-foreground text-xs mt-1">Registered customers</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-2xl p-4">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/10 items-center justify-center mb-3"><UserRound size={19} color="#168A5B" /></View>
              <Text className="text-foreground text-2xl font-bold">{users.filter((user) => user.is_active).length}</Text>
              <Text className="text-muted-foreground text-xs mt-1">Active accounts</Text>
            </View>
          </View>

          <View className="h-12 bg-card border border-border rounded-2xl px-4 flex-row items-center mb-4">
            <Search size={18} className="text-muted-foreground" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, email, phone or user ID"
              placeholderTextColor="#8A8589"
              className="flex-1 h-12 ml-3 text-foreground"
            />
          </View>

          {loading ? <AdminLoadingState label="Loading live customer profiles…" />
            : error ? <AdminErrorState message={error} onRetry={() => void load()} />
              : !filtered.length ? <AdminEmptyState title="No users found" message={query ? "Try another search." : "Customer accounts will appear here after registration."} />
                : <View className="gap-3">{filtered.map((user) => <UserCard key={user.id} user={user} />)}</View>}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="more" />
    </SafeAreaView>
  );
}

function UserCard({ user }: { user: AdminPublicUser }) {
  return (
    <View className="bg-card border border-border rounded-2xl p-4">
      <View className="flex-row items-center">
        {user.profile_image ? (
          <Image source={{ uri: user.profile_image }} className="w-12 h-12 rounded-2xl bg-muted" />
        ) : (
          <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center"><UserRound size={22} className="text-primary" /></View>
        )}
        <View className="flex-1 min-w-0 ml-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-foreground text-[15px] font-bold flex-1" numberOfLines={1}>{user.full_name}</Text>
            <Text className={user.is_active ? "text-emerald-600 bg-emerald-500/10 text-[9px] font-bold px-2 py-1 rounded-full" : "text-muted-foreground bg-muted text-[9px] font-bold px-2 py-1 rounded-full"}>
              {user.is_active ? "ACTIVE" : "INACTIVE"}
            </Text>
          </View>
          <Text className="text-muted-foreground text-[9px] mt-1" numberOfLines={1}>Updated {new Date(user.updated_at).toLocaleString()}</Text>
        </View>
      </View>
      <View className="mt-3 pt-3 border-t border-border/70 gap-2">
        <View className="flex-row items-center"><Mail size={14} className="text-primary" /><Text className="text-foreground text-xs ml-2 flex-1" numberOfLines={1}>{user.email}</Text></View>
        <View className="flex-row items-center"><Phone size={14} className="text-primary" /><Text className="text-foreground text-xs ml-2">{user.phone || "No phone number"}</Text></View>
      </View>
      <Text className="text-muted-foreground text-[8px] mt-3" numberOfLines={1}>ID: {user.id}</Text>
    </View>
  );
}
