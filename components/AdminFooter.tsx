import React from "react";
import { View, TouchableOpacity, Text } from "react-native";
import { useColorScheme } from "nativewind";
import { Href, useRouter } from "expo-router";
import {
  BarChart3,
  Users,
  Crown,
  Wallet,
  MoreHorizontal,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

type TabKey = "dashboard" | "vendors" | "subscriptions" | "payments" | "more";

type TabItem = {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  route: Href;
  shortLabel?: string;
};

const tabs: TabItem[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3, route: "/admin-dashboard" },
  { key: "vendors", label: "Vendors", icon: Users, route: "/vendors-admin-listing" },
  { key: "subscriptions", label: "Subscriptions", shortLabel: "Plans", icon: Crown, route: "/subscriptions-admin" },
  { key: "payments", label: "Payments", icon: Wallet, route: "/payments-admin" },
  { key: "more", label: "More", icon: MoreHorizontal, route: "/admin-dash-logout" },
];

interface AdminFooterProps {
  activeTab: TabKey;
}

export default function AdminFooter({ activeTab }: AdminFooterProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();

  const isActive = (tab: TabItem) => tab.key === activeTab;

  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around pt-2 border-t border-border"
      style={{
        backgroundColor: isDark ? "#1C1917" : "#FFFFFF",
        paddingBottom: Math.max(insets.bottom, 10),
        paddingHorizontal: responsive.isPhone ? 8 : 24,
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);

        return (
          <TouchableOpacity
            key={tab.key}
            className="items-center justify-center min-w-11 min-h-11 flex-1"
            onPress={() => router.push(tab.route)}
          >
            {active ? (
              <View className="w-6 h-6 rounded-lg bg-primary items-center justify-center mb-1">
                <Icon size={14} color="#FFFFFF" />
              </View>
            ) : (
              <Icon size={22} className="text-muted-foreground mb-1" />
            )}
            <Text
              className={`${responsive.isPhone ? "text-[10px]" : "text-xs"} ${active ? "text-primary" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {responsive.isPhone && tab.shortLabel ? tab.shortLabel : tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
