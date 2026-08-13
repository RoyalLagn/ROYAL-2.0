import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Clapperboard, Grid3X3, Heart, Home, MessageSquareText, Share2, User } from "lucide-react-native";
import { cssInterop, useColorScheme } from "nativewind";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ThemeToggle } from "@/components/ThemeToggle";
import HomeReveal from "@/components/home/HomeReveal";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import FavoriteNotificationDot from "@/components/favorites/FavoriteNotificationDot";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";
import { useFavorites } from "@/context/FavoritesContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { shareRoyalLagnApp } from "@/services/AppShareService";

cssInterop(Home, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Heart, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Clapperboard, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(MessageSquareText, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(User, { className: { target: "style", nativeStyleToProp: { color: true } } });

type PublicWebNavbarProps = {
  activeRoute?: "Home" | "Categories" | "Clips" | "Enquiry";
};

function NavItem({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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
      {active ? <View className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" /> : null}
    </Pressable>
  );
}

function DesktopFavoritesButton({ onPress }: { onPress: () => void }) {
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
      className="relative w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:opacity-80 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Animated.View
        ref={registerFavoritesDestination as React.Ref<any>}
        className="relative w-9 h-9 items-center justify-center"
        style={iconStyle}
      >
        <Animated.View
          pointerEvents="none"
          className="absolute w-7 h-7 rounded-full bg-primary"
          style={pulseStyle}
        />
        <Heart
          size={20}
          className={arriving ? "text-primary" : "text-foreground/75"}
          fill="none"
        />
        <FavoriteNotificationDot
          visible={hasUnviewedFavorites}
          animationToken={favoriteIndicatorToken}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function PublicWebNavbar({
  activeRoute = "Categories",
}: PublicWebNavbarProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const openAuthenticationGateway = useAuthenticationGateway();
  const { unreadCount } = useNotifications();
  const { profile, isPublicAuthenticated } = usePublicAuth();

  if (Platform.OS !== "web" || width < 1100) return null;

  const submitSearch = () => {
    router.push({ pathname: "/Search", params: { query: searchQuery.trim() } });
  };
  const shareApp = async () => {
    try {
      await shareRoyalLagnApp();
    } catch {
      Alert.alert("Unable to share", "Please try sharing RoyalLagn again.");
    }
  };

  return (
    <HomeReveal
      direction="down"
      className="w-full bg-card/95 border-b border-border/80"
      style={{
        position: "relative",
        zIndex: 50,
        boxShadow: isDark
          ? "0 8px 24px rgba(0,0,0,0.18)"
          : "0 8px 24px rgba(112,55,82,0.05)",
        backdropFilter: "blur(14px)",
      } as never}
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

        <View className="flex-row items-center mr-6">
          <NavItem label="Home" active={activeRoute === "Home"} onPress={() => router.push("/(tabs)")} />
          <NavItem label="Near Me" active={false} onPress={() => router.push("/NearbyVendors")} />
          <NavItem label="Categories" active={activeRoute === "Categories"} onPress={() => router.push("/(tabs)/Categories")} />
          <NavItem label="Clips" active={activeRoute === "Clips"} onPress={() => router.push("/(tabs)/clips")} />
          <DesktopFavoritesButton onPress={() => router.push("/(tabs)/favorites")} />
        </View>

        <CompactSearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={submitSearch}
          placeholder="Search vendors, categories, services..."
          dark={isDark}
          accessibilityLabel="Search vendors, categories and services"
          style={{ flex: 1, maxWidth: 330, marginRight: "auto" }}
        />

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
                <Text className="text-white text-caption font-bold">{unreadCount > 99 ? "99+" : unreadCount}</Text>
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
              <User size={20} className="text-foreground/75" />
            )}
            {isPublicAuthenticated ? (
              <Text className="text-foreground text-xs font-semibold ml-2 max-w-[88px]" numberOfLines={1}>
                {profile?.full_name}
              </Text>
            ) : null}
          </Pressable>

          <ThemeToggle size={20} />
        </View>
      </View>
    </HomeReveal>
  );
}
