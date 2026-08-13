export type SupportedArea = {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  pincodes?: string[];
};

export type SupportedCity = {
  id: string;
  name: string;
  state: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  areas: SupportedArea[];
  pincodes?: string[];
};

export type LocationPreference = {
  cityId: string;
  areaId: string | null;
  pincode?: string | null;
};

export type VendorServiceLocation = {
  id?: string;
  vendorId: string;
  cityId: string;
  areaId: string | null;
  pincode: string | null;
  isPrimary: boolean;
  cityName: string;
  state: string;
  areaName: string | null;
};

export type LocationUsageCount = {
  kind: "city" | "area";
  id: string;
  vendorCount: number;
  customerCount: number;
};

export type PincodeLookupResult = {
  supported: boolean;
  found?: boolean;
  cached?: boolean;
  pincode: string;
  city?: { id: string; name: string; state: string } | null;
  area?: { id: string; name: string } | null;
  district?: string;
  state?: string;
  officeName?: string;
  provider?: string;
  detected?: { area?: string; city?: string; district?: string; state?: string };
  message?: string;
  geo?: PincodeGeoResolution;
};

// ============================================================================
// Generic State -> District -> Taluka hierarchy (India-wide architecture,
// Maharashtra-only data for now). Kept separate from the legacy
// City/Area types above, which remain in place unchanged.
// ============================================================================

export type GeoState = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

export type GeoDistrict = {
  id: string;
  stateId: string;
  name: string;
  isActive: boolean;
};

export type GeoTaluka = {
  id: string;
  districtId: string;
  name: string;
  /** Public marketplace visibility for already-approved vendors in this
   * Taluka. Independent of acceptingApplications below. */
  isActive: boolean;
  /** Whether NEW vendor applications are accepted from this Taluka. Toggled
   * from the /AdminGeoLocations Taluka availability switches. Turning this
   * off never deletes or hides an already-approved vendor. */
  acceptingApplications: boolean;
};

export type GeoSelection = {
  stateId: string;
  districtId: string;
  talukaId: string | null;
};

export type ValidatedGeoSelection = {
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  talukaId: string;
  talukaName: string;
};

export type PincodeGeoResolution = {
  supported: boolean;
  status: "resolved" | "needs_review" | "unresolved";
  state: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
  taluka: { id: string; name: string } | null;
  ambiguous: boolean;
  /** "official" (data.gov.in / India Post, or Admin-corroborated),
   * "admin_verified" (an Admin manually confirmed the match), or
   * "unofficial_pending_review" (only the postalpincode.in fallback
   * matched -- never silently promoted to canonical without corroboration
   * or Admin sign-off), or "none" when nothing matched at all. */
  sourceTrust: "official" | "admin_verified" | "unofficial_pending_review" | "none";
  localities: PincodeLocality[];
  localitySelectionRequired: boolean;
  /** The authoritative "can a vendor apply from here" decision, computed
   * server-side from the resolved Taluka's accept_vendor_applications and
   * this PIN's resolution trust -- never both offer a Taluka candidate and
   * imply it's safely supported. See supabase/functions/lookup-india-pincode
   * computeApplicationOutcome() for the exact rule. */
  applicationStatus: "resolved_enabled" | "resolved_disabled" | "ambiguous" | "needs_review" | "unresolved";
  applicationMessage: string | null;
};

export type PincodeLocality = {
  id: string;
  name: string;
  officeType: string | null;
  deliveryStatus: string | null;
  trusted: boolean;
  source: string;
  state: { id: string; name: string } | null;
  district: { id: string; name: string } | null;
  taluka: { id: string; name: string } | null;
  /** Present when the locality row itself carries a resolved lat/lng (used
   * as the origin point for GPS-based nearby search when a customer falls
   * back to PIN-code entry instead of granting device location). */
  latitude: number | null;
  longitude: number | null;
};

export type TieredVendorMatch = {
  vendorId: string;
  tier: number;
  distanceKm: number;
  talukaId: string;
  talukaName: string;
  districtName: string;
  stateName: string;
};

export type LocationRankableVendor = {
  serviceLocations?: VendorServiceLocation[];
  primaryCityId?: string | null;
  primaryAreaId?: string | null;
};
