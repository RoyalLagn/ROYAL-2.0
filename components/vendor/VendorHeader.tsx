import React from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Bell, Crown, MessageSquareText } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/components/ThemeProvider";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { useVendorNotifications } from "@/context/VendorNotificationContext";
import { useVendorEnquiryUnreadCount } from "@/hooks/useVendorEnquiryUnreadCount";
import { typeStyles } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";
import { vendorTheme } from "./VendorTheme";

const desktopNav = [
  { label: "Dashboard", route: "/vendor-dashboard" },
  { label: "Portfolio", route: "/VendorGallery" },
  { label: "Calendar", route: "/VendorCalendar" },
  { label: "Profile", route: "/Vendors_dash_profile" },
] as const;

export default function VendorHeader(_props: { unread?: number }) {
  // VendorWorkspaceShell provides the universal CRM header and slideout drawer on both Desktop and Mobile across all workspace routes.
  return null;
}
