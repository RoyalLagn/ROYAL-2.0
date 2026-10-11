import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Grid3X3, Heart, Home, MapPin, MessageSquareText, Share2, Ticket, User } from "lucide-react-native";
import { cssInterop, useColorScheme } from "nativewind";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import HomeReveal from "@/components/home/HomeReveal";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import DesktopLocationControl from "@/components/home/DesktopLocationControl";
import LocationSelector from "@/components/home/LocationSelector";
import FavoriteNotificationDot from "@/components/favorites/FavoriteNotificationDot";
import { useAuthenticationGateway } from "@/hooks/useAuthenticationGateway";
import { useFavorites } from "@/context/FavoritesContext";
import { useNotifications } from "@/context/NotificationContext";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { shareRoyalLagnApp } from "@/services/AppShareService";
import {
  DeviceLocationError,
  getCurrentDeviceLocation,
  getDevicePermissionStatus,
  getLastDetectedLocationLabel,
  requestDeviceLocationPermission,
  requestDeviceLocationServices,
  reverseGeocodeLabel,
  shortLocationLabel,
  subscribeToLocationDisplayLabel,
} from "@/services/deviceLocation";
import { useCustomerLocation } from "@/context/LocationContext";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";
import { BREAKPOINTS } from "@/utils/responsiveLayout";
import Pressable from "@/components/InteropSafePressable";

cssInterop(Home, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Heart, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(Ticket, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(MessageSquareText, { className: { target: "style", nativeStyleToProp: { color: true } } });
cssInterop(User, { className: { target: "style", nativeStyleToProp: { color: true } } });

type PublicWebNavbarProps = {
  activeRoute?: "Home" | "NearMe" | "Categories" | "Enquiry" | "Referral" | "Bookings";
  showMobile?: boolean;
  includeSafeTop?: boolean;
  locationControl?: React.ReactNode;
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
      onPress={() => { if (!active) onPress(); }}
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
  showMobile = true,
  includeSafeTop = false,
  locationControl,
}: PublicWebNavbarProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileLayoutWidth, setMobileLayoutWidth] = useState(0);
  const [deviceLocationLabel, setDeviceLocationLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const openAuthenticationGateway = useAuthenticationGateway();
  const { unreadCount } = useNotifications();
  const { profile, isPublicAuthenticated } = usePublicAuth();
  const { location } = useCustomerLocation();
  const colors = brandColors(isDark);
  const nativeTablet = Platform.OS !== "web" && Math.min(width, height) >= 600;

  useEffect(() => {
    let active = true;
    void getLastDetectedLocationLabel().then((label) => {
      if (active && label) setDeviceLocationLabel(label);
    });
    const unsubscribe = subscribeToLocationDisplayLabel((label) => {
      if (active) setDeviceLocationLabel(label);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const fetchCurrentLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      let permission = await getDevicePermissionStatus();
      if (permission !== "granted") permission = await requestDeviceLocationPermission();
      if (permission !== "granted") {
        Alert.alert("Location permission needed", "Allow location access to detect your current location.");
        return;
      }
      if (!(await requestDeviceLocationServices())) {
        Alert.alert("Turn on location", "Enable location services, then tap the location button again.");
        return;
      }
      const coordinates = await getCurrentDeviceLocation();
      const label = await reverseGeocodeLabel(coordinates);
      setDeviceLocationLabel(label ?? "Current location");
    } catch (error) {
      const message = error instanceof DeviceLocationError && error.reason === "timeout"
        ? "Location detection timed out. Please try again."
        : "We couldn't detect your current location. Check location services and try again.";
      Alert.alert("Location unavailable", message);
    } finally {
      setLocating(false);
    }
  }, [locating]);

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

  if (Platform.OS !== "web" || width < 1100) {
    if (!showMobile) return null;
    const availableWidth = mobileLayoutWidth || width;
    const horizontalInset = availableWidth < 380 ? 14 : availableWidth < 480 ? 18 : 20;
    const contentWidth = Math.max(0, availableWidth - horizontalInset * 2);
    const headerSideWidth = availableWidth < BREAKPOINTS.normalPhone ? 96 : 108;
    const logoWidth = Math.max(96, Math.min(176, contentWidth - headerSideWidth * 2));

    return (
      <SafeAreaView
        edges={includeSafeTop ? ["top", "left", "right"] : ["left", "right"]}
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          if (nextWidth > 0 && nextWidth !== mobileLayoutWidth) setMobileLayoutWidth(nextWidth);
        }}
        style={[mobileStyles.safeArea, { backgroundColor: colors.background }]}
      >
        <View style={[mobileStyles.header, { width: contentWidth }]}>
          <View style={[mobileStyles.locationSlot, { width: headerSideWidth }]}>
          {locationControl ?? (nativeTablet ? (
            <View style={mobileStyles.tabletLocation}>
              <LocationSelector dark={isDark} compact homeHeader />
            </View>
          ) : <Pressable
              accessibilityRole="button"
              accessibilityLabel={locating ? "Detecting current location" : "Detect current location"}
              accessibilityState={{ busy: locating, disabled: locating }}
              disabled={locating}
              onPress={() => void fetchCurrentLocation()}
              hitSlop={4}
              style={({ pressed }) => [mobileStyles.location, pressed && mobileStyles.pressed]}
            >
              <View style={[mobileStyles.locationIcon, { backgroundColor: colors.actionTint }]}>
                {locating
                  ? <ActivityIndicator size="small" color={colors.primaryStrong} />
                  : <MapPin size={15} color={colors.primaryStrong} strokeWidth={2.1} />}
              </View>
              <View style={mobileStyles.locationCopy}>
                <Text style={[mobileStyles.locationLabel, { color: colors.mutedForeground }]}>Location</Text>
                <Text style={[mobileStyles.locationValue, { color: colors.primaryStrong }]} numberOfLines={1}>
                  {shortLocationLabel(deviceLocationLabel || location)}
                </Text>
              </View>
          </Pressable>)}
          </View>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel="RoyalLagn home"
            onPress={() => router.push("/(tabs)")}
            style={({ pressed }) => [mobileStyles.logo, pressed && mobileStyles.pressed]}
          >
            <RoyalLagnLogo width={logoWidth} height={44} />
          </Pressable>

          <View style={[mobileStyles.actions, { width: headerSideWidth }]}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open enquiries"
              onPress={() => router.push("/(tabs)/enquiry")}
              hitSlop={4}
              style={({ pressed }) => [mobileStyles.action, pressed && mobileStyles.pressed]}
            >
              <MessageSquareText size={19} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              onPress={() => router.push("/Notifications")}
              hitSlop={4}
              style={({ pressed }) => [mobileStyles.action, pressed && mobileStyles.pressed]}
            >
              <Bell size={20} color={colors.foreground} />
              {unreadCount > 0 ? (
                <View style={[mobileStyles.badge, { borderColor: colors.background }]}>
                  <Text style={mobileStyles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share RoyalLagn"
              onPress={shareApp}
              hitSlop={4}
              style={({ pressed }) => [mobileStyles.action, pressed && mobileStyles.pressed]}
            >
              <Share2 size={20} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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

        <DesktopLocationControl />

        <View className="flex-row items-center mr-4">
          <NavItem label="Home" active={activeRoute === "Home"} onPress={() => router.push("/(tabs)")} />
          <NavItem label="Categories" active={activeRoute === "Categories"} onPress={() => router.push("/(tabs)/Categories")} />
          <NavItem label="Referral" active={activeRoute === "Referral"} onPress={() => router.push("/(tabs)/referral")} />
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
        </View>
      </View>
    </HomeReveal>
  );
}

const mobileStyles = StyleSheet.create({
  safeArea: {
    width: "100%",
    alignSelf: "stretch",
    zIndex: 50,
  },
  header: {
    width: "100%",
    minHeight: 52,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
  },
  locationSlot: {
    minWidth: 0,
    flexShrink: 0,
    justifyContent: "center",
  },
  location: {
    width: "100%",
    minHeight: 44,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
  },
  tabletLocation: { width: "33.333%", minHeight: 44, justifyContent: "center" },
  locationIcon: {
    width: 27,
    height: 27,
    flexShrink: 0,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  locationCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  locationLabel: { fontFamily: fonts.sans.medium, fontSize: 9, lineHeight: 11 },
  locationValue: { marginTop: 1, fontFamily: fonts.sans.bold, fontSize: typeScale.caption, lineHeight: 15 },
  logo: { flex: 1, minWidth: 0, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  actions: { flexShrink: 0, flexDirection: "row", alignItems: "center" },
  action: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 3,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 2,
    backgroundColor: brandPalette.light.primaryStrong,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.caption },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
