import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import {
  Bell,
  Grid3X3,
  Heart,
  Home,
  MessageSquareText,
  User,
} from "lucide-react-native";
import { cssInterop, useColorScheme } from "nativewind";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTabBar } from "@/components/MobileTabBar";
import LocationSelector from "@/components/home/LocationSelector";
import HomeReveal from "@/components/home/HomeReveal";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";
import FavoriteNotificationDot from "@/components/favorites/FavoriteNotificationDot";
import { useFavorites } from "@/context/FavoritesContext";
import { useNotifications } from "@/context/NotificationContext";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

cssInterop(Home, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Heart, { className: { target: "style", nativeStyleToProp: { color: true } } });
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

function DesktopFavoritesButton({
  active,
  onPress,
}: {
  active: boolean;
  onPress: () => void;
}) {
  const {
    favoriteArrivalToken,
    favoriteIndicatorToken,
    hasUnviewedFavorites,
    registerFavoritesDestination,
  } = useFavorites();
  const reducedMotion = useReducedMotion();
  const arrival = useSharedValue(0);
  const previousArrivalToken = useRef(favoriteArrivalToken);
  const [arriving, setArriving] = useState(false);

  useEffect(() => {
    if (favoriteArrivalToken === previousArrivalToken.current) return;
    previousArrivalToken.current = favoriteArrivalToken;
    setArriving(true);
    if (reducedMotion) {
      arrival.value = 1;
      arrival.value = withTiming(0, { duration: 220 });
    } else {
      arrival.value = withSequence(
        withTiming(1, { duration: 130 }),
        withSpring(0, { damping: 11, stiffness: 220, mass: 0.65 }),
      );
    }
    const timer = setTimeout(() => setArriving(false), reducedMotion ? 240 : 520);
    return () => clearTimeout(timer);
  }, [arrival, favoriteArrivalToken, reducedMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(arrival.value, [0, 1], [1, 1.18]) }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(arrival.value, [0, 0.45, 1], [0, 0.18, 0]),
    transform: [{ scale: interpolate(arrival.value, [0, 1], [0.72, 1.55]) }],
  }));

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={hasUnviewedFavorites ? "Favorites, new favorites available" : "Favorites"}
      onPress={onPress}
      className="h-12 min-w-[70px] px-2 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Animated.View
        ref={registerFavoritesDestination as React.Ref<any>}
        className="relative w-8 h-7 items-center justify-center"
        style={iconStyle}
      >
        <Animated.View
          pointerEvents="none"
          className="absolute w-7 h-7 rounded-full bg-primary"
          style={pulseStyle}
        />
        <Heart
          size={20}
          className={active || arriving ? "text-primary" : "text-foreground/75"}
          fill={active || arriving ? "currentColor" : "none"}
        />
        <FavoriteNotificationDot
          visible={hasUnviewedFavorites}
          animationToken={favoriteIndicatorToken}
        />
      </Animated.View>
      <Text className={active
        ? "text-primary text-2xs font-semibold mt-0.5"
        : "text-muted-foreground text-2xs font-medium mt-0.5"}
      >
        Favorites
      </Text>
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

  const submitSearch = () => {
    router.push({ pathname: "/Search", params: { query: searchQuery.trim() } });
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
            {!isHome ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="RoyalLagn home"
                onPress={() => router.push("/(tabs)")}
                className="flex-row items-center mr-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl"
              >
                <View className="w-9 h-9 rounded-xl bg-primary items-center justify-center mr-2.5">
                  <Heart size={18} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <Text className="text-foreground text-xl font-bold tracking-tight">
                  Royal<Text className="text-primary">Lagn</Text>
                </Text>
              </Pressable>
            ) : null}

            {isHome ? <View className="mr-5"><LocationSelector dark={isDark} compact /></View> : null}

            <View className="flex-row items-center mr-6">
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
                label="Enquiry"
                active={isActive("/(tabs)/enquiry")}
                onPress={() => router.push("/(tabs)/enquiry")}
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
              {!isHome ? <LocationSelector dark={isDark} compact /> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                onPress={() => router.push("/Notifications")}
                className="relative w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Bell size={19} className="text-foreground/75" />
                {unreadCount > 0 ? (
                  <View className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] rounded-full bg-primary border-2 border-card items-center justify-center px-0.5">
                    <Text className="text-white text-[7px] font-bold">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <DesktopFavoritesButton
                active={isActive("/(tabs)/favorites")}
                onPress={() => router.push("/(tabs)/favorites")}
              />

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Profile"
                onPress={() => void openAuthenticationGateway()}
                className="h-12 min-w-[68px] px-2 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <User size={20} className={isActive("/(tabs)/profile") ? "text-primary" : "text-foreground/75"} />
                <Text className={isActive("/(tabs)/profile")
                  ? "text-primary text-2xs font-semibold mt-0.5"
                  : "text-muted-foreground text-2xs font-medium mt-0.5"}
                >
                  Profile
                </Text>
              </Pressable>

              <ThemeToggle />
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
          name="favorites"
          options={{
            title: "Favorites",
            tabBarIcon: ({ focused }) => (
              <Heart
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
                fill={focused ? "currentColor" : "none"}
              />
            ),
          }}
        />
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
          name="enquiry"
          options={{
            title: "Enquiry",
            tabBarIcon: ({ focused }) => (
              <MessageSquareText
                className={focused ? "text-primary" : "text-muted-foreground"}
                size={22}
                strokeWidth={focused ? 2.5 : 2}
              />
            ),
          }}
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
