import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import {
  Bell,
  Ticket,
  Gift,
  Grid3X3,
  Home,
  MessageSquareText,
  Share2,
  User,
} from "lucide-react-native";
import { cssInterop, useColorScheme } from "nativewind";
import { MobileTabBar } from "@/components/MobileTabBar";
import HomeReveal from "@/components/home/HomeReveal";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import DesktopLocationControl from "@/components/home/DesktopLocationControl";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";
import { useNotifications } from "@/context/NotificationContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { shareRoyalLagnApp } from "@/services/AppShareService";

cssInterop(Home, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Gift, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Ticket, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(MessageSquareText, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(User, { className: { target: "style", nativeStyleToProp: { color: true } } });

type NavItemProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function NavItem({ label, active, onPress }: NavItemProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="relative h-16 px-3 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Text
        className={active
          ? "text-primary font-semibold text-sm"
          : "text-foreground/75 font-medium text-sm hover:text-primary transition-colors duration-200"}
      >
        {label}
      </Text>
      {active ? (
        <View className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
      ) : null}
    </Pressable>
  );
}

export default function TabsWebLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 1100;
  const isHome = pathname === "/" || pathname === "/(tabs)";
  const [searchQuery, setSearchQuery] = useState("");
  const openAuthenticationGateway = useAuthenticationGateway();
  const { unreadCount } = useNotifications();
  const { profile, isPublicAuthenticated } = usePublicAuth();

  const submitSearch = () => {
    const query = searchQuery.trim();
    router.push({ pathname: "/Search", params: { query } });
  };
  const shareApp = async () => {
    try {
      await shareRoyalLagnApp();
    } catch {
      Alert.alert("Unable to share", "Please try sharing RoyalLagn again.");
    }
  };

  const isActive = (route: string) => {
    if (route === "/(tabs)") return pathname === "/" || pathname === "/(tabs)";
    return pathname.toLowerCase().includes(route.split("/").pop()?.toLowerCase() ?? "");
  };

  return (
    <View className="flex-1 bg-background">
      {isDesktop ? (
        <HomeReveal
          direction="down"
          className="w-full bg-card/95 border-b border-border/80"
          style={Platform.OS === "web"
            ? ({
                position: "sticky",
                top: 0,
                zIndex: 50,
                boxShadow: isDark
                  ? "0 8px 24px rgba(0,0,0,0.18)"
                  : "0 8px 24px rgba(112,55,82,0.05)",
                backdropFilter: "blur(14px)",
              } as never)
            : undefined}
        >
          <View className="w-full max-w-[1280px] h-[72px] px-6 self-center flex-row items-center">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="RoyalLagn home"
              onPress={() => router.push("/(tabs)")}
              className="mr-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl"
            >
              <RoyalLagnLogo width={172} height={52} scale={1.9} />
            </Pressable>

            <DesktopLocationControl />

            <View className="flex-row items-center mr-4">
              <NavItem
                label="Home"
                active={isActive("/(tabs)")}
                onPress={() => router.push("/(tabs)")}
              />
              <NavItem
                label="Categories"
                active={isActive("/(tabs)/Categories")}
                onPress={() => router.push("/(tabs)/Categories")}
              />
              <NavItem
                label="Referral"
                active={isActive("/(tabs)/referral")}
                onPress={() => router.push("/(tabs)/referral")}
              />
            </View>

            {!isHome ? (
              <CompactSearchBar
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmit={submitSearch}
                placeholder="Search vendors, categories, services..."
                dark={isDark}
                accessibilityLabel="Search vendors, categories and services"
                style={{ flex: 1, maxWidth: 330, marginRight: "auto" }}
              />
            ) : <View className="flex-1" />}

            <View className="flex-row items-center ml-3 gap-1">

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                onPress={() => router.push("/Notifications")}
                className="relative w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Bell size={20} className="text-foreground/75" />
                {unreadCount > 0 ? (
                  <View className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] rounded-full bg-primary border-2 border-card items-center justify-center px-0.5">
                    <Text className="text-white text-caption font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Open enquiries"
                onPress={() => router.push("/(tabs)/enquiry")}
                className="w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <MessageSquareText size={20} className="text-foreground/75" />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share RoyalLagn"
                onPress={shareApp}
                className="w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Share2 size={20} className="text-foreground/75" />
              </Pressable>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel={isPublicAuthenticated ? `Profile for ${profile?.full_name}` : "Profile"}
                onPress={() => void openAuthenticationGateway()}
                className={isPublicAuthenticated
                  ? "h-11 max-w-[150px] px-2 rounded-xl flex-row items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  : "w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"}
              >
                {profile?.profile_image ? (
                  <Image source={{ uri: profile.profile_image }} className="w-8 h-8 rounded-full bg-muted" />
                ) : (
                  <User size={20} className={isActive("/(tabs)/profile") ? "text-primary" : "text-foreground/75"} />
                )}
                {isPublicAuthenticated ? (
                  <Text className="text-foreground text-xs font-semibold ml-2 max-w-[88px]" numberOfLines={1}>
                    {profile?.full_name}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          </View>
        </HomeReveal>
      ) : null}

      <Tabs
        tabBar={(props) => isDesktop ? null : <MobileTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: isDark ? "#EC4899" : "#E91E63",
          tabBarInactiveTintColor: isDark ? "#AAA0A5" : "#787178",
          tabBarLabelPosition: "below-icon",
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => (
              <Home
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="Categories"
          options={{
            title: "Category",
            tabBarIcon: ({ focused }) => (
              <Grid3X3
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="referral"
          options={{
            title: "Referral",
            tabBarIcon: ({ focused }) => (
              <Gift
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="bookings"
          options={{
            title: "Bookings",
            tabBarIcon: ({ focused }) => (
              <Ticket
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="enquiry"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ focused }) => (
              <User
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
