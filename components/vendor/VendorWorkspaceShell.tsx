import React, { useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname } from "expo-router";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorCrmSidebar from "@/components/vendor/crm/VendorCrmSidebar";
import VendorCrmHeader from "@/components/vendor/crm/VendorCrmHeader";
import VendorBottomNav from "@/components/vendor/VendorBottomNav";
import Pressable from "@/components/InteropSafePressable";

export function isVendorWorkspaceRoute(pathname: string): boolean {
  if (!pathname) return false;
  const path = pathname.toLowerCase();
  // Exclude auth / onboarding / registration routes
  if (
    path.startsWith("/vendorlogin") ||
    path.startsWith("/vendorauth") ||
    path.startsWith("/becomevendor") ||
    path.startsWith("/vendorcreatepassword") ||
    path.startsWith("/vendorforgotpassword") ||
    path.startsWith("/vendorotpverification")
  ) {
    return false;
  }
  return (
    path.startsWith("/vendor-dashboard") ||
    path.startsWith("/vendors_dash_profile") ||
    path.startsWith("/vendorsprofile") ||
    path.startsWith("/vendoreditprofile") ||
    path.startsWith("/vendoreditbusinessinfo") ||
    path.startsWith("/vendoreditabout") ||
    path.startsWith("/vendoreditcontact") ||
    path.startsWith("/vendoreditlocation") ||
    path.startsWith("/vendoredittags") ||
    path.startsWith("/vendoreditbrand") ||
    path.startsWith("/vendorgallery") ||
    path.startsWith("/vendoralbum") ||
    path.startsWith("/vendorportfolio") ||
    path.startsWith("/vendorbookings") ||
    path.startsWith("/vendorenquiries") ||
    path.startsWith("/vendorcalendar") ||
    path.startsWith("/vendorreviews") ||
    path.startsWith("/vendor-marketing-center") ||
    path.startsWith("/vendor-marketing-card") ||
    path.startsWith("/vendorpaymenthistory") ||
    path.startsWith("/vendortransactions") ||
    path.startsWith("/vendornotifications") ||
    path.startsWith("/vendorsettings") ||
    path.startsWith("/vendoraccountdeletion") ||
    path.startsWith("/vendorsubscription") ||
    path.startsWith("/vendorfeaturedplacement") ||
    path.startsWith("/vendorservices") ||
    path.startsWith("/vendorhelp") ||
    path.startsWith("/vendorprivacypolicy") ||
    path.startsWith("/vendorterms")
  );
}

export function VendorWorkspaceShell({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const { data } = useVendorWorkspace();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const isVendorRoute = isVendorWorkspaceRoute(pathname);
  const isDesktop = width >= 900;

  if (!isVendorRoute) {
    return <>{children}</>;
  }

  const vendorName = data.vendor?.business_name || "Tejas Photography";
  const vendorAvatarUrl = data.vendor?.logo_url || data.vendor?.cover_image_url || null;

  if (isDesktop) {
    return (
      <View style={[styles.shell, isDark && styles.shellDark]}>
        {/* Persistent Left Sidebar on Desktop */}
        <VendorCrmSidebar
          isMobileDrawer={false}
          vendorName={vendorName}
          vendorAvatarUrl={vendorAvatarUrl}
        />

        {/* Main Content Pane on Right */}
        <View style={[styles.mainColumn, isDark && styles.mainColumnDark]}>
          {/* Persistent CRM Header at Top */}
          <VendorCrmHeader
            isDesktop={true}
            vendorName={vendorName}
            vendorAvatarUrl={vendorAvatarUrl}
          />

          {/* Page Content */}
          <View style={styles.content}>
            {children}
          </View>
        </View>
      </View>
    );
  }

  // Mobile & Tablet (<900px) Workspace Shell
  return (
    <View style={[styles.mobileShell, isDark && styles.shellDark]}>
      {/* Mobile Slide-out Drawer Modal */}
      <Modal
        visible={isMobileDrawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMobileDrawerOpen(false)}
      >
        <View style={styles.drawerBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Drawer"
            style={styles.drawerBackdropClick}
            onPress={() => setIsMobileDrawerOpen(false)}
          />
          <View style={[styles.drawerSheet, isDark && styles.drawerSheetDark]}>
            <VendorCrmSidebar
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
              vendorName={vendorName}
              vendorAvatarUrl={vendorAvatarUrl}
            />
          </View>
        </View>
      </Modal>

      {/* Top Mobile CRM Header with Hamburger Menu, Logo, Bell, Avatar */}
      <VendorCrmHeader
        isDesktop={false}
        onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
        vendorName={vendorName}
        vendorAvatarUrl={vendorAvatarUrl}
      />

      {/* Main Page Content */}
      <View style={styles.mobileContent}>
        {children}
      </View>

      {/* Mobile Footer Navbar (Dashboard, Bookings, Calendar, Portfolio, Profile) */}
      <VendorBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FFF5F8",
    height: "100%",
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
  },
  mobileShell: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#FFF5F8",
    height: "100%",
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  shellDark: {
    backgroundColor: "#111827",
  },
  mainColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "#FFF8FA",
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  mainColumnDark: {
    backgroundColor: "#111827",
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
  },
  mobileContent: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    maxWidth: "100%",
  },
  // Mobile Drawer Modal
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    flexDirection: "row",
  },
  drawerBackdropClick: {
    flex: 1,
  },
  drawerSheet: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 290,
    maxWidth: "85%",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 3, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  drawerSheetDark: {
    backgroundColor: "#111827",
  },
});
