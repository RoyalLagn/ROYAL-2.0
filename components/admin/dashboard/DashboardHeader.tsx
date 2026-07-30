import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Menu, RefreshCw } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { DashboardHealth } from "@/types/adminDashboard";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";

export function DashboardHeader({
  refreshing,
  onRefresh,
  health,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  health?: DashboardHealth | null;
}) {
  const router = useRouter();
  const { identity } = useAdminAuth();
  const responsive = useResponsiveLayout();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const healthy = health?.database === "online" && health.realtime === "online";
  const lastLogin = identity?.user.last_sign_in_at;
  return (
    <>
      <ResponsiveContainer className="flex-row items-center justify-between py-2" style={{ position: "relative" }}>
        <Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={() => router.push("/admin-dash-logout")}>
          <Menu size={24} className="text-foreground" />
        </Pressable>
        <View pointerEvents="none" style={{ position: "absolute", left: "50%", width: 160, height: 44, marginLeft: -80, alignItems: "center", justifyContent: "center" }}>
          <RoyalLagnLogo width={160} height={44} />
        </View>
        <Pressable className="min-w-11 min-h-11 items-center justify-center" disabled={refreshing} onPress={onRefresh}>
          <RefreshCw size={22} className="text-foreground" />
        </Pressable>
      </ResponsiveContainer>
      <ResponsiveContainer style={{ marginBottom: responsive.sectionGap }}>
        <ResponsiveCard>
          <Text className="text-primary text-sm font-semibold">{greeting}</Text>
          <Text className="text-muted-foreground text-sm mt-1">Welcome back</Text>
          <Text className="text-foreground text-2xl font-bold mt-1">
            {identity?.profile.full_name || "Administrator"}
          </Text>
          <Text className="text-muted-foreground text-sm capitalize">
            {(identity?.profile.role || "admin").replace("_", " ")}
          </Text>
          <View className="border-t border-border mt-4 pt-4 flex-row flex-wrap gap-x-6 gap-y-2">
            <Text className="text-foreground text-xs">
              {now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </Text>
            <Text className="text-foreground text-xs">
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </Text>
            <Text className={healthy ? "text-emerald-500 text-xs font-semibold" : "text-amber-500 text-xs font-semibold"}>
              Platform {healthy ? "Healthy" : "Requires Attention"}
            </Text>
          </View>
          <Text className="text-muted-foreground text-xs mt-3">
            {lastLogin ? `Last login: ${new Date(lastLogin).toLocaleString()}` : "First login on this device."}
          </Text>
        </ResponsiveCard>
      </ResponsiveContainer>
    </>
  );
}
