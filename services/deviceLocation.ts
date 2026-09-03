import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { supabase } from "@/services/supabase";

// ============================================================================
// Thin wrapper around expo-location for the GPS-based "Near Me" flow.
// Mirrors the AsyncStorage-caching convention already used for guest
// location preferences (services/geoLocations.ts GUEST_GEO_PREFERENCE_KEY)
// so the OS permission prompt is requested at most once per denial, never
// re-triggered on every screen render.
// ============================================================================

const PREVIOUSLY_DENIED_KEY = "royallagn:device-location-denied:v1";
const LAST_LOCATION_LABEL_KEY = "royallagn:last-device-location-label:v1";
const LAST_LOCATION_COORDINATES_KEY = "royallagn:last-device-location-coordinates:v1";
const RECENT_COORDINATES_MAX_AGE_MS = 30 * 60 * 1000;

export type DevicePermissionStatus = "granted" | "denied" | "undetermined";

export type DeviceLocationErrorReason = "denied" | "unavailable" | "timeout" | "unknown";

export class DeviceLocationError extends Error {
  reason: DeviceLocationErrorReason;
  constructor(reason: DeviceLocationErrorReason, message: string) {
    super(message);
    this.name = "DeviceLocationError";
    this.reason = reason;
  }
}

export type DeviceCoordinates = { latitude: number; longitude: number };

export async function getLastDetectedCoordinates(): Promise<DeviceCoordinates | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LOCATION_COORDINATES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceCoordinates & { detectedAt?: number };
    if (!Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude)) return null;
    if (!parsed.detectedAt || Date.now() - parsed.detectedAt > RECENT_COORDINATES_MAX_AGE_MS) return null;
    return { latitude: parsed.latitude, longitude: parsed.longitude };
  } catch {
    return null;
  }
}

async function rememberCoordinates(coords: DeviceCoordinates) {
  await AsyncStorage.setItem(LAST_LOCATION_COORDINATES_KEY, JSON.stringify({ ...coords, detectedAt: Date.now() })).catch(() => {});
  return coords;
}

export async function getLastDetectedLocationLabel(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_LOCATION_LABEL_KEY);
}

async function rememberLocationLabel(label: string) {
  await AsyncStorage.setItem(LAST_LOCATION_LABEL_KEY, label).catch(() => {});
  return label;
}

/** Whether the user has already denied the permission in a previous visit
 * to this feature -- lets the screen skip straight to the PIN fallback
 * instead of re-prompting. */
export async function hasPreviouslyDeniedLocation(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(PREVIOUSLY_DENIED_KEY);
  return stored === "1";
}

async function rememberDenied() {
  await AsyncStorage.setItem(PREVIOUSLY_DENIED_KEY, "1");
}

async function forgetDenied() {
  await AsyncStorage.removeItem(PREVIOUSLY_DENIED_KEY);
}

export async function getDevicePermissionStatus(): Promise<DevicePermissionStatus> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status as DevicePermissionStatus;
  } catch {
    return "undetermined";
  }
}

/** Requests the OS permission prompt. Callers should only call this from an
 * explicit user action (tapping "Allow Location"), not on mount, so we
 * never surprise-prompt on first render. */
export async function requestDeviceLocationPermission(): Promise<DevicePermissionStatus> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") await forgetDenied();
    else await rememberDenied();
    return status as DevicePermissionStatus;
  } catch {
    return "undetermined";
  }
}

/** On Android, asks Google Play services to show its native location-settings
 * resolution dialog. The OS still requires the user's explicit confirmation;
 * after they accept, callers can fetch the location immediately. */
export async function requestDeviceLocationServices(): Promise<boolean> {
  try {
    if (await Location.hasServicesEnabledAsync()) return true;
    if (Platform.OS !== "android") return false;
    await Location.enableNetworkProviderAsync();
    return Location.hasServicesEnabledAsync();
  } catch {
    // The promise rejects when the user cancels or the device cannot resolve
    // the setting. Keep that outcome non-fatal and leave the location unset.
    return false;
  }
}

/** Resolves the device's current coordinates. Never throws a raw error --
 * always resolves to coordinates or rejects with a classified
 * DeviceLocationError so the UI can show a specific, friendly message. */
export async function getCurrentDeviceLocation(timeoutMs = 12000): Promise<DeviceCoordinates> {
  const permission = await getDevicePermissionStatus();
  if (permission !== "granted") {
    throw new DeviceLocationError("denied", "Location permission is not granted.");
  }
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new DeviceLocationError("unavailable", "Location services are turned off.");
    }
  } catch (error) {
    if (error instanceof DeviceLocationError) throw error;
    // hasServicesEnabledAsync itself failing shouldn't block the attempt --
    // fall through and let getCurrentPositionAsync be the source of truth.
  }
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new DeviceLocationError("timeout", "Location request timed out.")), timeoutMs);
  });
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
    return rememberCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  } catch (error) {
    if (error instanceof DeviceLocationError) throw error;
    throw new DeviceLocationError("unavailable", "Could not determine your current location.");
  }
}

/** Best-effort "Wakad, Pune"-style label for display only -- never throws,
 * returns null on any failure so the UI can fall back to a generic
 * "Using your current location" message. */
export async function reverseGeocodeLabel(coords: DeviceCoordinates): Promise<string | null> {
  // Expo does not implement reverse geocoding on web. Keep precise device
  // coordinates inside RoyalLagn's existing Supabase boundary and match only
  // a nearby, trusted canonical PIN locality. Never guess from a far centroid.
  if (Platform.OS === "web") {
    try {
      const { data, error } = await supabase.rpc("reverse_geocode_known_locality", {
        customer_latitude: coords.latitude,
        customer_longitude: coords.longitude,
      });
      if (error) return null;
      const place = Array.isArray(data) ? data[0] : data;
      if (!place?.locality_name) return null;
      const unique = [...new Set([place.locality_name, place.district_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())))];
      return rememberLocationLabel(unique.join(", "));
    } catch {
      return null;
    }
  }
  try {
    const results = await Location.reverseGeocodeAsync(coords);
    const place = results?.[0];
    if (!place) return null;
    const primary = place.district || place.subregion || place.city || place.name;
    const secondary = place.city && place.city !== primary ? place.city : place.region;
    const unique = [...new Set([primary, secondary].filter((part): part is string => Boolean(part)))];
    return unique.length ? rememberLocationLabel(unique.join(", ")) : null;
  } catch {
    return null;
  }
}
