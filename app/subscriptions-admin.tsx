import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import {
  Menu,
  Bell,
  ChevronDown,
  Users,
  Crown,
  Calendar,
  XCircle,
  Star,
  Info,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
type StatCard = {
  id: string;
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
};

type PlanCard = {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  status: "Active";
  stats: {
    active: number;
    newThisMonth: number;
    cancelled: number;
    revenue: string;
  };
};

const statsData: StatCard[] = [
  {
    id: "total",
    title: "Total Subscriptions",
    value: "986",
    change: "10.3%",
    changeType: "positive",
    icon: Users,
    iconBg: "#FCE7F3",
    iconColor: "#E91E63",
  },
  {
    id: "active",
    title: "Active Subscriptions",
    value: "872",
    change: "11.2%",
    changeType: "positive",
    icon: Crown,
    iconBg: "#E0E7FF",
    iconColor: "#6366F1",
  },
  {
    id: "new",
    title: "New Subscriptions",
    value: "124",
    change: "8.6%",
    changeType: "positive",
    icon: Calendar,
    iconBg: "#FEF3C7",
    iconColor: "#F59E0B",
  },
  {
    id: "cancelled",
    title: "Cancelled / Expired",
    value: "114",
    change: "6.4%",
    changeType: "negative",
    icon: XCircle,
    iconBg: "#FEE2E2",
    iconColor: "#EF4444",
  },
];

const subscriptionPlans: PlanCard[] = [
  {
    id: "standard",
    name: "Standard Plan",
    price: "₹299",
    period: "/ month",
    description: "Best for individuals and small businesses getting started.",
    icon: Star,
    iconBg: "#FCE7F3",
    status: "Active",
    stats: {
      active: 612,
      newThisMonth: 38,
      cancelled: 22,
      revenue: "₹1,83,588",
    },
  },
  {
    id: "premium",
    name: "Premium Plan",
    price: "₹499",
    period: "/ month",
    description: "Advanced features for growing businesses and professionals.",
    icon: Crown,
    iconBg: "#E0E7FF",
    status: "Active",
    stats: {
      active: 260,
      newThisMonth: 86,
      cancelled: 36,
      revenue: "₹1,29,740",
    },
  },
];

export default function SubscriptionsAdmin() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const showPlaceholder = (title: string) =>
    Alert.alert(title, `${title} is available as a local frontend placeholder.`);

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="relative flex-row items-center justify-between px-6 py-4">
          <TouchableOpacity className="p-2 -ml-2" onPress={() => router.push("/admin-dash-logout")}>
            <Menu size={24} className="text-foreground" />
          </TouchableOpacity>
          <View pointerEvents="none" style={{ position: "absolute", left: "50%", width: 160, height: 44, marginLeft: -80 }}>
            <RoyalLagnLogo width={160} height={44} />
          </View>
          <TouchableOpacity className="p-2 -mr-2 relative" onPress={() => showPlaceholder("Subscription Notifications")}>
            <Bell size={24} className="text-foreground" />
            <View className="absolute top-1 right-1 w-5 h-5 bg-destructive rounded-full items-center justify-center">
              <Text className="text-white text-xs font-bold">12</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Title Section */}
        <View className="px-6 mb-4">
          <Text className="text-2xl font-bold text-foreground mb-1">
            Subscriptions
          </Text>
          <Text className="text-muted-foreground text-sm">
            Manage subscriptions and track performance
          </Text>
        </View>

        {/* Date Dropdown */}
        <View className="px-6 mb-6">
          <TouchableOpacity className="flex-row items-center bg-card border border-border rounded-xl px-4 py-3 self-start" onPress={() => showPlaceholder("Subscription Month")}>
            <Calendar size={18} className="text-foreground mr-2" />
            <Text className="text-foreground font-medium mr-2">May 2025</Text>
            <ChevronDown size={16} className="text-foreground" />
          </TouchableOpacity>
        </View>

        {/* Subscription Summary */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            Subscription Summary
          </Text>
          <View className="flex-row flex-wrap gap-4">
            {statsData.map((stat) => {
              const Icon = stat.icon;
              return (
                <View
                  key={stat.id}
                  className="flex-1 min-w-[45%] bg-card rounded-2xl p-4 border border-border"
                >
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mb-3"
                    style={{ backgroundColor: stat.iconBg }}
                  >
                    <Icon size={20} color={stat.iconColor} />
                  </View>
                  <Text className="text-muted-foreground text-xs mb-1">
                    {stat.title}
                  </Text>
                  <Text className="text-foreground text-xl font-bold mb-1">
                    {stat.value}
                  </Text>
                  <View className="flex-row items-center">
                    <Text
                      className={`text-xs font-medium ${
                        stat.changeType === "positive"
                          ? "text-emerald-500"
                          : "text-red-500"
                      }`}
                    >
                      {stat.changeType === "positive" ? "↑" : "↓"} {stat.change}
                    </Text>
                    <Text className="text-muted-foreground text-xs ml-1">
                      vs Apr 2025
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Subscription Trends */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            Subscription Trends
          </Text>
          <View className="bg-card rounded-2xl p-4 border border-border">
            <View className="flex-row items-center">
              {/* Custom Donut Chart Visualization */}
              <View className="relative w-40 h-40 items-center justify-center">
                {/* Outer ring - Active (79%) */}
                <View
                  className="absolute w-40 h-40 rounded-full"
                  style={{
                    borderWidth: 16,
                    borderColor: "#E91E63",
                    borderRightColor: "transparent",
                    transform: [{ rotate: "-45deg" }],
                  }}
                />
                {/* Middle ring - Trial (11%) */}
                <View
                  className="absolute w-40 h-40 rounded-full"
                  style={{
                    borderWidth: 16,
                    borderColor: "#8B5CF6",
                    borderLeftColor: "transparent",
                    borderTopColor: "transparent",
                    transform: [{ rotate: "225deg" }],
                  }}
                />
                {/* Inner ring - Expired (10%) */}
                <View
                  className="absolute w-40 h-40 rounded-full"
                  style={{
                    borderWidth: 16,
                    borderColor: "#F97316",
                    borderLeftColor: "transparent",
                    transform: [{ rotate: "260deg" }],
                  }}
                />
                {/* Center circle */}
                <View
                  className="w-24 h-24 rounded-full items-center justify-center"
                  style={{ backgroundColor: isDark ? "#141414" : "#FFFFFF" }}
                >
                  <Text className="text-foreground text-2xl font-bold">
                    986
                  </Text>
                  <Text className="text-muted-foreground text-xs">Total</Text>
                </View>
              </View>

              {/* Legend */}
              <View className="flex-1 ml-4 gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-[#E91E63] mr-2" />
                    <Text className="text-foreground text-sm">Active</Text>
                  </View>
                  <Text className="text-foreground text-sm font-medium">
                    872 (79%)
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-[#8B5CF6] mr-2" />
                    <Text className="text-foreground text-sm">Trial</Text>
                  </View>
                  <Text className="text-foreground text-sm font-medium">
                    124 (11%)
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <View className="w-3 h-3 rounded-full bg-[#F97316] mr-2" />
                    <Text className="text-foreground text-sm">Expired</Text>
                  </View>
                  <Text className="text-foreground text-sm font-medium">
                    114 (10%)
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Subscription Plans */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            Subscription Plans
          </Text>
          <View className="gap-4">
            {subscriptionPlans.map((plan) => {
              const Icon = plan.icon;
              return (
                <View
                  key={plan.id}
                  className="bg-card rounded-2xl p-4 border border-border"
                >
                  {/* Plan Header */}
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-row items-center flex-1">
                      <View
                        className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                        style={{ backgroundColor: plan.iconBg }}
                      >
                        <Icon size={24} color="#E91E63" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground font-semibold text-base">
                          {plan.name}
                        </Text>
                        <View className="flex-row items-center">
                          <Text className="text-foreground font-bold text-lg">
                            {plan.price}
                          </Text>
                          <Text className="text-muted-foreground text-sm">
                            {plan.period}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View className="bg-emerald-100 px-3 py-1 rounded-full">
                      <Text className="text-emerald-700 text-xs font-medium">
                        Active
                      </Text>
                    </View>
                  </View>

                  {/* Plan Description */}
                  <Text className="text-muted-foreground text-sm mb-4">
                    {plan.description}
                  </Text>

                  {/* Plan Stats */}
                  <View className="flex-row items-center justify-between pt-4 border-t border-border">
                    <View className="items-center flex-1">
                      <Text className="text-foreground font-bold text-lg">
                        {plan.stats.active}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        Active
                      </Text>
                    </View>
                    <View className="items-center flex-1 border-l border-border">
                      <Text className="text-foreground font-bold text-lg">
                        {plan.stats.newThisMonth}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        New This Month
                      </Text>
                    </View>
                    <View className="items-center flex-1 border-l border-border">
                      <Text className="text-foreground font-bold text-lg">
                        {plan.stats.cancelled}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        Cancelled
                      </Text>
                    </View>
                    <View className="items-center flex-1 border-l border-border">
                      <Text className="text-foreground font-bold text-lg">
                        {plan.stats.revenue}
                      </Text>
                      <Text className="text-muted-foreground text-xs">
                        Revenue
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Info Banner */}
        <View className="px-6 mb-6">
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex-row items-center">
            <Info size={20} color="#F59E0B" />
            <Text className="text-amber-800 text-sm ml-3 flex-1">
              New vendors get 1 month free trial on any plan.
            </Text>
          </View>
        </View>
      </ScrollView>

      <AdminFooter activeTab="subscriptions" />
    </SafeAreaView>
  );
}
