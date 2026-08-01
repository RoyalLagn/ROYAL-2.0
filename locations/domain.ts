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

export function vendorNearbyLabel(
  vendor: LocationRankableVendor,
  preference: LocationPreference | null,
) {
  const proximity = getVendorProximity(vendor, preference);
  if (proximity === "pincode" || proximity === "area") return "In Your Area";
  if (proximity === "city") return "Nearby";
  return null;
}

