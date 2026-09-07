import type React from "react";
import {
  BarChart3,
  Bell,
  Building2,
  CircleHelp,
  ClipboardCheck,
  Clapperboard,
  CreditCard,
  FileBarChart,
  FileText,
  HandCoins,
  FolderTree,
  MessageSquareText,
  MapPinned,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Star,
  Target,
  Users,
  WalletCards,
} from "lucide-react-native";

export type AdminNavigationKey =
  | "dashboard"
  | "notifications"
  | "approvals"
  | "vendors"
  | "users"
  | "clips"
  | "enquiries"
  | "reviews"
  | "subscriptions"
  | "payments"
  | "finance"
  | "crm"
  | "hero"
  | "featuredVendors"
  | "push"
  | "categories"
  | "locations"
  | "reports"
  | "terms"
  | "privacy"
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
      { key: "notifications", label: "Notifications", route: "/AdminNotifications", icon: Bell },
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
      { key: "finance", label: "Finance", route: "/AdminFinance", icon: HandCoins },
    ],
  },
  {
    label: "Acquisition",
    items: [
      { key: "crm", label: "Vendor Acquisition CRM", route: "/AdminCrm", icon: Target },
    ],
  },
  {
    label: "Platform",
    items: [
      { key: "hero", label: "Hero Section", route: "/AdminHero", icon: PanelsTopLeft },
      { key: "featuredVendors", label: "Featured Vendors", route: "/AdminFeaturedVendors", icon: Sparkles },
      { key: "push", label: "Push Notifications", route: "/AdminPushNotifications", icon: Bell },
      { key: "categories", label: "Categories", route: "/AdminCategories", icon: FolderTree },
      { key: "locations", label: "Locations", route: "/AdminGeoLocations", icon: MapPinned },
      { key: "reports", label: "Reports", route: "/AdminReports", icon: FileBarChart },
      { key: "terms", label: "Terms & Conditions", route: "/AdminTerms", icon: FileText },
      { key: "privacy", label: "Privacy Policy", route: "/AdminPrivacy", icon: FileText },
      { key: "settings", label: "Settings", route: "/AdminSettings", icon: Settings },
      { key: "help", label: "Help & Support", route: "/AdminHelp", icon: CircleHelp },
    ],
  },
];

export const adminNavigationItems = adminNavigationGroups.flatMap((group) => group.items);

export const adminAuthRoutes = new Set([
  "/AdminLogin",
  "/AdminForgotPassword",
  "/AdminOtpVerification",
  "/AdminCreatePassword",
  "/AdminMfaSetup",
  "/AdminMfaVerify",
]);

export const adminWorkspaceRoutes = new Set([
  ...adminNavigationItems.map((item) => item.route),
  "/AdminVendorDetails",
  "/AdminVendorDeletionRequests",
  "/AdminNotifications",
  "/VendorApplicationDetails",
  "/AdminProfile",
  "/admin-dash-logout",
  "/AdminCrmStates",
  "/AdminCrmDistricts",
  "/AdminCrmTalukas",
  "/AdminCrmClusters",
  "/AdminCrmCategories",
  "/AdminCrmClusterCategories",
  "/AdminCrmVendors",
  "/AdminCrmVendorProfile",
  "/AdminCrmTasks",
  "/AdminCrmReports",
  "/AdminCrmCreateWorkspace",
  "/AdminCrmWorkspaces",
  "/AdminCrmMarketingWorkspaces",
  "/AdminCrmMarketingWorkspaceCreate",
  "/AdminCrmMarketingWorkspaceAssign",
  "/AdminCrmMarketingWorkspaceDetail",
]);

export function isAdminWorkspaceRoute(pathname: string) {
  return adminWorkspaceRoutes.has(pathname);
}

export function isProtectedAdminRoute(pathname: string) {
  if (adminAuthRoutes.has(pathname)) return false;
  return adminWorkspaceRoutes.has(pathname) || pathname.toLowerCase().includes("admin");
}

const crmDrillDownRoutes = new Set([
  "/AdminCrmStates",
  "/AdminCrmDistricts",
  "/AdminCrmTalukas",
  "/AdminCrmClusters",
  "/AdminCrmCategories",
  "/AdminCrmClusterCategories",
  "/AdminCrmVendors",
  "/AdminCrmVendorProfile",
  "/AdminCrmTasks",
  "/AdminCrmReports",
  "/AdminCrmCreateWorkspace",
  "/AdminCrmWorkspaces",
  "/AdminCrmMarketingWorkspaces",
  "/AdminCrmMarketingWorkspaceCreate",
  "/AdminCrmMarketingWorkspaceAssign",
  "/AdminCrmMarketingWorkspaceDetail",
]);

export function adminNavigationKeyForPath(pathname: string): AdminNavigationKey {
  if (pathname === "/AdminVendorDetails") return "vendors";
  if (pathname === "/AdminVendorDeletionRequests") return "settings";
  if (pathname === "/VendorApplicationDetails") return "approvals";
  if (crmDrillDownRoutes.has(pathname)) return "crm";
  return adminNavigationItems.find((item) => item.route === pathname)?.key ?? "dashboard";
}
