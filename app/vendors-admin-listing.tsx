import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import { useRouter } from "expo-router";
import AdminFooter from "@/components/AdminFooter";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import {
  Menu,
  Bell,
  SlidersHorizontal,
  Grid2x2,
  Building2,
  UtensilsCrossed,
  Camera,
  Sparkles,
  Palette,
  Music,
  Shirt,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  MoreVertical,
} from "lucide-react-native";

type Category = {
  id: string;
  name: string;
  icon: React.ElementType;
  count: number;
  color: string;
};

type Vendor = {
  id: string;
  name: string;
  category: string;
  email: string;
  phone: string;
  avatar: string;
  status: "Active" | "Pending" | "Suspended";
};

const categories: Category[] = [
  {
    id: "all",
    name: "All Categories",
    icon: Grid2x2,
    count: 1248,
    color: "#E91E63",
  },
  {
    id: "venues",
    name: "Venues",
    icon: Building2,
    count: 132,
    color: "#F59E0B",
  },
  {
    id: "caterers",
    name: "Caterers",
    icon: UtensilsCrossed,
    count: 156,
    color: "#EF4444",
  },
  {
    id: "photographers",
    name: "Photographers",
    icon: Camera,
    count: 198,
    color: "#8B5CF6",
  },
  {
    id: "decorators",
    name: "Decorators",
    icon: Sparkles,
    count: 142,
    color: "#10B981",
  },
  {
    id: "makeup",
    name: "Makeup Artists",
    icon: Palette,
    count: 115,
    color: "#EC4899",
  },
  { id: "djs", name: "DJs", icon: Music, count: 89, color: "#F97316" },
  {
    id: "bridal",
    name: "Bridal Wear",
    icon: Shirt,
    count: 101,
    color: "#E91E63",
  },
];

const vendors: Vendor[] = [
  {
    id: "1",
    name: "Magic Moments Photography",
    category: "Photographers",
    email: "magicmoments@gmail.com",
    phone: "+91 98765 43210",
    avatar:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=100&h=100&fit=crop",
    status: "Active",
  },
  {
    id: "2",
    name: "Dream Decorators",
    category: "Decorators",
    email: "dreamdecor@gmail.com",
    phone: "+91 91234 56789",
    avatar:
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=100&h=100&fit=crop",
    status: "Active",
  },
  {
    id: "3",
    name: "Royal Caterers",
    category: "Caterers",
    email: "royalcaterers@gmail.com",
    phone: "+91 99887 76655",
    avatar:
      "https://images.unsplash.com/photo-1555244162-803279f50793?w=100&h=100&fit=crop",
    status: "Active",
  },
  {
    id: "4",
    name: "Beat Masters DJs",
    category: "DJs",
    email: "beatmasters@gmail.com",
    phone: "+91 88776 65544",
    avatar:
      "https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=100&h=100&fit=crop",
    status: "Pending",
  },
  {
    id: "5",
    name: "Elegant Bridal Wear",
    category: "Bridal Wear",
    email: "elegantbridal@gmail.com",
    phone: "+91 91766 44332",
    avatar:
      "https://images.unsplash.com/photo-1594552072238-b8f02c75527c?w=100&h=100&fit=crop",
    status: "Active",
  },
  {
    id: "6",
    name: "Glam Touch Makeup",
    category: "Makeup Artists",
    email: "glamtouch@gmail.com",
    phone: "+91 91000 11122",
    avatar:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=100&h=100&fit=crop",
    status: "Suspended",
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active":
      return { bg: "#DCFCE7", text: "#166534" };
    case "Pending":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "Suspended":
      return { bg: "#FEE2E2", text: "#991B1B" };
    default:
      return { bg: "#F3F4F6", text: "#374151" };
  }
};

export default function VendorsAdminListing() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch = vendor.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const selected = categories.find((category) => category.id === selectedCategory);
    return matchesSearch && (selectedCategory === "all" || vendor.category === selected?.name);
  });

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <TouchableOpacity className="p-2 -ml-2" onPress={() => router.push("/admin-dash-logout")}>
            <Menu size={24} className="text-foreground" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-primary">RoyalLagn</Text>
          <TouchableOpacity className="p-2 -mr-2 relative" onPress={() => router.push("/AdminSettings")}>
            <Bell size={24} className="text-foreground" />
            <View className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
          </TouchableOpacity>
        </View>

        {/* Title Section */}
        <View className="px-6 mb-4">
          <Text className="text-2xl font-bold text-foreground">Vendors</Text>
          <Text className="text-muted-foreground text-sm">
            Manage and monitor all registered vendors
          </Text>
        </View>

        {/* Search Bar */}
        <View className="px-6 mb-6">
          <View className="flex-row items-center gap-3">
            <CompactSearchBar
              value={searchQuery}
              placeholder="Search vendors..."
              dark={isDark}
              accessibilityLabel="Search vendors"
              onChangeText={setSearchQuery}
              style={{ flex: 1 }}
            />
            <TouchableOpacity className="w-12 h-12 bg-card border border-border rounded-xl items-center justify-center" onPress={() => { setSearchQuery(""); setSelectedCategory("all"); }}>
              <SlidersHorizontal size={20} className="text-primary" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            Categories
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <TouchableOpacity
                  key={category.id}
                  className="items-center"
                  style={{ width: "22%" }}
                  onPress={() => setSelectedCategory(category.id)}
                >
                  <View
                    className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                    style={{ backgroundColor: `${category.color}15` }}
                  >
                    <Icon size={24} color={category.color} />
                  </View>
                  <Text className="text-foreground text-xs font-medium text-center">
                    {category.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    {category.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity className="items-center" style={{ width: "22%" }} onPress={() => router.push("/AdminCategories")}>
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center mb-2"
                style={{ backgroundColor: isDark ? "#2A2A2A" : "#F5F5F4" }}
              >
                <MoreHorizontal
                  size={24}
                  color={isDark ? "#A8A29E" : "#78716C"}
                />
              </View>
              <Text className="text-foreground text-xs font-medium text-center">
                View All
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* All Vendors Section */}
        <View className="px-6 mb-6">
          <Text className="text-foreground font-semibold text-base mb-4">
            All Vendors ({vendors.length.toLocaleString()})
          </Text>

          <View className="gap-3">
            {filteredVendors.map((vendor) => {
              const statusColors = getStatusColor(vendor.status);
              return (
                <View
                  key={vendor.id}
                  className="bg-card rounded-2xl p-4 border border-border flex-row items-center"
                >
                  <Image
                    source={{ uri: vendor.avatar }}
                    className="w-14 h-14 rounded-full"
                  />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-foreground font-semibold text-sm">
                        {vendor.name}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <View
                          className="px-2 py-1 rounded-full"
                          style={{ backgroundColor: statusColors.bg }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{ color: statusColors.text }}
                          >
                            {vendor.status}
                          </Text>
                        </View>
                        <TouchableOpacity className="p-1" onPress={() => Alert.alert("Vendor Actions", `Manage ${vendor.name}`)}>
                          <MoreVertical
                            size={16}
                            className="text-muted-foreground"
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {vendor.category}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {vendor.email}
                    </Text>
                    <Text className="text-foreground text-xs mt-0.5">
                      {vendor.phone}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Pagination */}
        <View className="px-6 mb-6">
          <View className="flex-row items-center justify-center gap-2">
            <TouchableOpacity
              disabled={currentPage === 1}
              className="w-8 h-8 rounded-lg bg-card border border-border items-center justify-center opacity-50"
              onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft size={16} className="text-foreground" />
            </TouchableOpacity>

            {[1, 2, 3].map((page) => (
              <TouchableOpacity
                key={page}
                onPress={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg items-center justify-center ${
                  currentPage === page
                    ? "bg-primary"
                    : "bg-card border border-border"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    currentPage === page ? "text-white" : "text-foreground"
                  }`}
                >
                  {page}
                </Text>
              </TouchableOpacity>
            ))}

            <Text className="text-muted-foreground text-sm">...</Text>

            <TouchableOpacity className="w-8 h-8 rounded-lg bg-card border border-border items-center justify-center" onPress={() => setCurrentPage(42)}>
              <Text className="text-foreground text-sm font-medium">42</Text>
            </TouchableOpacity>

            <TouchableOpacity className="w-8 h-8 rounded-lg bg-card border border-border items-center justify-center" onPress={() => setCurrentPage((page) => Math.min(42, page + 1))}>
              <ChevronRight size={16} className="text-foreground" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Suspended Vendors Banner */}
        <View className="px-6 mb-6">
          <View className="bg-card rounded-2xl p-4 border border-border flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <View className="w-10 h-10 rounded-full bg-destructive/10 items-center justify-center mr-3">
                <ShieldAlert size={20} color="#DC2626" />
              </View>
              <View>
                <Text className="text-foreground font-semibold text-sm">
                  Suspended Vendors
                </Text>
                <Text className="text-muted-foreground text-xs">
                  You have 6 suspended vendors.
                </Text>
              </View>
            </View>
            <TouchableOpacity className="bg-secondary px-4 py-2 rounded-full" onPress={() => { setSelectedCategory("all"); setSearchQuery("Glam Touch Makeup"); }}>
              <Text className="text-secondary-foreground text-sm font-medium">
                View List
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <AdminFooter activeTab="vendors" />
    </SafeAreaView>
  );
}
