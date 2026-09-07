import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Clock3, Mail, MoreVertical, Phone, RefreshCw, Search, UserCheck, UserRound, Users, UserX, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { adminPalette } from "@/theme";
import { AdminReveal } from "@/components/admin/ui/AdminReveal";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { AdminUserService, type AdminPublicUser } from "@/services/adminUsers";
import { adminErrorMessage } from "@/services/adminErrors";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

const USERS_PER_PAGE = 20;

export default function AdminUsers() {
  const { isPhone, isTablet } = useResponsiveLayout();
  const { width } = useWindowDimensions();
  const [users, setUsers] = useState<AdminPublicUser[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionUser, setActionUser] = useState<AdminPublicUser | null>(null);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length === 1) return;
    const timer = setTimeout(() => {
      setQuery(trimmed);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      setUsers(await AdminUserService.list());
    } catch (reason) {
      setError(adminErrorMessage(reason, "Unable to load public users."));
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
    const rows = users.filter((user) => (status === "all" || (status === "active" ? user.is_active : !user.is_active)) && (!normalized ||
      [user.full_name, user.email, user.phone, user.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))));
    return rows.sort((a, b) => sort === "name" ? a.full_name.localeCompare(b.full_name) : sort === "oldest" ? Date.parse(a.created_at) - Date.parse(b.created_at) : Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [query, sort, status, users]);
  const pages = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);
  const useReadableCards = isTablet || width < 1600;
  const userCardBasis = isPhone ? "100%" : useReadableCards ? "48%" : "32%";

  const updateUserStatus = async (user: AdminPublicUser, isActive: boolean) => {
    setActionUser(null);
    try {
      await AdminUserService.setActive(user.id, isActive);
      await load(true);
      Alert.alert("User account", `${user.full_name} is now ${isActive ? "active" : "inactive"}.`);
    } catch (reason) {
      Alert.alert("Action failed", adminErrorMessage(reason, "Unable to update this user."));
    }
  };

  const deactivateUser = (user: AdminPublicUser) => {
    setActionUser(null);
    Alert.alert(
      "Deactivate user?",
      `${user.full_name} will no longer be able to use the marketplace. Their account history is kept safely.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => void (async () => {
            try {
              await AdminUserService.setActive(user.id, false);
              await load(true);
              Alert.alert("User deactivated", `${user.full_name}'s account is now inactive.`);
            } catch (reason) {
              Alert.alert("Deactivation failed", adminErrorMessage(reason, "Unable to deactivate this user."));
            }
          })(),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={{ paddingBottom: 72 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={adminPalette.brand} />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Public User Management"
            subtitle="Live customer profiles from Supabase"
            action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh users" className="min-w-11 min-h-11 rounded-xl border border-border bg-card items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={() => void load(true)}><RefreshCw size={19} className="text-primary" /></Pressable>}
          />
        </ResponsiveContainer>

        <ResponsiveContainer>
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 min-h-24 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3 shadow-sm">
              <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><Users size={20} className="text-primary" /></View>
              <View className="flex-1 min-w-0"><Text className="text-muted-foreground text-xs font-semibold">Registered customers</Text><Text className="text-foreground text-2xl font-bold mt-1">{users.length}</Text></View>
            </View>
            <View className="flex-1 min-h-24 bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3 shadow-sm">
              <View className="w-11 h-11 rounded-xl bg-emerald-500/10 items-center justify-center"><UserRound size={20} color="#168A5B" /></View>
              <View className="flex-1 min-w-0"><Text className="text-muted-foreground text-xs font-semibold">Active accounts</Text><Text className="text-foreground text-2xl font-bold mt-1">{users.filter((user) => user.is_active).length}</Text></View>
            </View>
          </View>

          <View className="bg-card border border-border rounded-2xl p-4 mb-4 gap-3">
            <View className="h-12 px-3 rounded-xl bg-background border border-border flex-row items-center gap-2 focus-within:border-primary/50 transition-colors duration-200">
              <Search size={18} className="text-muted-foreground" />
              <TextInput accessibilityLabel="Search users" value={searchInput} onChangeText={setSearchInput} placeholder="Search by name, email, phone or user ID" placeholderTextColor="#7A8190" className="flex-1 min-w-0 text-foreground text-body" />
              {searchInput ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" className="w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200" onPress={() => setSearchInput("")}><X size={15} className="text-muted-foreground" /></Pressable> : null}
            </View>
            <View className="gap-2">
              <Text className="text-muted-foreground text-caption font-semibold">ACCOUNT STATUS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(["all", "active", "inactive"] as const).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: status === value }} key={value} onPress={() => { setStatus(value); setPage(1); }} className={status === value ? "min-h-11 px-4 rounded-xl bg-primary border border-primary items-center justify-center" : "min-h-11 px-4 rounded-xl bg-background border border-border items-center justify-center"} style={({ pressed }) => pressed ? { opacity: 0.72, transform: [{ scale: 0.97 }] } : undefined}><Text className={status === value ? "text-white text-xs font-semibold capitalize" : "text-foreground text-xs font-semibold capitalize"}>{value}</Text></Pressable>)}
              </ScrollView>
            </View>
            <View className="gap-2">
              <Text className="text-muted-foreground text-caption font-semibold">SORT BY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(["newest", "oldest", "name"] as const).map((value) => <Pressable accessibilityRole="button" accessibilityState={{ selected: sort === value }} key={value} onPress={() => { setSort(value); setPage(1); }} className={sort === value ? "min-h-11 px-4 rounded-xl bg-primary border border-primary items-center justify-center" : "min-h-11 px-4 rounded-xl bg-background border border-border items-center justify-center"} style={({ pressed }) => pressed ? { opacity: 0.72, transform: [{ scale: 0.97 }] } : undefined}><Text className={sort === value ? "text-white text-xs font-semibold capitalize" : "text-muted-foreground text-xs font-semibold capitalize"}>{value}</Text></Pressable>)}
              </ScrollView>
            </View>
          </View>

          {loading ? <AdminLoadingState label="Loading live customer profiles…" />
            : error ? <AdminErrorState message={error} onRetry={() => void load()} />
              : !visible.length ? <AdminEmptyState title="No users found" message={query || status !== "all" ? "Try another search or status filter." : "Customer accounts will appear here after registration."} />
                : <View className="flex-row flex-wrap gap-3">{visible.map((user, index) => <AdminReveal key={user.id} index={index} style={{ flexBasis: userCardBasis, flexGrow: isPhone ? 0 : 1, maxWidth: userCardBasis }}><UserCard user={user} compact={isPhone || useReadableCards} onActions={() => setActionUser(user)} /></AdminReveal>)}</View>}
          {!loading && !error && filtered.length > USERS_PER_PAGE ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} total={filtered.length} pageSize={USERS_PER_PAGE} /> : null}
        </ResponsiveContainer>
      </ScrollView>
      <UserActionMenu
        user={actionUser}
        visible={Boolean(actionUser)}
        onClose={() => setActionUser(null)}
        onStatus={(user, active) => void updateUserStatus(user, active)}
        onDelete={deactivateUser}
      />
      <AdminFooter />
    </SafeAreaView>
  );
}

function UserCard({ user, compact, onActions }: { user: AdminPublicUser; compact: boolean; onActions: () => void }) {
  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U";
  const emailUser = () => {
    if (user.email) void Linking.openURL(`mailto:${user.email}`);
  };
  const callUser = () => {
    if (user.phone) void Linking.openURL(`tel:${user.phone}`);
  };
  return (
    <View
      accessibilityLabel={`${user.full_name}, ${user.is_active ? "active" : "inactive"} account`}
      className="bg-card border border-border rounded-2xl p-3 hover:border-primary/35 hover:bg-primary/5 transition-colors duration-200"
    >
      <View className="flex-row items-start">
        {user.profile_image ? (
          <Image source={{ uri: user.profile_image }} className="w-12 h-12 rounded-xl bg-muted" resizeMode="cover" />
        ) : (
          <View className="w-12 h-12 rounded-xl bg-primary/10 items-center justify-center">
            <Text className="text-primary text-base font-bold">{initials}</Text>
          </View>
        )}
        <View className="flex-1 min-w-0 ml-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-foreground text-base font-bold flex-1" numberOfLines={1}>{user.full_name}</Text>
            <View className={user.is_active ? "bg-emerald-500/10 px-2.5 py-1 rounded-full flex-row items-center gap-1.5" : "bg-muted px-2.5 py-1 rounded-full flex-row items-center gap-1.5"}>
              <View className={user.is_active ? "w-1.5 h-1.5 rounded-full bg-emerald-600" : "w-1.5 h-1.5 rounded-full bg-muted-foreground"} />
              <Text className={user.is_active ? "text-emerald-700 text-caption font-bold" : "text-muted-foreground text-caption font-bold"}>
                {user.is_active ? "Active" : "Inactive"}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open actions for ${user.full_name}`} className="min-w-11 min-h-11 -mr-2 -mt-2 rounded-xl border border-border bg-background items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={onActions}>
              <MoreVertical size={19} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>
      </View>

      <View className={`mt-3 p-1.5 rounded-xl bg-background border border-border gap-0.5 ${compact ? "" : "flex-row"}`}>
        <Pressable accessibilityRole="link" accessibilityLabel={user.email ? `Email ${user.full_name} at ${user.email}` : "Email not provided"} disabled={!user.email} onPress={emailUser} className="flex-row items-center min-w-0 flex-1 rounded-xl px-2 py-1.5 hover:bg-primary/5 active:bg-primary/10 transition-colors duration-150" style={({ pressed }) => pressed ? { transform: [{ scale: 0.985 }] } : undefined}>
          <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center"><Mail size={15} className="text-primary" /></View>
          <View className="flex-1 min-w-0 ml-2.5">
            <Text className="text-muted-foreground text-caption">Email address</Text>
            <Text className="text-foreground text-xs font-semibold mt-0.5" selectable>{user.email || "Not provided"}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={user.phone ? `Call ${user.full_name} at ${user.phone}` : "Phone number not provided"} disabled={!user.phone} onPress={callUser} className="flex-row items-center min-w-0 flex-1 rounded-xl px-2 py-1.5 hover:bg-primary/5 active:bg-primary/10 transition-colors duration-150" style={({ pressed }) => pressed ? { transform: [{ scale: 0.985 }] } : undefined}>
          <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center"><Phone size={15} className="text-primary" /></View>
          <View className="flex-1 min-w-0 ml-2.5">
            <Text className="text-muted-foreground text-caption">Phone number</Text>
            <Text className="text-foreground text-xs font-semibold mt-0.5" selectable>{user.phone || "Not provided"}</Text>
          </View>
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between gap-3 mt-2.5 px-1">
        <View className="flex-row items-center flex-1 min-w-0">
          <CalendarDays size={13} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-caption ml-1.5" numberOfLines={1}>Joined {formatUserDate(user.created_at)}</Text>
        </View>
        <View className="flex-row items-center flex-1 min-w-0 justify-end">
          <Clock3 size={13} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-caption ml-1.5" numberOfLines={1}>Updated {formatUserDate(user.updated_at)}</Text>
        </View>
      </View>
    </View>
  );
}

function UserActionMenu({ user, visible, onClose, onStatus, onDelete }: {
  user: AdminPublicUser | null;
  visible: boolean;
  onClose: () => void;
  onStatus: (user: AdminPublicUser, active: boolean) => void;
  onDelete: (user: AdminPublicUser) => void;
}) {
  if (!user) return null;
  const initials = user.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  const openEmail = () => { onClose(); void Linking.openURL(`mailto:${user.email}`); };
  const openPhone = () => {
    if (!user.phone) { Alert.alert("Phone unavailable", "This user has not added a phone number."); return; }
    onClose();
    void Linking.openURL(`tel:${user.phone}`);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 items-center justify-center px-4 py-8">
        <Pressable accessibilityLabel="Close user actions" className="absolute inset-0" onPress={onClose} />
        <View className="bg-card border border-border rounded-3xl p-5 w-full max-w-lg">
          <View className="flex-row items-start gap-3">
            <View className="w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center"><Text className="text-primary font-bold">{initials}</Text></View>
            <View className="flex-1 min-w-0 pt-0.5">
              <Text className="text-foreground text-lg font-bold" numberOfLines={1}>{user.full_name}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Public user actions</Text>
            </View>
            <Pressable accessibilityLabel="Close" className="min-w-11 min-h-11 -mr-2 -mt-2 rounded-xl items-center justify-center" onPress={onClose}><X size={20} className="text-muted-foreground" /></Pressable>
          </View>

          <Text className="text-muted-foreground text-xs font-semibold mt-5 mb-2">CONTACT</Text>
          <View className="flex-row gap-2">
            <UserActionButton label="Email" icon={Mail} onPress={openEmail} />
            <UserActionButton label="Call" icon={Phone} onPress={openPhone} disabled={!user.phone} />
          </View>

          <Text className="text-muted-foreground text-xs font-semibold mt-5 mb-2">ACCOUNT</Text>
          <UserActionButton
            label={user.is_active ? "Deactivate account" : "Activate account"}
            icon={user.is_active ? UserX : UserCheck}
            onPress={() => onStatus(user, !user.is_active)}
            fullWidth
          />

          <View className="border-t border-border mt-5 pt-4">
            <Text className="text-red-600 text-xs font-semibold mb-2">RESTRICTED ACTION</Text>
            <UserActionButton label="Deactivate user" icon={UserX} onPress={() => onDelete(user)} destructive fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UserActionButton({ label, icon: Icon, onPress, destructive = false, disabled = false, fullWidth = false }: {
  label: string;
  icon: typeof Mail;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 px-4 rounded-2xl border flex-row items-center justify-center gap-2 ${fullWidth ? "w-full" : "flex-1"} ${destructive ? "border-red-200 bg-red-50" : "border-border bg-background"}`}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Icon size={18} color={destructive ? "#DC2626" : "#BE185D"} />
      <Text className={`font-semibold ${destructive ? "text-red-600" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}

function formatUserDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
