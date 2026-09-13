import type {
  LocationPreference,
  LocationRankableVendor,
  SupportedCity,
} from "@/locations/types";

export type VendorProximity = "pincode" | "area" | "city" | "other";

export function findSupportedSelection(
  cities: SupportedCity[],
  preference: LocationPreference | null,
) {
  if (!preference) return null;
  const city = cities.find((item) => item.id === preference.cityId && item.isActive);
  if (!city) return null;
  const area = preference.areaId
    ? city.areas.find((item) => item.id === preference.areaId && item.isActive) ?? null
    : null;
  if (preference.areaId && !area) return null;
  return { city, area };
}

export function formatLocationPreference(
  cities: SupportedCity[],
  preference: LocationPreference | null,
) {
  const selected = findSupportedSelection(cities, preference);
  if (!selected) return "Choose location";
  return selected.area
    ? `${selected.area.name}, ${selected.city.name}`
    : `${selected.city.name}, ${selected.city.state}`;
}

export function vendorLocationPriority(
  vendor: LocationRankableVendor,
  preference: LocationPreference | null,
) {
  if (!preference) return 0;
  const locations = vendor.serviceLocations?.length
    ? vendor.serviceLocations
    : [{
      cityId: vendor.primaryCityId ?? "",
      areaId: vendor.primaryAreaId ?? null,
      pincode: null,
    }];
  if (
    preference.pincode
    && locations.some((item) => item.pincode === preference.pincode)
  ) return 4;
  if (
    preference.areaId
    && locations.some((item) => item.areaId === preference.areaId)
  ) return 3;
  if (locations.some((item) => item.cityId === preference.cityId)) return 2;
  return 1;
}

export function getVendorProximity(
  vendor: LocationRankableVendor,
  preference: LocationPreference | null,
): VendorProximity {
  const priority = vendorLocationPriority(vendor, preference);
  if (priority === 4) return "pincode";
  if (priority === 3) return "area";
  if (priority === 2) return "city";
  return "other";
}

export function rankVendorsByLocation<T extends LocationRankableVendor>(
  preSortedEligibleVendors: T[],
  preference: LocationPreference | null,
  strictCityOnly = false,
) {
  if (!preference) return [...preSortedEligibleVendors];
  return preSortedEligibleVendors
    .map((vendor, originalIndex) => ({
      vendor,
      originalIndex,
      priority: vendorLocationPriority(vendor, preference),
    }))
    .filter((item) => !strictCityOnly || item.priority >= 2)
    .sort((left, right) =>
      right.priority - left.priority || left.originalIndex - right.originalIndex)
    .map((item) => item.vendor);
}

export function vendorMembershipPriority(planName?: string | null) {
  const normalizedPlan = planName?.trim().toLowerCase().replace(/\s+plan$/, "") ?? "";
  if (normalizedPlan === "elite") return 2;
  if (normalizedPlan === "premium") return 1;
  return 0;
}

/**
 * Ranks a Top Rated rail by the customer's saved location first, then by
 * rating quality. Vendors outside the selected city remain as a fallback so
 * the rail does not become sparse.
 */
export function rankTopRatedVendorsByLocation<
  T extends LocationRankableVendor & {
    rating: number;
    reviews: number;
    membershipPlan?: string | null;
  },
>(vendors: T[], preference: LocationPreference | null) {
  return vendors
    .map((vendor, originalIndex) => ({ vendor, originalIndex }))
    .sort((left, right) =>
      vendorLocationPriority(right.vendor, preference)
      - vendorLocationPriority(left.vendor, preference)
      || right.vendor.rating - left.vendor.rating
      || vendorMembershipPriority(right.vendor.membershipPlan)
      - vendorMembershipPriority(left.vendor.membershipPlan)
      || right.vendor.reviews - left.vendor.reviews
      || left.originalIndex - right.originalIndex,
    )
    .map((item) => item.vendor);
}

export function formatCanonicalVendorLocation(parts: {
  localityName?: string | null;
  talukaName?: string | null;
  districtName?: string | null;
  stateName?: string | null;
}) {
  const seen = new Set<string>();
  return [parts.localityName, parts.talukaName, parts.districtName, parts.stateName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => {
      if (!part) return false;
      const key = part.toLocaleLowerCase("en-IN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

/**
 * Keeps location as the primary ranking signal, then promotes paid membership
 * within the same proximity group. The incoming order remains the final
 * tie-breaker, so callers retain their rating, price, or popularity ordering.
 */
export function rankVendorsByLocationAndMembership<
  T extends LocationRankableVendor & { membershipPlan?: string | null },
>(
  preSortedEligibleVendors: T[],
  preference: LocationPreference | null,
  strictCityOnly = false,
) {
  return preSortedEligibleVendors
    .map((vendor, originalIndex) => ({
      vendor,
      originalIndex,
      locationPriority: vendorLocationPriority(vendor, preference),
      membershipPriority: vendorMembershipPriority(vendor.membershipPlan),
    }))
    .filter((item) => !strictCityOnly || !preference || item.locationPriority >= 2)
    .sort((left, right) =>
      right.locationPriority - left.locationPriority
      || right.membershipPriority - left.membershipPriority
      || left.originalIndex - right.originalIndex)
    .map((item) => item.vendor);
}

export function vendorNearbyLabel(
  vendor: LocationRankableVendor,
  preference: LocationPreference | null,
) {
  const proximity = getVendorProximity(vendor, preference);
  if (proximity === "pincode" || proximity === "area") return "In Your Area";
  if (proximity === "city") return "Nearby";
  return null;
}
