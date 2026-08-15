/**
 * Lightweight route helpers for root layout — no lucide/icon imports.
 * Full nav config with icons lives in admin/navigation.ts.
 */

export const adminAuthRoutes = new Set([
  "/AdminLogin",
  "/AdminForgotPassword",
  "/AdminOtpVerification",
  "/AdminCreatePassword",
  "/AdminMfaSetup",
  "/AdminMfaVerify",
]);

export const adminWorkspaceRoutes = new Set([
  "/admin-dashboard",
  "/VendorApplications",
  "/vendors-admin-listing",
  "/AdminUsers",
  "/AdminClips",
  "/AdminEnquiries",
  "/AdminReviews",
  "/subscriptions-admin",
  "/payments-admin",
  "/AdminFinance",
  "/AdminCrm",
  "/AdminHero",
  "/AdminPushNotifications",
  "/AdminCategories",
  "/AdminLocations",
  "/AdminGeoLocations",
  "/AdminReports",
  "/AdminSettings",
  "/AdminHelp",
  "/AdminVendorDetails",
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
]);

export function isAdminWorkspaceRoute(pathname: string) {
  return adminWorkspaceRoutes.has(pathname);
}
