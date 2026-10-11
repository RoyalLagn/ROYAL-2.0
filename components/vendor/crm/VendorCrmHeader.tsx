import React, { useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Bell,
  ChevronDown,
  Menu,
  Search,
} from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorNotifications } from "@/context/VendorNotificationContext";

export interface VendorCrmHeaderProps {
  isDesktop?: boolean;
  onOpenMobileDrawer?: () => void;
  vendorName?: string;
  vendorAvatarUrl?: string | null;
  onSearchChange?: (query: string) => void;
  searchQuery?: string;
}

export default function VendorCrmHeader({
  isDesktop = false,
  onOpenMobileDrawer,
  vendorName = "Tejas Photography",
  vendorAvatarUrl,
  onSearchChange,
  searchQuery = "",
}: VendorCrmHeaderProps) {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const { unreadCount } = useVendorNotifications();

  if (isDesktop) {
    return (
      <View style={[styles.desktopHeader, isDark && styles.headerDark]}>
        {/* Search Bar */}
        <View style={[styles.searchWrap, isDark && styles.searchWrapDark]}>
          <Search size={16} color={isDark ? "#9CA3AF" : "#9CA3AF"} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search bookings, clients..."
            placeholderTextColor={isDark ? "#9CA3AF" : "#9CA3AF"}
            style={[styles.searchInput, isDark && styles.searchInputDark]}
          />
        </View>

        {/* Right Header Actions */}
        <View style={styles.rightActions}>
          {/* Notification Bell */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => router.push("/VendorNotifications")}
            style={({ pressed }) => [
              styles.iconCircleBtn,
              isDark && styles.iconCircleBtnDark,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Bell size={18} color={isDark ? "#E5E7EB" : "#374151"} />
            {unreadCount > 0 ? (
              <View style={styles.notifDot}>
                <Text style={styles.notifDotText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>

          {/* Vendor Profile Pill */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vendor Profile"
            onPress={() => router.push("/Vendors_dash_profile")}
            style={({ pressed }) => [
              styles.profilePill,
              isDark && styles.profilePillDark,
              pressed && { opacity: 0.85 },
            ]}
          >
            {vendorAvatarUrl ? (
              <Image source={{ uri: vendorAvatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerAvatarText}>
                  {vendorName.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileTextWrap}>
              <Text numberOfLines={1} style={[styles.headerVendorName, isDark && styles.textDark]}>
                {vendorName}
              </Text>
              <Text style={styles.headerVendorRole}>Vendor Account</Text>
            </View>
            <ChevronDown size={14} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
    );
  }

  // Mobile Header
  return (
    <View style={[styles.mobileHeader, isDark && styles.headerDark]}>
      {/* Hamburger Menu Toggle Button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Menu"
        onPress={onOpenMobileDrawer}
        style={({ pressed }) => [
          styles.mobileMenuBtn,
          isDark && styles.mobileMenuBtnDark,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Menu size={20} color={isDark ? "#F9FAFB" : "#1F2937"} strokeWidth={2.2} />
      </Pressable>

      {/* Brand Logo in Center */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="RoyalLagn Home"
        onPress={() => router.push("/vendor-dashboard")}
        style={styles.mobileLogoWrap}
      >
        <RoyalLagnLogo width={160} height={42} scale={1.8} />
      </Pressable>

      {/* Right Notifications & Avatar */}
      <View style={styles.mobileRightActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          onPress={() => router.push("/VendorNotifications")}
          style={({ pressed }) => [
            styles.mobileIconBtn,
            isDark && styles.mobileIconBtnDark,
            pressed && { opacity: 0.75 },
          ]}
        >
          <Bell size={18} color={isDark ? "#E5E7EB" : "#374151"} strokeWidth={2} />
          {unreadCount > 0 ? (
            <View style={styles.mobileNotifDot}>
              <Text style={styles.mobileNotifDotText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => router.push("/Vendors_dash_profile")}
          style={({ pressed }) => [
            styles.mobileAvatarWrap,
            pressed && { opacity: 0.8 },
          ]}
        >
          {vendorAvatarUrl ? (
            <Image source={{ uri: vendorAvatarUrl }} style={styles.mobileAvatar} resizeMode="cover" />
          ) : (
            <View style={styles.mobileAvatarPlaceholder}>
              <Text style={styles.mobileAvatarText}>
                {vendorName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopHeader: {
    height: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  mobileHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  headerDark: {
    backgroundColor: "#111827",
    borderBottomColor: "#1F2937",
  },
  textDark: {
    color: "#F9FAFB",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    width: "42%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  searchWrapDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    paddingVertical: 2,
  },
  searchInputDark: {
    color: "#F9FAFB",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    overflow: "hidden",
  },
  iconCircleBtnDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#EF4444",
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  notifDotText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "800",
  },
  profilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 24,
    backgroundColor: "#FDF2F8",
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  profilePillDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  profileTextWrap: {
    marginRight: 4,
  },
  headerVendorName: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#111827",
  },
  headerVendorRole: {
    fontSize: 10.5,
    color: "#6B7280",
  },
  // Mobile elements
  mobileMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  mobileMenuBtnDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  mobileLogoWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mobileRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  mobileIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  mobileIconBtnDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  mobileNotifDot: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  mobileNotifDotText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  mobileAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
  },
  mobileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  mobileAvatarPlaceholder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileAvatarText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
});
