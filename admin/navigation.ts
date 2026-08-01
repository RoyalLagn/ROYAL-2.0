import type React from "react";
import {
  BarChart3,
  Building2,
  CircleHelp,
  ClipboardCheck,
  Clapperboard,
  CreditCard,
  FileBarChart,
  FolderTree,
  MessageSquareText,
  MapPinned,
  Settings,
  Star,
  Users,
  WalletCards,
} from "lucide-react-native";

export type AdminNavigationKey =
  | "dashboard"
  | "approvals"
  | "vendors"
  | "users"
  | "clips"
  | "enquiries"
  | "reviews"
  | "subscriptions"
  | "payments"
  | "categories"
  | "locations"
  | "reports"
  | "settings"
  | "help";

export type AdminNavigationItem = {
  key: AdminNavigationKey;
  label: string;
  route: string;
  icon: React.ElementType;
};

export const adminNavigationGroups: { label: string; items: AdminNavigationItem[] }[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", route: "/admin-dashboard", icon: BarChart3 },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "approvals", label: "Approvals", route: "/VendorApplications", icon: ClipboardCheck },
      { key: "vendors", label: "Vendors", route: "/vendors-admin-listing", icon: Building2 },
      { key: "users", label: "Users", route: "/AdminUsers", icon: Users },
      { key: "clips", label: "Clips", route: "/AdminClips", icon: Clapperboard },
      { key: "enquiries", label: "Enquiries", route: "/AdminEnquiries", icon: MessageSquareText },
      { key: "reviews", label: "Reviews", route: "/AdminReviews", icon: Star },
    ],
  },
  {
    label: "Revenue",
    items: [
      { key: "subscriptions", label: "Subscriptions", route: "/subscriptions-admin", icon: WalletCards },
      { key: "payments", label: "Payments", route: "/payments-admin", icon: CreditCard },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "categories", label: "Categories", route: "/AdminCategories", icon: FolderTree },
      { key: "locations", label: "Locations", route: "/AdminLocations", icon: MapPinned },
      { key: "reports", label: "Reports", route: "/AdminReports", icon: FileBarChart },
      { key: "settings", label: "Settings", route: "/AdminSettings", icon: Settings },
      { key: "help", label: "Help", route: "/AdminHelp", icon: CircleHelp },
    ],
  },
];

export const adminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);

export const adminAuthRoutes = new Set([
  "/AdminLogin",
  "/AdminForgotPassword",
  "/AdminOtpVerification",
  "/AdminCreatePassword",
]);

export const adminWorkspaceRoutes = new Set([
  ...adminNavigationItems.map((item) => item.route),
  "/AdminVendorDetails",
  "/VendorApplicationDetails",
  "/admin-dash-logout",
]);

export function isAdminWorkspaceRoute(pathname: string) {
  return adminWorkspaceRoutes.has(pathname);
}

export function isProtectedAdminRoute(pathname: string) {
  if (adminAuthRoutes.has(pathname)) return false;
  return adminWorkspaceRoutes.has(pathname) || pathname.toLowerCase().includes("admin");
}

export function adminNavigationKeyForPath(pathname: string): AdminNavigationKey {
  if (pathname === "/AdminVendorDetails") return "vendors";
  if (pathname === "/VendorApplicationDetails") return "approvals";
  return adminNavigationItems.find((item) => item.route === pathname)?.key ?? "dashboard";
}
