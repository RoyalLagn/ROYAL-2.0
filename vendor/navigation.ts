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
  "/VendorBookings",
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
  "/VendorTransactions",
  "/VendorReviews",
  "/VendorServices",
  "/VendorSettings",
  "/VendorAccountDeletion",
  "/VendorSubscription",
]);

export function isProtectedVendorRoute(pathname: string) {
  return vendorWorkspaceRoutes.has(pathname);
}

// One name and one route for every profile section. Sidebar "Business Details",
// the section tabs, and the readiness checklist all read this list so a
// section cannot be linked twice under different paths.
export const vendorProfileSections = [
  { id: "business", label: "Business information", route: "/VendorEditBusinessInfo" },
  { id: "about", label: "About the business", route: "/VendorEditAbout" },
  { id: "location", label: "Location", route: "/VendorEditLocation" },
  { id: "contact", label: "Contact information", route: "/VendorEditContact" },
  { id: "identity", label: "Logo and brand", route: "/VendorEditBrand" },
  { id: "services", label: "Services & packages", route: "/VendorServices" },
  { id: "portfolio", label: "Portfolio albums", route: "/VendorGallery" },
  { id: "availability", label: "Availability", route: "/VendorCalendar" },
  { id: "tags", label: "Search tags", route: "/VendorEditTags" },
] as const;

export type VendorProfileSectionId = (typeof vendorProfileSections)[number]["id"];

const businessDetailSectionIds = new Set<VendorProfileSectionId>([
  "business",
  "about",
  "location",
  "contact",
  "identity",
  "services",
  "tags",
]);

export function normalizeVendorPath(pathname: string) {
  return pathname.split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
}

export function isVendorSectionActive(pathname: string, route: string) {
  return normalizeVendorPath(pathname) === normalizeVendorPath(route);
}

export function isBusinessDetailsPath(pathname: string) {
  return vendorProfileSections.some(
    (section) => businessDetailSectionIds.has(section.id) && isVendorSectionActive(pathname, section.route),
  );
}
