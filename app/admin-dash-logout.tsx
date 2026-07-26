import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { LogOut, Shield, ChevronRight, ClipboardList } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { useAdminAuth } from "@/context/AdminAuthContext";

type MenuItem = {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  route?: Href;
  action?: () => void;
};

export default function AdminDashLogout() {
  const router = useRouter();
  const { identity, signOut } = useAdminAuth();
  useColorScheme();
  const performLogout = async () => {
    try {
      await signOut();
    } finally {
      router.dismissAll();
      router.replace("/DashboardCenter");
    }
  };

  const menuItems: MenuItem[] = [
    {
      id: "vendor-applications",
      title: "Vendor Applications",
      icon: ClipboardList,
      color: "#E91E63",
      route: "/VendorApplications",
    },
    {
      id: "profile",
      title: "Admin Profile",
      icon: Shield,
      color: "#3B82F6",
      route: "/AdminUsers",
    },
    {
      id: "settings",
      title: "Settings",
      icon: Shield,
      color: "#8B5CF6",
      route: "/AdminSettings",
    },
    {
      id: "logout",
      title: "Logout",
      icon: LogOut,
      color: "#E91E63",
      action: performLogout,
    },
  ];

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <Text className="text-xl font-bold text-foreground">More Options</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-primary font-medium">Done</Text>
        </TouchableOpacity>
      </View>

      {/* Admin Profile Card */}
      <View className="px-6 pt-6 pb-4">
        <View className="bg-card rounded-2xl p-4 border border-border flex-row items-center">
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200&auto=format&fit=crop&q=60",
            }}
            className="w-16 h-16 rounded-full border-2 border-primary"
            resizeMode="cover"
          />
          <View className="ml-4 flex-1">
            <Text className="text-foreground font-bold text-lg">
              {identity?.profile.full_name || "Administrator"}
            </Text>
            <Text className="text-muted-foreground text-sm">
              {identity?.profile.role === "super_admin" ? "Super Administrator" : "Platform Administrator"}
            </Text>
          </View>
          <ChevronRight size={20} className="text-muted-foreground" />
        </View>
      </View>

      {/* Menu Items */}
      <View className="px-6 pt-2">
        <Text className="text-muted-foreground text-xs font-medium mb-3 px-1">
          ACCOUNT
        </Text>
        <View className="bg-card rounded-2xl border border-border overflow-hidden">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.id}
                className={`flex-row items-center p-4 ${
                  index !== menuItems.length - 1 ? "border-b border-border" : ""
                }`}
                onPress={
                  item.action
                    ? item.action
                    : () => item.route && router.push(item.route)
                }
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <Icon size={20} color={item.color} />
                </View>
                <View className="flex-1 ml-3">
                  <Text
                    className={`text-sm font-medium ${
                      item.id === "logout" ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {item.title}
                  </Text>
                </View>
                <ChevronRight size={18} className="text-muted-foreground" />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Logout Button (Bottom) */}
      <View className="px-6 mt-8">
        <TouchableOpacity
          className="bg-destructive rounded-2xl p-4 flex-row items-center justify-center"
          onPress={() => void performLogout()}
        >
          <LogOut size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold text-base ml-2">
            Logout from Admin
          </Text>
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <View className="items-center mt-8 pb-24">
        <Text className="text-muted-foreground text-xs">
          RoyalLagn Admin v1.0.0
        </Text>
      </View>

      <AdminFooter activeTab="more" />
    </SafeAreaView>
  );
}
