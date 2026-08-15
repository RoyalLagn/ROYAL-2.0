import React from "react";
import { Platform, Pressable, View, Text, useWindowDimensions } from "react-native";
import { useColorScheme } from "nativewind";
import { Href, useRouter } from "expo-router";
import {
  BarChart3,
  Users,
  Crown,
  HandCoins,
  CircleUserRound,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { brandPalette } from "@/constants/brandPalette";
import { floatingNavigationTokens } from "@/constants/navigationTokens";

type TabKey = "dashboard" | "vendors" | "subscriptions" | "payments" | "finance" | "profile";

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
  { key: "finance", label: "Finance", icon: HandCoins, route: "/AdminFinance" },
  { key: "profile", label: "Profile", icon: CircleUserRound, route: "/AdminProfile" },
];

interface AdminFooterProps {
  activeTab?: TabKey;
}

export default function AdminFooter({ activeTab }: AdminFooterProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();
  const { width } = useWindowDimensions();

  if (width >= 768) return null;

  const isActive = (tab: TabItem) => tab.key === activeTab;

  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around pt-2 border-t border-border"
      style={{
        backgroundColor: isDark
          ? floatingNavigationTokens.admin.darkCanvas
          : floatingNavigationTokens.admin.lightCanvas,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingLeft: Math.max(insets.left, responsive.isPhone ? 8 : 24),
        paddingRight: Math.max(insets.right, responsive.isPhone ? 8 : 24),
      }}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab);

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.label} tab`}
            accessibilityState={{ selected: active }}
            android_ripple={Platform.OS === "android" ? { color: "rgba(233,30,99,0.10)", borderless: false } : undefined}
            className="items-center justify-center min-w-12 min-h-12 flex-1 active:opacity-75"
            onPress={() => {
              if (active) return;
              router.replace(tab.route);
            }}
          >
            {active ? (
              <View className="w-6 h-6 rounded-lg bg-primary items-center justify-center mb-1">
                <Icon size={14} color={brandPalette.light.primaryForeground} />
              </View>
            ) : (
              <Icon size={22} className="text-muted-foreground mb-1" />
            )}
            <Text
              className={`${responsive.isPhone ? "text-metadata" : "text-xs"} ${active ? "text-primary" : "text-muted-foreground"}`}
              numberOfLines={1}
            >
              {responsive.isPhone && tab.shortLabel ? tab.shortLabel : tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
