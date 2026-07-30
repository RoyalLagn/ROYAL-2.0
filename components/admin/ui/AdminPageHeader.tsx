import React from "react";
import { Pressable, Text, View } from "react-native";
import { Menu } from "lucide-react-native";
import { useRouter } from "expo-router";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const router = useRouter();
  return <View className="py-2">
    <View className="flex-row items-center justify-between" style={{ position: "relative" }}>
      <Pressable accessibilityLabel="Open Admin menu" className="min-w-11 min-h-11 items-center justify-center" onPress={() => router.push("/admin-dash-logout")}><Menu size={22} className="text-foreground" /></Pressable>
      <View pointerEvents="none" style={{ position: "absolute", left: "50%", width: 160, height: 44, marginLeft: -80, alignItems: "center", justifyContent: "center" }}>
        <RoyalLagnLogo width={160} height={44} />
      </View>
      <View className="min-w-11 min-h-11 items-center justify-center">{action}</View>
    </View>
    <View className="px-2 pt-1"><Text className="text-foreground text-xl font-bold" numberOfLines={1}>{title}</Text>{subtitle ? <Text className="text-muted-foreground text-xs" numberOfLines={1}>{subtitle}</Text> : null}</View>
  </View>;
}
