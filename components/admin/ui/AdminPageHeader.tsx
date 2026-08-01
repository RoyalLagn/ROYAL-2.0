import React from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Menu } from "lucide-react-native";
import { useRouter } from "expo-router";

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  return <View className={desktop ? "pt-6 pb-4" : "py-3"}>
    <View className="flex-row items-center">
      {!desktop ? <Pressable accessibilityLabel="Open Admin menu" className="min-w-11 min-h-11 mr-2 items-center justify-center" onPress={() => router.push("/admin-dash-logout")}><Menu size={22} className="text-foreground" /></Pressable> : null}
      <View className="flex-1 min-w-0">
        <Text className={desktop ? "text-foreground text-2xl font-bold" : "text-foreground text-xl font-bold"} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text className="text-muted-foreground text-xs mt-1" numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {action ? <View className="min-w-11 min-h-11 ml-3 items-center justify-center">{action}</View> : null}
    </View>
  </View>;
}
