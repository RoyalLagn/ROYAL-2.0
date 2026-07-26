import React from "react";
import { Pressable, Text, View } from "react-native";
import { Menu } from "lucide-react-native";
import { useRouter } from "expo-router";

export function AdminPageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const router = useRouter();
  return <View className="flex-row items-center py-2"><Pressable accessibilityLabel="Open Admin menu" className="min-w-11 min-h-11 items-center justify-center" onPress={() => router.push("/admin-dash-logout")}><Menu size={22} className="text-foreground" /></Pressable><View className="flex-1 px-2"><Text className="text-foreground text-xl font-bold" numberOfLines={1}>{title}</Text>{subtitle ? <Text className="text-muted-foreground text-xs" numberOfLines={1}>{subtitle}</Text> : null}</View>{action}</View>;
}
