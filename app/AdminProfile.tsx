import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronRight, LogOut, ShieldCheck } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { adminNavigationGroups } from "@/admin/navigation";

export default function AdminProfile() {
  const router = useRouter();
  const { identity, signOut, signOutAllDevices } = useAdminAuth();
  const { width } = useWindowDimensions();
  const [loggingOut, setLoggingOut] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const showMobileNav = width < 768;
  const busy = loggingOut || loggingOutAll;

  const goToLogin = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/AdminLogin");
  };

  const executeLogout = async () => {
    if (busy) return;
    setLoggingOut(true);
    try {
      await signOut();
      goToLogin();
    } catch {
      Alert.alert(
        "Logout failed",
        "Unable to log out right now. Check your connection and try again.",
      );
      setLoggingOut(false);
    }
  };

  const logout = () => {
    if (busy) return;
    if (Platform.OS === "web") {
      void executeLogout();
      return;
    }
    Alert.alert(
      "Log out of Admin?",
      "You will need to sign in again to access protected administration pages.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: () => void executeLogout() },
      ],
    );
  };

  const executeLogoutAllDevices = async () => {
    if (busy) return;
    setLoggingOutAll(true);
    try {
      await signOutAllDevices();
      goToLogin();
    } catch (error) {
      setLoggingOutAll(false);
      const message = error instanceof Error
        ? error.message
        : "Unable to sign out of all devices right now.";
      Alert.alert("Logout failed", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Retry", onPress: () => void executeLogoutAllDevices() },
      ]);
    }
  };

  const logoutAllDevices = () => {
    if (busy) return;
    Alert.alert(
      "Logout from all devices?",
      "This will sign you out of your admin account on all devices where you are currently logged in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Logout from all devices", style: "destructive", onPress: () => void executeLogoutAllDevices() },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: showMobileNav ? 120 : 40 }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Admin Profile"
            subtitle="Session, appearance and access details"
          />

          <View className="bg-card border border-border rounded-2xl p-5">
            <View className="w-12 h-12 rounded-2xl bg-primary/10 items-center justify-center">
              <ShieldCheck size={22} className="text-primary" />
            </View>
            <Text className="text-foreground text-lg font-bold mt-4">
              {identity?.profile.full_name || "Administrator"}
            </Text>
            <Text className="text-muted-foreground text-xs mt-1">
              {identity?.profile.email || identity?.user.email}
            </Text>
            <Text className="text-primary text-metadata font-bold uppercase tracking-wider mt-2">
              {(identity?.profile.role || "admin").replace("_", " ")}
            </Text>
          </View>

          <View className="bg-card border border-border rounded-2xl p-4 mt-4 flex-row items-center">
            <View className="flex-1">
              <Text className="text-foreground font-semibold">Appearance</Text>
              <Text className="text-muted-foreground text-xs mt-1">
                Switch between light and dark themes
              </Text>
            </View>
            <ThemeToggle />
          </View>

          {showMobileNav ? (
            <View className="mt-5">
              {adminNavigationGroups.map((group) => (
                <View key={group.label} className="mb-4">
                  <Text className="text-muted-foreground text-metadata font-bold uppercase tracking-widest mb-2">
                    {group.label}
                  </Text>
                  <View className="bg-card border border-border rounded-2xl overflow-hidden">
                    {group.items.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => router.replace(item.route as never)}
                          className={
                            index
                              ? "min-h-14 px-4 flex-row items-center border-t border-border"
                              : "min-h-14 px-4 flex-row items-center"
                          }
                        >
                          <Icon size={18} className="text-primary" />
                          <Text className="text-foreground text-sm font-semibold flex-1 ml-3">
                            {item.label}
                          </Text>
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out of Admin"
            disabled={busy}
            onPress={logout}
            className="min-h-12 rounded-2xl border border-red-400 flex-row items-center justify-center mt-5"
            style={{ opacity: busy ? 0.65 : 1 }}
          >
            {loggingOut ? (
              <ActivityIndicator size="small" color="#DC3545" />
            ) : (
              <LogOut size={18} color="#DC3545" />
            )}
            <Text className="text-red-500 font-bold ml-2">
              {loggingOut ? "Logging out..." : "Log out"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Logout from all devices"
            accessibilityHint="Signs your admin account out on every device where you are currently logged in"
            disabled={busy}
            onPress={logoutAllDevices}
            className="min-h-12 rounded-2xl border border-red-300 flex-row items-center justify-center mt-3"
            style={{ opacity: busy ? 0.65 : 1 }}
          >
            {loggingOutAll ? (
              <ActivityIndicator size="small" color="#DC3545" />
            ) : (
              <LogOut size={18} color="#DC3545" />
            )}
            <Text className="text-red-500 font-bold ml-2">
              {loggingOutAll ? "Logging out everywhere..." : "Logout from all devices"}
            </Text>
          </Pressable>

          <Text className="text-muted-foreground text-metadata text-center mt-6">
            RoyalLagn Admin
          </Text>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
