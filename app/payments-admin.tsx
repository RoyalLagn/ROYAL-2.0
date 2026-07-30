import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Menu,
  Bell,
  ChevronDown,
  Filter,
  Wallet,
  XCircle,
  RotateCcw,
  CheckCircle,
  ChevronRight,
  Download,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";

type PaymentStat = {
  id: string;
  title: string;
  amount: string;
  transactions: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
};

type Transaction = {
  id: string;
  vendorName: string;
  avatar: string;
  plan: string;
  amount: string;
  status: "Success" | "Failed" | "Refunded";
  date: string;
  time: string;
};

const paymentStats: PaymentStat[] = [
  {
    id: "received",
    title: "Received Payments",
    amount: "₹18,72,950",
    transactions: "128 Transactions",
    icon: Wallet,
    iconBg: "#D1FAE5",
    iconColor: "#10B981",
  },
  {
    id: "failed",
    title: "Failed Payments",
    amount: "₹1,25,300",
    transactions: "14 Transactions",
    icon: XCircle,
    iconBg: "#FEE2E2",
    iconColor: "#EF4444",
  },
  {
    id: "refunds",
    title: "Refunds",
    amount: "₹95,450",
    transactions: "8 Transactions",
    icon: RotateCcw,
    iconBg: "#FEF3C7",
    iconColor: "#F59E0B",
  },
];

const transactions: Transaction[] = [
  {
    id: "1",
    vendorName: "Magic Moments Photography",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
    plan: "Premium Plan • 1 Year",
    amount: "₹4,990",
    status: "Success",
    date: "20 May 2025",
    time: "11:30 AM",
  },
  {
    id: "2",
    vendorName: "Dream Decorators",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    plan: "Standard Plan • 1 Month",
    amount: "₹299",
    status: "Success",
    date: "20 May 2025",
    time: "10:15 AM",
  },
  {
    id: "3",
    vendorName: "Royal Caterers",
    avatar:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
    plan: "Premium Plan • 1 Year",
    amount: "₹4,990",
    status: "Failed",
    date: "20 May 2025",
    time: "09:45 AM",
  },
  {
    id: "4",
    vendorName: "Perfect Clicks",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    plan: "Standard Plan • 1 Month",
    amount: "₹299",
    status: "Success",
    date: "19 May 2025",
    time: "04:20 PM",
  },
  {
    id: "5",
    vendorName: "Elegant Events",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop",
    plan: "Premium Plan • 1 Year",
    amount: "₹4,990",
    status: "Refunded",
    date: "19 May 2025",
    time: "02:10 PM",
  },
  {
    id: "6",
    vendorName: "Beat Masters DJs",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    plan: "Standard Plan • 1 Month",
    amount: "₹299",
    status: "Success",
    date: "19 May 2025",
    time: "12:05 PM",
  },
  {
    id: "7",
    vendorName: "Glam Touch Makeup",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    plan: "Premium Plan • 1 Year",
    amount: "₹4,990",
    status: "Failed",
    date: "19 May 2025",
    time: "11:00 AM",
  },
  {
    id: "8",
    vendorName: "Shubh Wedding Venue",
    avatar:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=100&h=100&fit=crop",
    plan: "Premium Plan • 1 Year",
    amount: "₹4,990",
    status: "Success",
    date: "18 May 2025",
    time: "06:30 PM",
  },
  {
    id: "9",
    vendorName: "Vintage Photography",
    avatar:
      "https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=100&h=100&fit=crop",
    plan: "Standard Plan • 1 Month",
    amount: "₹299",
    status: "Refunded",
    date: "18 May 2025",
    time: "03:25 PM",
  },
  {
    id: "10",
    vendorName: "Food Fiesta Caterers",
    avatar:
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=100&h=100&fit=crop",
    plan: "Standard Plan • 1 Month",
    amount: "₹299",
    status: "Success",
    date: "18 May 2025",
    time: "01:10 PM",
  },
];

export default function PaymentsAdmin() {
  const router = useRouter();
  const showPlaceholder = (title: string) =>
    Alert.alert(title, `${title} is available as a local frontend placeholder.`);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Success":
        return "text-emerald-500";
      case "Failed":
        return "text-red-500";
      case "Refunded":
        return "text-amber-500";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Success":
        return <CheckCircle size={18} color="#10B981" />;
      case "Failed":
        return <XCircle size={18} color="#EF4444" />;
      case "Refunded":
        return <RotateCcw size={18} color="#F59E0B" />;
      default:
        return null;
    }
  };

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
          <TouchableOpacity className="p-2 -mr-2 relative" onPress={() => showPlaceholder("Payment Notifications")}>
            <Bell size={24} className="text-foreground" />
            <View className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </TouchableOpacity>
        </View>

        {/* Title Section */}
        <View className="px-6 mb-4">
          <Text className="text-2xl font-bold text-foreground">Payments</Text>
          <Text className="text-muted-foreground text-sm">
            Track all payments and transactions
          </Text>
        </View>

        {/* Date Filters */}
        <View className="px-6 mb-6">
          <View className="flex-row items-center gap-2">
            <TouchableOpacity className="flex-row items-center bg-card border border-border rounded-lg px-3 py-2" onPress={() => showPlaceholder("Select Day")}>
              <Text className="text-foreground text-sm mr-2">20</Text>
              <ChevronDown size={14} className="text-foreground" />
            </TouchableOpacity>
            <TouchableOpacity className="flex-row items-center bg-card border border-border rounded-lg px-3 py-2" onPress={() => showPlaceholder("Select Month")}>
              <Text className="text-foreground text-sm mr-2">May</Text>
              <ChevronDown size={14} className="text-foreground" />
            </TouchableOpacity>
            <TouchableOpacity className="flex-row items-center bg-card border border-border rounded-lg px-3 py-2" onPress={() => showPlaceholder("Select Year")}>
              <Text className="text-foreground text-sm mr-2">2025</Text>
              <ChevronDown size={14} className="text-foreground" />
            </TouchableOpacity>
            <TouchableOpacity className="w-10 h-10 bg-primary rounded-lg items-center justify-center ml-auto" onPress={() => showPlaceholder("Apply Payment Filters")}>
              <Filter size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Stats Cards */}
        <View className="px-6 mb-6">
          <View className="gap-3">
            {paymentStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <View
                  key={stat.id}
                  className="flex-row items-center bg-card rounded-xl p-4 border border-border"
                >
                  <View
                    className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                    style={{ backgroundColor: stat.iconBg }}
                  >
                    <Icon size={24} color={stat.iconColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-muted-foreground text-xs mb-0.5">
                      {stat.title}
                    </Text>
                    <Text className="text-foreground text-xl font-bold">
                      {stat.amount}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {stat.transactions}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* All Transactions */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            All Transactions
          </Text>

          <View className="bg-card rounded-2xl border border-border overflow-hidden">
            {transactions.map((transaction, index) => (
              <TouchableOpacity
                key={transaction.id}
                className={`flex-row items-center p-4 ${
                  index !== transactions.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
                onPress={() => Alert.alert("Transaction Details", `${transaction.vendorName}\n${transaction.amount}\n${transaction.status}`)}
              >
                <View className="mr-3">
                  {getStatusIcon(transaction.status)}
                </View>
                <View className="flex-1">
                  <Text className="text-foreground font-medium text-sm">
                    {transaction.vendorName}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {transaction.plan}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-foreground font-semibold text-sm">
                    {transaction.amount}
                  </Text>
                  <Text
                    className={getStatusColor(transaction.status) + " text-xs"}
                  >
                    {transaction.status}
                  </Text>
                  <Text className="text-muted-foreground text-[10px] mt-0.5">
                    {transaction.date} • {transaction.time}
                  </Text>
                </View>
                <ChevronRight
                  size={16}
                  className="text-muted-foreground ml-2"
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Download Report Button */}
        <View className="px-6 mb-6">
          <TouchableOpacity className="flex-row items-center justify-center bg-card border border-primary rounded-xl py-3" onPress={() => showPlaceholder("Download Payment Report")}>
            <Download size={18} color="#E91E63" />
            <Text className="text-primary font-medium text-sm ml-2">
              Download Report
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AdminFooter activeTab="payments" />
    </SafeAreaView>
  );
}
