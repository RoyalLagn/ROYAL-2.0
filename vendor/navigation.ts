// Routes that only make sense for an authenticated, approved and verified
// Vendor -- every one of these already assumes a live vendor workspace
// (they call useVendorWorkspace() or otherwise read the signed-in vendor's
// own data) and had no route guard at all before VendorRouteGuard.
//
// This is a deliberate explicit allow-list, not a "contains 'vendor'"
// heuristic: several routes have "Vendor" in the name but are public-facing
// (VendorsListing, VendorsProfile, VendorPortfolio, VendorAlbum -- browsing
// a vendor's public profile) or admin-facing (VendorApplications,
// VendorApplicationDetails, AdminVendorDetails, vendors-admin-listing --
// reviewing vendors as an admin). Matching those by name would lock out
// customers and admins, so only the screens below are protected.
export const vendorWorkspaceRoutes = new Set([
  "/vendor-dashboard",
  "/vendor-marketing-center",
  "/vendor-marketing-card",
  "/Vendors_dash_profile",
  "/VendorCalendar",
  "/VendorEditAbout",
  "/VendorEditBrand",
  "/VendorEditBusinessInfo",
  "/VendorEditContact",
  "/VendorEditLocation",
  "/VendorEditTags",
  "/VendorEnquiries",
  "/VendorFeaturedPlacement",
  "/VendorGallery",
  "/VendorHelp",
  "/VendorNotifications",
  "/VendorPaymentHistory",
  "/VendorServices",
  "/VendorSettings",
  "/VendorAccountDeletion",
  "/VendorSubscription",
]);

export function isProtectedVendorRoute(pathname: string) {
  return vendorWorkspaceRoutes.has(pathname);
}
