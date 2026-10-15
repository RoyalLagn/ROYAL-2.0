import React from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import {
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  ChevronRight,
  Headphones,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  PackageCheck,
  Settings,
  Star,
  User,
  Wallet,
  X,
} from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorNotifications } from "@/context/VendorNotificationContext";
import { useVendorAuth } from "@/context/VendorAuthContext";
import { isBusinessDetailsPath } from "@/vendor/navigation";

export interface NavItem {
  id: string;
  label: string;
  route: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  badgeCount?: number;
}

export interface VendorCrmSidebarProps {
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
  vendorName?: string;
  vendorAvatarUrl?: string | null;
  activeId?: string;
}

export default function VendorCrmSidebar({
  isMobileDrawer = false,
  onCloseMobileDrawer,
  vendorName = "Tejas Photography",
  vendorAvatarUrl,
  activeId = "dashboard",
}: VendorCrmSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const { unreadCount } = useVendorNotifications();
  const { signOut } = useVendorAuth();

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", route: "/vendor-dashboard", icon: LayoutDashboard },
    { id: "profile", label: "Profile", route: "/Vendors_dash_profile", icon: User },
    { id: "business", label: "Business Details", route: "/VendorEditBusinessInfo", icon: Building2 },
    { id: "portfolio", label: "Portfolio", route: "/VendorGallery", icon: ImageIcon },
    { id: "bookings", label: "Bookings", route: "/VendorBookings", icon: CalendarCheck },
    { id: "calendar", label: "Calendar", route: "/VendorCalendar", icon: Calendar },
    { id: "reviews", label: "Reviews", route: "/VendorReviews", icon: Star },
    { id: "marketing", label: "Marketing Tools", route: "/vendor-marketing-center", icon: Megaphone },
    { id: "wallet", label: "Transactions", route: "/VendorPaymentHistory", icon: Wallet },
    { id: "notifications", label: "Notifications", route: "/VendorNotifications", icon: Bell, badgeCount: unreadCount },
    { id: "settings", label: "Settings", route: "/VendorSettings", icon: Settings },
  ];

  const handleNavigate = (route: string) => {
    if (isMobileDrawer && onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
    router.push(route as any);
  };

  const handleLogout = async () => {
    if (isMobileDrawer && onCloseMobileDrawer) {
      onCloseMobileDrawer();
    }
    await signOut();
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.container, isMobileDrawer && styles.drawerContainer, isDark && styles.containerDark]}>
      {/* Top Header / Brand */}
      {isMobileDrawer ? (
        <View style={[styles.drawerHeader, isDark && styles.borderDark]}>
          <RoyalLagnLogo width={160} height={42} scale={1.8} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={onCloseMobileDrawer}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <X size={20} color={isDark ? "#F9FAFB" : "#374151"} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.desktopLogoWrap}>
          <RoyalLagnLogo width={175} height={46} scale={1.85} />
        </View>
      )}

      {/* Mobile Vendor Profile Card */}
      {isMobileDrawer ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => handleNavigate("/Vendors_dash_profile")}
          style={({ pressed }) => [
            styles.mobileProfileRow,
            isDark && styles.mobileProfileRowDark,
            pressed && { opacity: 0.8 },
          ]}
        >
          {vendorAvatarUrl ? (
            <Image source={{ uri: vendorAvatarUrl }} style={styles.drawerAvatar} />
          ) : (
            <View style={styles.drawerAvatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {vendorName.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.drawerProfileName, isDark && styles.textDark]}>
              {vendorName}
            </Text>
            <Text style={styles.drawerProfileSub}>Vendor Account</Text>
          </View>
          <ChevronRight size={16} color="#9CA3AF" />
        </Pressable>
      ) : null}

      {/* Navigation Links Scrollable List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.navScroll}
        style={{ flex: 1 }}
      >
        <View style={styles.navGroup}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const p = pathname.toLowerCase();
            let isActive = false;
            if (item.id === "dashboard") {
              isActive = p === "/vendor-dashboard" || p === "/vendor-dashboard/";
            } else if (item.id === "profile") {
              isActive = p.startsWith("/vendors_dash_profile") || p.startsWith("/vendorsprofile") || p.startsWith("/vendoreditprofile");
            } else if (item.id === "business") {
              isActive = isBusinessDetailsPath(pathname);
            } else if (item.id === "portfolio") {
              isActive = p.startsWith("/vendorgallery") || p.startsWith("/vendoralbum") || p.startsWith("/vendorportfolio");
            } else if (item.id === "bookings") {
              isActive = p.startsWith("/vendorbookings");
            } else if (item.id === "enquiries") {
              isActive = p.startsWith("/vendorenquiries");
            } else if (item.id === "calendar") {
              isActive = p.startsWith("/vendorcalendar");
            } else if (item.id === "reviews") {
              isActive = p.startsWith("/vendorreviews");
            } else if (item.id === "marketing") {
              isActive = p.startsWith("/vendor-marketing-center") || p.startsWith("/vendor-marketing-card") || p.startsWith("/vendorfeaturedplacement");
            } else if (item.id === "wallet") {
              isActive = p.startsWith("/vendorpaymenthistory") || p.startsWith("/vendortransactions") || p.startsWith("/vendorsubscription");
            } else if (item.id === "notifications") {
              isActive = p.startsWith("/vendornotifications");
            } else if (item.id === "settings") {
              isActive = p.startsWith("/vendorsettings") || p.startsWith("/vendoraccountdeletion") || p.startsWith("/vendorhelp") || p.startsWith("/vendorprivacypolicy") || p.startsWith("/vendorterms");
            }

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => handleNavigate(item.route)}
                style={({ pressed, hovered }: any) => [
                  styles.navItem,
                  isActive && styles.navItemActive,
                  !isActive && hovered && styles.navItemHovered,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Icon
                  size={18}
                  color={isActive ? "#FFFFFF" : isDark ? "#D1D5DB" : "#4B5563"}
                  strokeWidth={isActive ? 2.4 : 1.9}
                />
                <Text
                  style={[
                    styles.navItemText,
                    isActive && styles.navItemTextActive,
                    !isActive && isDark && styles.textDark,
                  ]}
                >
                  {item.label}
                </Text>

                {/* Badge Count */}
                {typeof item.badgeCount === "number" && item.badgeCount > 0 ? (
                  <View style={[styles.badgePill, isActive && styles.badgePillActive]}>
                    <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                      {item.badgeCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Desktop Help Card */}
        {!isMobileDrawer ? (
          <View style={[styles.helpCard, isDark && styles.helpCardDark]}>
            <View style={styles.helpIconCircle}>
              <Headphones size={18} color="#E91E63" strokeWidth={2.2} />
            </View>
            <Text style={[styles.helpTitle, isDark && styles.textDark]}>
              Need Help?
            </Text>
            <Text style={styles.helpSubtitle}>
              Contact our support team for any queries.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => handleNavigate("/VendorHelp")}
              style={({ pressed }) => [styles.helpBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.helpBtnText}>Contact Support</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Mobile Drawer Logout Button */}
      {isMobileDrawer ? (
        <View style={[styles.drawerFooter, isDark && styles.borderDark]}>
          <Pressable
            accessibilityRole="button"
            onPress={handleLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              isDark && styles.logoutBtnDark,
              pressed && { opacity: 0.8 },
            ]}
          >
            <LogOut size={16} color="#E91E63" strokeWidth={2.2} />
            <Text style={styles.logoutBtnText}>Logout</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#F3F4F6",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  drawerContainer: {
    width: "100%",
    borderRightWidth: 0,
  },
  containerDark: {
    backgroundColor: "#111827",
    borderRightColor: "#1F2937",
  },
  borderDark: {
    borderBottomColor: "#1F2937",
    borderTopColor: "#1F2937",
  },
  textDark: {
    color: "#F9FAFB",
  },
  desktopLogoWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    alignItems: "flex-start",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  closeBtn: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#FDF2F8",
    gap: 10,
  },
  mobileProfileRowDark: {
    backgroundColor: "#1F2937",
  },
  drawerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  drawerAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  drawerProfileName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#111827",
  },
  drawerProfileSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  navScroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 16,
  },
  navGroup: {
    gap: 3,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  navItemHovered: {
    backgroundColor: "#F9FAFB",
  },
  navItemActive: {
    backgroundColor: "#E91E63",
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  navItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    flex: 1,
  },
  navItemTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  badgePill: {
    backgroundColor: "#E91E63",
    paddingHorizontal: 6.5,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  badgePillActive: {
    backgroundColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  badgeTextActive: {
    color: "#E91E63",
  },
  helpCard: {
    backgroundColor: "#FDF2F8",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#FCE7F3",
    marginTop: 10,
    gap: 6,
  },
  helpCardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  helpIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  helpSubtitle: {
    fontSize: 11,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 15,
  },
  helpBtn: {
    backgroundColor: "#E91E63",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginTop: 4,
    width: "100%",
    alignItems: "center",
  },
  helpBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  drawerFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FDF2F8",
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  logoutBtnDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E91E63",
  },
});
