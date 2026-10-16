import React from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Menu } from "lucide-react-native";
import { useRouter } from "expo-router";
import { typeStyles } from "@/constants/typography";

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  return <View className={`mt-3 mb-5 rounded-2xl bg-primary/5 border border-primary/10 px-5 ${desktop ? "py-4" : "py-3"}`}>
    <View className="flex-row items-center flex-wrap" style={{ gap: 16 }}>
      {!desktop ? <Pressable accessibilityLabel="Open Admin menu" className="min-w-11 min-h-11 items-center justify-center" onPress={() => router.push("/AdminProfile")}><Menu size={22} className="text-foreground" /></Pressable> : null}
      <View className="flex-1 min-w-[200px]">
        <Text className="text-foreground" style={typeStyles.pageTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text className="text-muted-foreground" style={[typeStyles.body, { marginTop: 4, maxWidth: 680 }]} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {action ? <View className="min-h-11 items-center justify-center">{action}</View> : null}
    </View>
  </View>;
}
