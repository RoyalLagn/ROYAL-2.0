import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";
import type {
  LocationPreference,
  LocationUsageCount,
  PincodeLookupResult,
  SupportedArea,
  SupportedCity,
  VendorServiceLocation,
} from "@/locations/types";
export {
  findSupportedSelection,
  formatLocationPreference,
  getVendorProximity,
  rankVendorsByLocation,
  rankVendorsByLocationAndMembership,
  vendorMembershipPriority,
  vendorLocationPriority,
  vendorNearbyLabel,
} from "@/locations/domain";

const GUEST_PREFERENCE_KEY = "royallagn:guest-location-preference:v1";
let activeLocationsCache: SupportedCity[] | null = null;
let activeLocationsRequest: Promise<SupportedCity[]> | null = null;

const number = (value: unknown) => Number(value ?? 0) || 0;

function mapArea(row: any): SupportedArea {
  return {
    id: row.id,
    cityId: row.city_id,
    name: row.name,
    slug: row.slug,
    isActive: Boolean(row.is_active),
    displayOrder: number(row.display_order),
    pincodes: (row.supported_pincodes ?? []).map((item: any) => item.pincode),
  };
}

function mapCity(row: any): SupportedCity {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    slug: row.slug,
    isActive: Boolean(row.is_active),
    displayOrder: number(row.display_order),
    pincodes: (row.supported_pincodes ?? [])
      .filter((item: any) => !item.area_id)
      .map((item: any) => item.pincode),
    areas: (row.supported_areas ?? [])
      .map(mapArea)
      .sort((a: SupportedArea, b: SupportedArea) =>
        a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
  };
}

export function invalidateLocationCache() {
  activeLocationsCache = null;
  activeLocationsRequest = null;
}

export async function listActiveLocations(options: { force?: boolean } = {}) {
  if (options.force) invalidateLocationCache();
  if (activeLocationsCache) return activeLocationsCache;
  if (activeLocationsRequest) return activeLocationsRequest;
  const request = (async () => {
    const { data, error } = await supabase
      .from("supported_cities")
      .select("id,name,state,slug,is_active,display_order,supported_areas(id,city_id,name,slug,is_active,display_order)")
      .eq("is_active", true)
      .order("display_order")
      .order("name");
    if (error) throw error;
    const result = (data ?? []).map(mapCity).map((city) => ({
      ...city,
      areas: city.areas.filter((area) => area.isActive),
    }));
    activeLocationsCache = result;
    return result;
  })();
  activeLocationsRequest = request;
  try {
    return await request;
  } finally {
    if (activeLocationsRequest === request) activeLocationsRequest = null;
  }
}

export async function listAdminLocations() {
  const { data, error } = await supabase
    .from("supported_cities")
    .select("id,name,state,slug,is_active,display_order,supported_pincodes(pincode,area_id),supported_areas(id,city_id,name,slug,is_active,display_order,supported_pincodes(pincode,area_id))")
    .order("display_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(mapCity);
}

export async function loadLocationSettings() {
  const { data, error } = await supabase
    .from("location_settings")
    .select("strict_city_only")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return { strictCityOnly: Boolean(data?.strict_city_only) };
}

export async function updateStrictCityMode(strictCityOnly: boolean) {
  const { error } = await supabase
    .from("location_settings")
    .update({ strict_city_only: strictCityOnly })
    .eq("id", true);
  if (error) throw error;
}

export async function loadGuestLocationPreference(): Promise<LocationPreference | null> {
  const stored = await AsyncStorage.getItem(GUEST_PREFERENCE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return typeof parsed?.cityId === "string"
      ? {
        cityId: parsed.cityId,
        areaId: typeof parsed.areaId === "string" ? parsed.areaId : null,
        pincode: typeof parsed.pincode === "string" ? parsed.pincode : null,
      }
      : null;
  } catch {
    return null;
  }
}

export async function saveGuestLocationPreference(preference: LocationPreference) {
  await AsyncStorage.setItem(GUEST_PREFERENCE_KEY, JSON.stringify(preference));
}

export async function loadCustomerLocationPreference(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("preferred_city_id,preferred_area_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.preferred_city_id
    ? {
      cityId: data.preferred_city_id,
      areaId: data.preferred_area_id ?? null,
    } satisfies LocationPreference
    : null;
}

export async function saveCustomerLocationPreference(preference: LocationPreference) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw authError ?? new Error("Log in to save your location.");
  }
  const { data, error } = await supabase.rpc("set_customer_location_preference", {
    target_city_id: preference.cityId,
    target_area_id: preference.areaId ?? null,
  });
  if (error) throw error;
  if (!data) throw new Error("Your customer profile could not save this location.");

  // Keep a local copy as a resilient fallback while the authenticated profile
  // is being restored on a later visit.
  await saveGuestLocationPreference(preference);
}

export function subscribeToLocationChanges(onChange: () => void) {
  const channel = supabase
    .channel(`managed-locations-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "supported_cities" }, () => {
      invalidateLocationCache();
      onChange();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "supported_areas" }, () => {
      invalidateLocationCache();
      onChange();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "location_settings" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function makeLocationSlug(name: string, state?: string) {
  return [name, state]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createSupportedCity(input: {
  name: string;
  state: string;
  displayOrder: number;
  pincodes?: string[];
}) {
  const { data, error } = await supabase.from("supported_cities").insert({
    name: input.name.trim(),
    state: input.state.trim(),
    slug: makeLocationSlug(input.name, input.state),
    display_order: input.displayOrder,
  }).select().single();
  if (error) throw error;
  if (input.pincodes?.length) await upsertSupportedPincodes(data.id, null, input.pincodes);
  invalidateLocationCache();
  return data;
}

export async function updateSupportedCity(cityId: string, changes: {
  name?: string;
  state?: string;
  isActive?: boolean;
  displayOrder?: number;
}) {
  const payload: Record<string, unknown> = {};
  if (changes.name !== undefined) payload.name = changes.name.trim();
  if (changes.state !== undefined) payload.state = changes.state.trim();
  if (changes.name !== undefined || changes.state !== undefined) {
    const { data: current, error: currentError } = await supabase
      .from("supported_cities").select("name,state").eq("id", cityId).single();
    if (currentError) throw currentError;
    payload.slug = makeLocationSlug(changes.name ?? current.name, changes.state ?? current.state);
  }
  if (changes.isActive !== undefined) payload.is_active = changes.isActive;
  if (changes.displayOrder !== undefined) payload.display_order = changes.displayOrder;
  const { error } = await supabase.from("supported_cities").update(payload).eq("id", cityId);
  if (error) throw error;
  invalidateLocationCache();
}

export async function deleteSupportedCity(cityId: string) {
  const { error } = await supabase.from("supported_cities").delete().eq("id", cityId);
  if (error) throw error;
  invalidateLocationCache();
}

export async function createSupportedArea(input: {
  cityId: string;
  name: string;
  displayOrder: number;
  pincodes?: string[];
}) {
  const { data, error } = await supabase.from("supported_areas").insert({
    city_id: input.cityId,
    name: input.name.trim(),
    slug: makeLocationSlug(input.name),
    display_order: input.displayOrder,
  }).select().single();
  if (error) throw error;
  if (input.pincodes?.length) await upsertSupportedPincodes(input.cityId, data.id, input.pincodes);
  invalidateLocationCache();
  return data;
}

export async function updateSupportedArea(areaId: string, changes: {
  name?: string;
  isActive?: boolean;
  displayOrder?: number;
}) {
  const payload: Record<string, unknown> = {};
  if (changes.name !== undefined) {
    payload.name = changes.name.trim();
    payload.slug = makeLocationSlug(changes.name);
  }
  if (changes.isActive !== undefined) payload.is_active = changes.isActive;
  if (changes.displayOrder !== undefined) payload.display_order = changes.displayOrder;
  const { error } = await supabase.from("supported_areas").update(payload).eq("id", areaId);
  if (error) throw error;
  invalidateLocationCache();
}

export async function deleteSupportedArea(areaId: string) {
  const { error } = await supabase.from("supported_areas").delete().eq("id", areaId);
  if (error) throw error;
  invalidateLocationCache();
}

export async function upsertSupportedPincodes(cityId: string, areaId: string | null, pincodes: string[]) {
  const valid = [...new Set(pincodes.map((item) => item.trim()).filter((item) => /^[1-9][0-9]{5}$/.test(item)))];
  if (!valid.length) return;
  const { data: city, error: cityError } = await supabase
    .from("supported_cities").select("state").eq("id", cityId).single();
  if (cityError) throw cityError;
  const { error } = await supabase.from("supported_pincodes").upsert(valid.map((pincode) => ({
    pincode,
    city_id: cityId,
    area_id: areaId,
    state: city.state,
    provider: "admin",
    is_active: true,
  })));
  if (error) throw error;
}

export async function replaceSupportedPincodes(cityId: string, areaId: string | null, pincodes: string[]) {
  let deletion = supabase.from("supported_pincodes").delete().eq("city_id", cityId);
  deletion = areaId ? deletion.eq("area_id", areaId) : deletion.is("area_id", null);
  const { error } = await deletion;
  if (error) throw error;
  await upsertSupportedPincodes(cityId, areaId, pincodes);
}

export async function getLocationUsageCounts() {
  const { data, error } = await supabase.rpc("get_location_usage_counts");
  if (error) throw error;
  return (data ?? []).map((row: any): LocationUsageCount => ({
    kind: row.location_kind,
    id: row.location_id,
    vendorCount: number(row.vendor_count),
    customerCount: number(row.customer_count),
  }));
}

export async function listVendorServiceLocations(vendorId: string) {
  const { data, error } = await supabase
    .from("vendor_service_locations")
    .select("id,vendor_id,city_id,area_id,pincode,is_primary,supported_cities(name,state),supported_areas(name)")
    .eq("vendor_id", vendorId)
    .order("is_primary", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapVendorServiceLocation);
}

export function mapVendorServiceLocation(row: any): VendorServiceLocation {
  const city = Array.isArray(row.supported_cities) ? row.supported_cities[0] : row.supported_cities;
  const area = Array.isArray(row.supported_areas) ? row.supported_areas[0] : row.supported_areas;
  return {
    id: row.id,
    vendorId: row.vendor_id,
    cityId: row.city_id,
    areaId: row.area_id ?? null,
    pincode: row.pincode ?? null,
    isPrimary: Boolean(row.is_primary),
    cityName: city?.name ?? "",
    state: city?.state ?? "",
    areaName: area?.name ?? null,
  };
}

export async function replaceVendorServiceLocations(input: {
  vendorId: string;
  primaryCityId: string;
  primaryAreaId: string | null;
  serviceAreaIds: string[];
  pincode?: string | null;
}) {
  const { data, error } = await supabase.rpc("replace_vendor_service_locations", {
    target_vendor_id: input.vendorId,
    target_primary_city_id: input.primaryCityId,
    target_primary_area_id: input.primaryAreaId,
    target_service_area_ids: input.serviceAreaIds,
    target_pincode: input.pincode || null,
  });
  if (error) throw error;
  return data;
}

export class PincodeLookupUnavailableError extends Error {
  constructor(message = "PIN-code lookup is temporarily unavailable.") {
    super(message);
    this.name = "PincodeLookupUnavailableError";
  }
}

export async function lookupIndianPincode(pincode: string): Promise<PincodeLookupResult> {
  if (!/^[1-9][0-9]{5}$/.test(pincode)) {
    throw new Error("Enter a valid six-digit Indian PIN code.");
  }
  const { data, error } = await supabase.functions.invoke("lookup-india-pincode", {
    body: { pincode },
  });
  if (error) {
    throw new PincodeLookupUnavailableError();
  }
  return data as PincodeLookupResult;
}
