import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Pressable from "@/components/InteropSafePressable";
import {
  Check,
  ChevronDown,
  Clock,
  LocateFixed,
  Mail,
  MapPin,
  ShieldAlert,
  X,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import {
  DeviceLocationError,
  getCurrentDeviceLocation,
  getDevicePermissionStatus,
  hasPreviouslyDeniedLocation,
  requestDeviceLocationPermission,
  reverseGeocodeLabel,
} from "@/services/deviceLocation";
import { DEFAULT_NEARBY_RADIUS_KM } from "@/services/vendorDiscovery";
import { lookupIndianPincode, PincodeLookupUnavailableError } from "@/services/locations";
import type { PincodeLocality } from "@/locations/types";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

// ============================================================================
// Compact "location" bar for a category listing page. Reuses the existing
// GPS flow (services/deviceLocation.ts + fetchNearbyVendors in
// services/vendorDiscovery.ts, called by the parent screen) and the existing
// PIN/locality flow (lookupIndianPincode in services/locations.ts +
// fetchPincodeVendors in services/pincodeVendorDiscovery.ts, also called by
// the parent) -- this component only resolves *where* (coordinates / PIN +
// locality selection), it never fetches vendors itself. The parent screen
// stays the single owner of the category + location -> vendor-list fetch,
// exactly like NearbyVendors.tsx and SearchByLocation.tsx already are for
// their own standalone screens.
// ============================================================================

export type CategoryLocationSelection =
  | {
      mode: "nearMe";
      latitude: number;
      longitude: number;
      /** Best-effort reverse-geocoded "Wakad, Pune"-style label, for display only. */
      label: string | null;
      radiusKm: number;
    }
  | {
      mode: "pincode";
      pincode: string;
      /** null = "All Locations" (every locality for this PIN). */
      localityIds: string[] | null;
      /** Precomputed display label ("All Locations" / "Wakad" / "3 locations"). */
      selectedLabel: string;
    };

type SheetStage =
  | "menu"
  | "locating"
  | "denied"
  | "unavailable"
  | "pinEntry"
  | "pinBrowsing";

type CategoryLocationSelectorProps = {
  dark: boolean;
  value: CategoryLocationSelection | null;
  onChange: (value: CategoryLocationSelection | null) => void;
};

const RECENT_SELECTION_KEY = "royallagn:category-location-recent:v1";

async function loadRecentSelection(): Promise<CategoryLocationSelection | null> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.mode === "nearMe" || parsed?.mode === "pincode") return parsed as CategoryLocationSelection;
    return null;
  } catch {
    return null;
  }
}

async function saveRecentSelection(selection: CategoryLocationSelection) {
  try {
    await AsyncStorage.setItem(RECENT_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // Best-effort only -- losing the "recent" shortcut is not user-facing.
  }
}

function shortLabel(label: string) {
  return label.split(",")[0]?.trim() || label;
}

/** Shared with the parent screen so the category header can show the same
 * label as the sheet's "Recent" row, without duplicating the format logic. */
export function describeCategoryLocationSelection(selection: CategoryLocationSelection): string {
  if (selection.mode === "nearMe") {
    return selection.label ? shortLabel(selection.label) : "Near Me";
  }
  return `${selection.pincode} · ${selection.selectedLabel}`;
}

function pillLabel(value: CategoryLocationSelection | null): string {
  if (!value) return "Select location";
  if (value.mode === "nearMe") return value.label ? `Near ${shortLabel(value.label)}` : "Near Me";
  return `${value.pincode} · ${value.selectedLabel}`;
}

function selectionsEqual(a: CategoryLocationSelection | null, b: CategoryLocationSelection | null) {
  if (a === b) return true;
  if (!a || !b || a.mode !== b.mode) return false;
  if (a.mode === "nearMe" && b.mode === "nearMe") {
    return a.latitude === b.latitude && a.longitude === b.longitude;
  }
  if (a.mode === "pincode" && b.mode === "pincode") {
    return a.pincode === b.pincode && JSON.stringify(a.localityIds) === JSON.stringify(b.localityIds);
  }
  return false;
}

export default function CategoryLocationSelector({ dark, value, onChange }: CategoryLocationSelectorProps) {
  const colors = brandColors(dark);
  const text = dark ? "#F8F2F5" : colors.foreground;
  const muted = colors.mutedForeground;
  const border = colors.border;

  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<SheetStage>("menu");
  const [locationError, setLocationError] = useState("");

  const [pincodeInput, setPincodeInput] = useState("");
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState("");
  const [resolvedPincode, setResolvedPincode] = useState<string | null>(null);
  const [localities, setLocalities] = useState<PincodeLocality[]>([]);
  const [draftLocalityIds, setDraftLocalityIds] = useState<string[] | null>(null);

  const [recent, setRecent] = useState<CategoryLocationSelection | null>(null);

  useEffect(() => {
    let active = true;
    loadRecentSelection().then((stored) => { if (active) setRecent(stored); });
    return () => { active = false; };
  }, []);

  // Every time the sheet re-opens, start clean at the menu -- a stale
  // "denied" or half-typed PIN from a previous visit should never greet the
  // user again.
  useEffect(() => {
    if (!visible) return;
    setStage("menu");
    setLocationError("");
    setPincodeError("");
  }, [visible]);

  const applyNearMeCoords = useCallback(async () => {
    try {
      const coords = await getCurrentDeviceLocation();
      const label = await reverseGeocodeLabel(coords).catch(() => null);
      const selection: CategoryLocationSelection = {
        mode: "nearMe",
        latitude: coords.latitude,
        longitude: coords.longitude,
        label,
        radiusKm: DEFAULT_NEARBY_RADIUS_KM,
      };
      onChange(selection);
      void saveRecentSelection(selection);
      setRecent(selection);
      setVisible(false);
    } catch (error) {
      const reason = error instanceof DeviceLocationError ? error.reason : "unknown";
      if (reason === "denied") {
        setStage("denied");
      } else {
        setStage("unavailable");
        setLocationError("We couldn't access your location. You can try again or search by PIN code instead.");
      }
    }
  }, [onChange]);

  const beginNearMe = useCallback(async () => {
    setStage("locating");
    setLocationError("");
    const [status, previouslyDenied] = await Promise.all([
      getDevicePermissionStatus(),
      hasPreviouslyDeniedLocation(),
    ]);
    if (status === "granted") {
      await applyNearMeCoords();
      return;
    }
    if (previouslyDenied || status === "denied") {
      setStage("denied");
      return;
    }
    // Undetermined and never denied before -- tapping "Near Me" here *is*
    // the explicit user action the OS permission prompt requires, so it's
    // safe to request it directly instead of showing an extra confirmation
    // step first.
    const requested = await requestDeviceLocationPermission();
    if (requested === "granted") {
      await applyNearMeCoords();
    } else {
      setStage("denied");
    }
  }, [applyNearMeCoords]);

  const submitPincode = useCallback(async () => {
    const trimmed = pincodeInput.trim();
    if (!/^[1-9][0-9]{5}$/.test(trimmed)) {
      setPincodeError("Enter a valid six-digit PIN code.");
      return;
    }
    setPincodeLoading(true);
    setPincodeError("");
    try {
      const result = await lookupIndianPincode(trimmed);
      const found = result.geo?.localities ?? [];
      setResolvedPincode(trimmed);
      setLocalities(found);
      setDraftLocalityIds(null);
      setStage("pinBrowsing");
    } catch (error) {
      setPincodeError(
        error instanceof PincodeLookupUnavailableError
          ? "PIN-code lookup is temporarily unavailable. Please try again shortly."
          : "We couldn't resolve that PIN code. Please check it and try again.",
      );
    } finally {
      setPincodeLoading(false);
    }
  }, [pincodeInput]);

  const toggleLocality = useCallback((localityId: string) => {
    setDraftLocalityIds((current) => {
      if (current === null) return [localityId];
      if (current.includes(localityId)) {
        const next = current.filter((id) => id !== localityId);
        return next.length ? next : null; // empty -> back to "All Locations"
      }
      return [...current, localityId];
    });
  }, []);

  const applyPincodeSelection = useCallback(() => {
    if (!resolvedPincode) return;
    const selectedLabel = draftLocalityIds
      ? draftLocalityIds.length === 1
        ? localities.find((locality) => locality.id === draftLocalityIds[0])?.name ?? "1 location"
        : `${draftLocalityIds.length} locations`
      : "All Locations";
    const selection: CategoryLocationSelection = {
      mode: "pincode",
      pincode: resolvedPincode,
      localityIds: draftLocalityIds,
      selectedLabel,
    };
    onChange(selection);
    void saveRecentSelection(selection);
    setRecent(selection);
    setVisible(false);
  }, [resolvedPincode, draftLocalityIds, localities, onChange]);

  const applyRecent = useCallback(() => {
    if (!recent) return;
    onChange(recent);
    setVisible(false);
  }, [recent, onChange]);

  const clearSelection = useCallback(() => {
    onChange(null);
    setVisible(false);
  }, [onChange]);

  const showRecentRow = recent
    && !selectionsEqual(recent, value)
    && stage === "menu";

  const label = useMemo(() => pillLabel(value), [value]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `Change location, currently ${label}` : "Select location"}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        style={({ pressed, hovered }) => [
          styles.trigger,
          { backgroundColor: dark ? colors.card : "#FFF7FA", borderColor: dark ? "#4B3440" : "#F5C2D7" },
          (hovered as boolean) && Platform.OS === "web" && { backgroundColor: dark ? "#2A2428" : "#FFF1F6" },
          pressed && styles.triggerPressed,
        ]}
      >
        <MapPin size={16} color={colors.primary} strokeWidth={2.2} />
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.triggerText, { color: value ? text : muted }]}>
          {label}
        </Text>
        <ChevronDown size={16} color={muted} />
      </Pressable>

      <AnimatedBottomSheet visible={visible} onRequestClose={() => setVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.sheet, { backgroundColor: dark ? "#1B1518" : "#FFFFFF" }]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: text }]}>Select Location</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setVisible(false)}
              style={[styles.closeButton, { backgroundColor: colors.muted }]}
            >
              <X size={18} color={text} />
            </Pressable>
          </View>

          {stage === "menu" ? (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Pressable
                accessibilityRole="button"
                onPress={beginNearMe}
                style={({ pressed }) => [styles.menuRow, { borderColor: border }, pressed && styles.rowPressed]}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.secondary }]}>
                  <LocateFixed size={18} color={colors.primary} />
                </View>
                <Text style={[styles.menuRowText, { color: text }]}>Near Me</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setStage("pinEntry")}
                style={({ pressed }) => [styles.menuRow, { borderColor: border }, pressed && styles.rowPressed]}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.secondary }]}>
                  <Mail size={18} color={colors.primary} />
                </View>
                <Text style={[styles.menuRowText, { color: text }]}>Search by Location</Text>
              </Pressable>

              {showRecentRow ? (
                <>
                  <Text style={[styles.groupLabel, { color: muted }]}>RECENT</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={applyRecent}
                    style={({ pressed }) => [styles.menuRow, { borderColor: border }, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                      <Clock size={18} color={muted} />
                    </View>
                    <Text style={[styles.menuRowText, { color: text }]}>{recent ? describeCategoryLocationSelection(recent) : ""}</Text>
                  </Pressable>
                </>
              ) : null}

              {value ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={clearSelection}
                  style={({ pressed }) => [styles.clearRow, pressed && styles.rowPressed]}
                >
                  <X size={16} color={colors.destructive} />
                  <Text style={[styles.clearRowText, { color: colors.destructive }]}>Clear location</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}

          {stage === "locating" ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.centerStateText, { color: muted }]}>Finding your location…</Text>
            </View>
          ) : null}

          {stage === "denied" || stage === "unavailable" ? (
            <View style={styles.centerState}>
              <View style={[styles.menuIcon, { backgroundColor: colors.muted }]}>
                <ShieldAlert size={20} color={colors.primaryStrong} />
              </View>
              <Text style={[styles.centerStateTitle, { color: text }]}>
                {stage === "denied"
                  ? "Location permission is required for nearby vendors."
                  : "We couldn't access your location."}
              </Text>
              {locationError ? <Text style={[styles.centerStateText, { color: muted }]}>{locationError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                onPress={beginNearMe}
                style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary }, pressed && styles.rowPressed]}
              >
                <LocateFixed size={16} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Allow Location</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setStage("pinEntry")}>
                <Text style={[styles.linkText, { color: colors.primaryStrong }]}>or search by PIN code</Text>
              </Pressable>
            </View>
          ) : null}

          {stage === "pinEntry" ? (
            <View style={styles.pinEntry}>
              <Text style={[styles.pinLabel, { color: text }]}>Enter PIN Code</Text>
              <View style={styles.pinRow}>
                <TextInput
                  value={pincodeInput}
                  onChangeText={(value) => { setPincodeInput(value.replace(/[^0-9]/g, "").slice(0, 6)); setPincodeError(""); }}
                  placeholder="411057"
                  placeholderTextColor={muted}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  style={[styles.pinInput, { color: text, borderColor: border, backgroundColor: dark ? "#100D0E" : "#FAFAFA" }]}
                  accessibilityLabel="PIN code"
                  onSubmitEditing={submitPincode}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={pincodeLoading}
                  onPress={submitPincode}
                  style={({ pressed }) => [styles.primaryActionInline, { backgroundColor: colors.primary }, pressed && styles.rowPressed]}
                >
                  <Text style={styles.primaryActionText}>{pincodeLoading ? "Finding…" : "Find"}</Text>
                </Pressable>
              </View>
              {pincodeError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{pincodeError}</Text> : null}
            </View>
          ) : null}

          {stage === "pinBrowsing" ? (
            <View style={styles.pinBrowsing}>
              <View style={styles.pincodeSummaryRow}>
                <Text style={[styles.pincodeSummary, { color: text }]}>📮 {resolvedPincode}</Text>
                <Pressable accessibilityRole="button" onPress={() => setStage("pinEntry")}>
                  <Text style={[styles.linkText, { color: colors.primaryStrong }]}>Change PIN</Text>
                </Pressable>
              </View>

              {localities.length === 0 ? (
                <Text style={[styles.centerStateText, { color: muted, marginTop: 12 }]}>No locations found for this PIN.</Text>
              ) : (
                <>
                  <Text style={[styles.groupLabel, { color: muted }]}>
                    {localities.length} LOCATION{localities.length === 1 ? "" : "S"} FOUND
                  </Text>
                  <ScrollView style={styles.localityScroll} keyboardShouldPersistTaps="handled">
                    <View style={styles.localityWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: draftLocalityIds === null }}
                        onPress={() => setDraftLocalityIds(null)}
                        style={[
                          styles.localityChip,
                          { borderColor: draftLocalityIds === null ? colors.primary : border, backgroundColor: draftLocalityIds === null ? colors.primary : (dark ? "#1B1518" : "#FFFFFF") },
                        ]}
                      >
                        {draftLocalityIds === null ? <Check size={14} color="#FFFFFF" /> : null}
                        <Text style={[styles.localityChipText, { color: draftLocalityIds === null ? "#FFFFFF" : text }]}>All Locations</Text>
                      </Pressable>
                      {localities.map((locality) => {
                        const active = draftLocalityIds?.includes(locality.id) ?? false;
                        return (
                          <Pressable
                            key={locality.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => toggleLocality(locality.id)}
                            style={[
                              styles.localityChip,
                              { borderColor: active ? colors.primary : border, backgroundColor: active ? colors.primary : (dark ? "#1B1518" : "#FFFFFF") },
                            ]}
                          >
                            {active ? <Check size={14} color="#FFFFFF" /> : null}
                            <Text numberOfLines={1} style={[styles.localityChipText, { color: active ? "#FFFFFF" : text }]}>{locality.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                  <Pressable
                    accessibilityRole="button"
                    onPress={applyPincodeSelection}
                    style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, marginTop: 14 }, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.primaryActionText}>View results</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </AnimatedBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  triggerPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  triggerText: { flex: 1, minWidth: 0, fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  sheet: { paddingHorizontal: 20, paddingTop: 18 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { fontFamily: fonts.sans.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  menuRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  rowPressed: { opacity: 0.72 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  menuRowText: { flex: 1, minWidth: 0, fontFamily: fonts.sans.semibold, fontSize: typeScale.body },
  groupLabel: { marginTop: 16, marginBottom: 4, fontFamily: fonts.sans.bold, fontSize: typeScale.caption, letterSpacing: 0.8 },
  clearRow: { minHeight: 48, marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  clearRowText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  centerState: { minHeight: 220, alignItems: "center", justifyContent: "center", paddingVertical: 12, gap: 6 },
  centerStateTitle: { marginTop: 10, fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, textAlign: "center" },
  centerStateText: { fontFamily: fonts.sans.regular, fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center", maxWidth: 360 },
  primaryAction: { minHeight: 48, marginTop: 14, paddingHorizontal: 22, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryActionInline: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryActionText: { color: "#FFFFFF", fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact },
  linkText: { marginTop: 12, fontFamily: fonts.sans.bold, fontSize: typeScale.metadata, textAlign: "center" },
  errorText: { marginTop: 8, fontFamily: fonts.sans.medium, fontSize: typeScale.caption },
  pinEntry: { paddingBottom: 8 },
  pinLabel: { fontFamily: fonts.sans.semibold, fontSize: typeScale.bodyCompact },
  pinRow: { marginTop: 10, flexDirection: "row", gap: 10, alignItems: "center" },
  pinInput: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.sans.medium, fontSize: typeScale.bodyCompact },
  pinBrowsing: { paddingBottom: 8 },
  pincodeSummaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pincodeSummary: { fontFamily: fonts.serif.bold, fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  localityScroll: { maxHeight: 260, marginTop: 10 },
  localityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  localityChip: { minHeight: 40, maxWidth: 220, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.25, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  localityChipText: { fontFamily: fonts.sans.bold, fontSize: typeScale.bodyCompact, flexShrink: 1 },
});
