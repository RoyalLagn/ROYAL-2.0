import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronRight, FolderTree, MapPinned, ShieldCheck, Users, WalletCards } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAdminAuth } from "@/context/AdminAuthContext";

const destinations = [{ title: "User directory", description: "View customer accounts", route: "/AdminUsers", icon: Users }, { title: "Category directory", description: "Inspect live marketplace categories", route: "/AdminCategories", icon: FolderTree }, { title: "Location Management", description: "Manage supported cities, areas and PIN codes", route: "/AdminLocations", icon: MapPinned }, { title: "Subscription configuration", description: "Manage plans, offers and access", route: "/subscriptions-admin", icon: WalletCards }];
export default function AdminSettings() { const router = useRouter(); const { identity } = useAdminAuth(); return <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}><ScrollView contentContainerStyle={{ paddingBottom: 120 }}><ResponsiveContainer><AdminPageHeader title="Settings" subtitle="Administration access and platform configuration" />
  <View className="bg-card border border-border rounded-2xl p-4 mb-5 flex-row items-center"><View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center"><ShieldCheck size={20} className="text-primary" /></View><View className="flex-1 ml-3"><Text className="text-foreground font-bold">{identity?.profile.full_name || "Administrator"}</Text><Text className="text-muted-foreground text-xs capitalize mt-1">{(identity?.profile.role || "admin").replace("_", " ")}</Text></View><ThemeToggle /></View>
  <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">Configuration workspaces</Text><View className="bg-card border border-border rounded-2xl overflow-hidden">{destinations.map((item, index) => { const Icon = item.icon; return <Pressable key={item.route} onPress={() => router.push(item.route as never)} className={index ? "min-h-16 px-4 flex-row items-center border-t border-border" : "min-h-16 px-4 flex-row items-center"}><Icon size={19} className="text-primary" /><View className="flex-1 ml-3"><Text className="text-foreground text-sm font-semibold">{item.title}</Text><Text className="text-muted-foreground text-xs mt-1">{item.description}</Text></View><ChevronRight size={17} className="text-muted-foreground" /></Pressable>; })}</View>
  <Text className="text-muted-foreground text-xs leading-5 mt-5">Security, roles and database permissions continue to be enforced by the existing Supabase policies. This page does not bypass them.</Text>
  </ResponsiveContainer></ScrollView><AdminFooter activeTab="profile" /></SafeAreaView>; }
