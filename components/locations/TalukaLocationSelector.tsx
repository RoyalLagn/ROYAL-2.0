import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { Check, ChevronDown, LocateFixed, MapPin, Search, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { GeoDistrict, GeoSelection, GeoState, GeoTaluka } from "@/locations/types";
import { listActiveGeoDistricts, listActiveGeoTalukas } from "@/services/geoLocations";
import { typeScale, typeLeading } from "@/constants/typography";
import { brandColors } from "@/constants/brandPalette";

type Props = {
  states: GeoState[];
  value: GeoSelection | null;
  onChange: (value: GeoSelection, districtName: string, talukaName: string) => void;
  onClear?: () => void;
  onResolvedLabel?: (districtName: string, talukaName: string) => void;
  onUseCurrentLocation?: () => Promise<void>;
  loading?: boolean;
  hideLabel?: boolean;
  compact?: boolean;
  variant?: "default" | "navbar";
  displayLabel?: string;
};

/**
 * "Where do you need the service?" State -> District -> Taluka picker for
 * the public VendorsListing flow. Independent of the legacy City/Area
 * selector (SupportedLocationField) -- this drives the new geo hierarchy
 * only.
 *
 * Genuinely dependent on the active State list (P1-4 fix): Districts are
 * only ever loaded for the currently selected State, and Talukas only for
 * the currently selected District -- this component never loads India's
 * full hierarchy into the client. When exactly one State is active (true
 * for the current Maharashtra-only rollout) it is preselected automatically,
 * while the State dropdown remains visible so the hierarchy is always clear.
 * Additional active States appear in that searchable dropdown automatically.
 */
export function TalukaLocationSelector({ states, value, onChange, onClear, onResolvedLabel, onUseCurrentLocation, loading, hideLabel = false, compact = false, variant = "default", displayLabel }: Props) {
  const { colorScheme } = useColorScheme();
  const colors = brandColors(colorScheme === "dark");
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [stateQuery, setStateQuery] = useState("");
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [districtQuery, setDistrictQuery] = useState("");
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [focusedSearch, setFocusedSearch] = useState<"state" | "district" | null>(null);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [talukas, setTalukas] = useState<GeoTaluka[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingTalukas, setLoadingTalukas] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [selectedStateName, setSelectedStateName] = useState("");
  const [selectedDistrictName, setSelectedDistrictName] = useState("");
  const [selectedTalukaName, setSelectedTalukaName] = useState("");
  const [usingCurrentLocation, setUsingCurrentLocation] = useState(false);
  const [currentLocationError, setCurrentLocationError] = useState("");

  const showStateStep = states.length > 1;

  // Keep the active State selection in sync with `states` loading in and
  // with a persisted/validated `value` that may belong to a different
  // State than whichever loaded first.
  useEffect(() => {
    if (!states.length) {
      setSelectedStateId(null);
      setSelectedDistrictId(null);
      return;
    }
    setSelectedStateId((current) => {
      if (value?.stateId && states.some((state) => state.id === value.stateId)) return value.stateId;
      if (current && states.some((state) => state.id === current)) return current;
      return states[0].id;
    });
    if (value?.stateId && value?.districtId && states.some((state) => state.id === value.stateId)) {
      setSelectedDistrictId(value.districtId);
    }
  }, [states, value?.districtId, value?.stateId]);

  useEffect(() => {
    if (!selectedStateId) {
      setDistricts([]);
      setSelectedDistrictId(null);
      setTalukas([]);
      return;
    }
    let active = true;
    setLoadingDistricts(true);
    setOptionsError("");
    setDistricts([]);
    setTalukas([]);
    listActiveGeoDistricts(selectedStateId)
      .then((items) => {
        if (!active) return;
        setDistricts(items);
        setSelectedDistrictId((current) => {
          if (current && items.some((district) => district.id === current)) return current;
          return items.length === 1 ? items[0].id : null;
        });
      })
      .catch(() => {
        if (active) setOptionsError("Districts could not be loaded. Close this panel and try again.");
      })
      .finally(() => { if (active) setLoadingDistricts(false); });
    return () => { active = false; };
  }, [selectedStateId]);

  useEffect(() => {
    if (!selectedDistrictId) {
      setTalukas([]);
      return;
    }
    let active = true;
    setLoadingTalukas(true);
    setOptionsError("");
    setTalukas([]);
    listActiveGeoTalukas(selectedDistrictId)
      .then((items) => { if (active) setTalukas(items); })
      .catch(() => {
        if (active) setOptionsError("Talukas could not be loaded. Choose the District again to retry.");
      })
      .finally(() => { if (active) setLoadingTalukas(false); });
    return () => { active = false; };
  }, [selectedDistrictId]);

  useEffect(() => {
    if (!value) {
      setSelectedStateName("");
      setSelectedDistrictName("");
      setSelectedTalukaName("");
      return;
    }
    const state = states.find((item) => item.id === value.stateId);
    const district = districts.find((item) => item.id === value.districtId);
    const taluka = talukas.find((item) => item.id === value.talukaId);
    setSelectedStateName(state?.name ?? "");
    setSelectedDistrictName(district?.name ?? "");
    setSelectedTalukaName(taluka?.name ?? "");
    if (district && taluka) onResolvedLabel?.(district.name, taluka.name);
  }, [value, states, districts, talukas, onResolvedLabel]);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const district = districts.find((item) => item.id === selectedDistrictId);
    if (!district) return [];
    return talukas.map((taluka) => ({
      key: `${district.id}:${taluka.id}`,
      label: taluka.name,
      detail: `${district.name} District`,
      value: {
        stateId: selectedStateId ?? "",
        districtId: district.id,
        talukaId: taluka.id,
      } satisfies GeoSelection,
      districtName: district.name,
      talukaName: taluka.name,
    })).filter((item) => !needle || item.label.toLowerCase().includes(needle));
  }, [districts, talukas, query, selectedDistrictId, selectedStateId]);
  const activeDistrict = districts.find((district) => district.id === selectedDistrictId);
  const activeState = states.find((state) => state.id === selectedStateId);
  const filteredStates = useMemo(() => {
    const needle = stateQuery.trim().toLowerCase();
    return states.filter((state) => !needle || state.name.toLowerCase().includes(needle));
  }, [stateQuery, states]);
  const filteredDistricts = useMemo(() => {
    const needle = districtQuery.trim().toLowerCase();
    return districts.filter((district) => !needle || district.name.toLowerCase().includes(needle));
  }, [districtQuery, districts]);

  const loadingOptions = loadingDistricts || loadingTalukas;

  const handleUseCurrentLocation = async () => {
    if (!onUseCurrentLocation || usingCurrentLocation) return;
    setUsingCurrentLocation(true);
    setCurrentLocationError("");
    try {
      await onUseCurrentLocation();
      setVisible(false);
      setQuery("");
    } catch {
      setCurrentLocationError("We couldn't use your current location. Try again or choose a Taluka below.");
    } finally {
      setUsingCurrentLocation(false);
    }
  };

  const fullDisplay = displayLabel || (selectedTalukaName
    ? showStateStep
      ? `${selectedTalukaName}, ${selectedDistrictName}, ${selectedStateName}`
      : `${selectedTalukaName}, ${selectedDistrictName}`
    : compact ? "Choose location" : "Choose your District & Taluka");
  const display = variant === "navbar"
    ? fullDisplay.split(",")[0]?.trim() || "Set location"
    : fullDisplay;

  const compactClearWidth = Platform.OS === "web" ? 42 : 48;
  const compactFieldWidth = value && onClear ? 164 + 6 + compactClearWidth : 164;

  return (
    <View
      style={[
        styles.field,
        compact && variant !== "navbar" ? { width: compactFieldWidth, flexShrink: 0 } : null,
        variant === "navbar" && styles.navbarField,
      ]}
    >
      {!hideLabel ? <Text style={[styles.label, { color: colors.foreground }]} nativeID="taluka-selector-label">Where do you need the service?</Text> : null}
      <View style={styles.controlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: visible }}
          accessibilityLabel={selectedTalukaName ? `Change service location, currently ${display}` : "Choose your District and Taluka"}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [
            styles.control,
            compact && styles.controlCompact,
            compact && Platform.OS !== "web" && styles.nativeCompactControl,
            variant === "navbar" && styles.navbarControl,
            variant === "navbar" ? null : { backgroundColor: colors.background, borderColor: colors.border },
            pressed && styles.pressed,
          ]}
        >
          {variant === "navbar" ? (
            <>
              <View style={[styles.navbarIcon, { backgroundColor: colors.actionTint }]}>
                {loading ? <ActivityIndicator size="small" color={colors.primaryStrong} /> : <MapPin size={15} color={colors.primaryStrong} strokeWidth={2.1} />}
              </View>
              <View style={styles.navbarCopy}>
                <Text style={[styles.navbarLabel, { color: colors.mutedForeground }]}>Location</Text>
                <Text numberOfLines={1} style={[styles.navbarValue, { color: colors.primaryStrong }]}>{display}</Text>
              </View>
            </>
          ) : (
            <>
              <MapPin size={18} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.value, { color: colors.foreground }, !selectedTalukaName && { color: colors.mutedForeground }]}>{display}</Text>
              {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
            </>
          )}
        </Pressable>
        {variant !== "navbar" && value && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove service location ${display}`}
            onPress={onClear}
            style={({ pressed }) => [styles.clearControl, compact && Platform.OS !== "web" && styles.nativeCompactClearControl, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}
          >
            <X size={16} color={colors.primaryStrong} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={visible} transparent accessibilityViewIsModal animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.foreground }]}>Choose your location</Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  We&apos;ll show vendors there first, then nearby Talukas automatically.
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setVisible(false)} style={[styles.close, { backgroundColor: colors.muted }]}>
                <X size={20} color={colors.foreground} />
              </Pressable>
            </View>

            {onUseCurrentLocation ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Use current location to find nearby vendors"
                  disabled={usingCurrentLocation}
                  onPress={() => void handleUseCurrentLocation()}
                  style={({ pressed }) => [styles.currentLocation, { backgroundColor: colors.primaryStrong }, pressed && styles.actionPressed]}
                >
                  <View style={styles.currentLocationIcon}>
                    {usingCurrentLocation
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <LocateFixed size={20} color="#FFFFFF" strokeWidth={2.2} />}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.currentLocationTitle}>Use current location</Text>
                    <Text style={styles.currentLocationDetail}>Show vendors nearest to you</Text>
                  </View>
                  <ChevronDown size={18} color="#FFFFFF" style={styles.currentLocationArrow} />
                </Pressable>
                {currentLocationError ? <Text accessibilityRole="alert" style={[styles.currentLocationError, { color: colors.destructive }]}>{currentLocationError}</Text> : null}
              </>
            ) : null}

            <View style={styles.stateRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>State</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: stateDropdownOpen }}
                accessibilityLabel={activeState ? `Change State, currently ${activeState.name}` : "Choose State"}
                onPress={() => {
                  setStateDropdownOpen((open) => !open);
                  setDistrictDropdownOpen(false);
                }}
                style={({ pressed }) => [styles.districtSelect, { borderColor: colors.border, backgroundColor: colors.input }, stateDropdownOpen && { borderColor: colors.primary }, pressed && styles.pressed]}
              >
                <MapPin size={17} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.districtSelectText, { color: activeState ? colors.foreground : colors.mutedForeground }]}>
                  {activeState?.name ?? "Choose State"}
                </Text>
                <ChevronDown size={18} color={colors.mutedForeground} style={stateDropdownOpen ? styles.chevronOpen : undefined} />
              </Pressable>

              {stateDropdownOpen ? (
                <View style={[styles.districtDropdown, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <View style={[styles.dropdownSearch, { backgroundColor: colors.background, borderColor: focusedSearch === "state" ? colors.ring : colors.border }]}>
                    <Search size={18} color={focusedSearch === "state" ? colors.primaryStrong : colors.mutedForeground} strokeWidth={2} />
                    <TextInput
                      autoFocus={Platform.OS === "web"}
                      value={stateQuery}
                      onChangeText={setStateQuery}
                      onFocus={() => setFocusedSearch("state")}
                      onBlur={() => setFocusedSearch(null)}
                      placeholder="Search State"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.dropdownSearchInput, { color: colors.foreground }]}
                      accessibilityLabel="Search State"
                    />
                  </View>
                  <ScrollView style={styles.districtOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {filteredStates.map((state) => {
                      const selected = state.id === selectedStateId;
                      return (
                        <Pressable
                          key={state.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Select ${state.name} State`}
                          onPress={() => {
                            setSelectedStateId(state.id);
                            setSelectedDistrictId(null);
                            setStateDropdownOpen(false);
                            setStateQuery("");
                            setDistrictQuery("");
                            setQuery("");
                          }}
                          style={[styles.districtOption, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.secondary }]}
                        >
                          <Text style={[styles.districtOptionText, { color: colors.foreground }]}>{state.name}</Text>
                          {selected ? <Check size={17} color={colors.primary} /> : null}
                        </Pressable>
                      );
                    })}
                    {!filteredStates.length ? (
                      <Text style={[styles.districtEmpty, { color: colors.mutedForeground }]}>No State found.</Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={styles.districtRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>District</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: districtDropdownOpen }}
                accessibilityLabel={activeDistrict ? `Change District, currently ${activeDistrict.name}` : "Choose District"}
                onPress={() => {
                  setDistrictDropdownOpen((open) => !open);
                  setStateDropdownOpen(false);
                }}
                style={({ pressed }) => [styles.districtSelect, { borderColor: colors.border, backgroundColor: colors.input }, districtDropdownOpen && { borderColor: colors.primary }, pressed && styles.pressed]}
              >
                <MapPin size={17} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.districtSelectText, { color: activeDistrict ? colors.foreground : colors.mutedForeground }]}>
                  {activeDistrict?.name ?? "Choose District"}
                </Text>
                {loadingDistricts
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <ChevronDown size={18} color={colors.mutedForeground} style={districtDropdownOpen ? styles.chevronOpen : undefined} />}
              </Pressable>

              {districtDropdownOpen ? (
                <View style={[styles.districtDropdown, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <View style={[styles.dropdownSearch, { backgroundColor: colors.background, borderColor: focusedSearch === "district" ? colors.ring : colors.border }]}>
                    <Search size={18} color={focusedSearch === "district" ? colors.primaryStrong : colors.mutedForeground} strokeWidth={2} />
                    <TextInput
                      autoFocus={Platform.OS === "web"}
                      value={districtQuery}
                      onChangeText={setDistrictQuery}
                      onFocus={() => setFocusedSearch("district")}
                      onBlur={() => setFocusedSearch(null)}
                      placeholder="Search District"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.dropdownSearchInput, { color: colors.foreground }]}
                      accessibilityLabel="Search District"
                    />
                  </View>
                  <ScrollView style={styles.districtOptions} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {filteredDistricts.map((district) => {
                      const selected = district.id === selectedDistrictId;
                      return (
                        <Pressable
                          key={district.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Select ${district.name} District`}
                          onPress={() => {
                            setSelectedDistrictId(district.id);
                            setDistrictDropdownOpen(false);
                            setDistrictQuery("");
                            setQuery("");
                          }}
                          style={[styles.districtOption, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.secondary }]}
                        >
                          <Text style={[styles.districtOptionText, { color: colors.foreground }]}>{district.name}</Text>
                          {selected ? <Check size={17} color={colors.primary} /> : null}
                        </Pressable>
                      );
                    })}
                    {!loadingDistricts && !filteredDistricts.length ? (
                      <Text style={[styles.districtEmpty, { color: colors.mutedForeground }]}>No District found.</Text>
                    ) : null}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {selectedDistrictId ? (
              <>
                <View style={styles.talukaSectionHeader}>
                  <Text style={[styles.talukaSectionTitle, { color: colors.foreground }]}>Choose a Taluka</Text>
                  {!loadingOptions ? <Text style={[styles.talukaCount, { color: colors.mutedForeground }]}>{options.length} available</Text> : null}
                </View>
              <View style={[styles.search, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Search size={17} color={colors.mutedForeground} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search Taluka"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.searchInput, { color: colors.foreground }]}
                  accessibilityLabel="Search Taluka"
                />
              </View>
              </>
            ) : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {loadingOptions ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} /> : null}
              {optionsError ? <Text accessibilityRole="alert" style={[styles.empty, { color: colors.destructive }]}>{optionsError}</Text> : null}
              {options.map((item) => {
                const selected = value?.talukaId === item.value.talukaId && value?.districtId === item.value.districtId;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.label}, ${item.detail}`}
                    onPress={() => {
                      onChange(item.value, item.districtName, item.talukaName);
                      setVisible(false);
                      setQuery("");
                    }}
                    style={({ pressed }) => [styles.option, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.secondary }, pressed && styles.optionPressed]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: selected ? colors.background : colors.actionTint }]}>
                      <MapPin size={16} color={colors.primaryStrong} strokeWidth={2.1} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.optionTitle, { color: colors.foreground }]}>{item.label}</Text>
                      <Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>{item.detail}</Text>
                    </View>
                    {selected ? <Check size={18} color={colors.primary} /> : null}
                  </Pressable>
                );
              })}
              {!loadingOptions && !optionsError && !options.length ? (
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                  {selectedDistrictId ? "No supported Taluka found in this District." : "Choose a District to see its Talukas."}
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 4 },
  navbarField: { width: "100%", flex: 1, minWidth: 0, marginBottom: 0 },
  controlRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  label: { fontSize: typeScale.body, fontWeight: "600", marginBottom: 8 },
  control: { flex: 1, height: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  controlCompact: { width: 164, height: 42, borderRadius: 999, paddingHorizontal: 11, gap: 6 },
  nativeCompactControl: { height: 48 },
  nativeCompactClearControl: { width: 48, height: 48 },
  navbarControl: { width: "100%", height: 44, borderWidth: 0, borderRadius: 12, paddingHorizontal: 0, gap: 6 },
  navbarIcon: { width: 27, height: 27, flexShrink: 0, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  navbarCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  navbarLabel: { fontSize: 9, lineHeight: 11, fontWeight: "500" },
  navbarValue: { marginTop: 1, fontSize: typeScale.caption, lineHeight: 15, fontWeight: "700" },
  clearControl: { width: 42, height: 42, flexShrink: 0, borderWidth: 1, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  value: { flex: 1, minWidth: 0, fontSize: typeScale.body },
  pressed: { opacity: 0.75 },
  actionPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,15,20,.5)" },
  sheet: { width: "100%", maxWidth: 540, maxHeight: "86%", alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  title: { fontSize: typeScale.sectionTitle, fontWeight: "700" },
  subtitle: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 3 },
  close: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  currentLocation: { minHeight: 68, marginBottom: 18, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  currentLocationIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  currentLocationTitle: { color: "#FFFFFF", fontSize: typeScale.body, fontWeight: "700" },
  currentLocationDetail: { color: "rgba(255,255,255,.82)", marginTop: 2, fontSize: typeScale.caption },
  currentLocationArrow: { transform: [{ rotate: "-90deg" }] },
  currentLocationError: { marginTop: -6, marginBottom: 12, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  stateRow: { marginBottom: 14 },
  districtRow: { marginBottom: 14 },
  stepLabel: { fontSize: typeScale.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  districtSelect: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  districtSelectText: { flex: 1, minWidth: 0, fontSize: typeScale.body, fontWeight: "600" },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  districtDropdown: { marginTop: 8, maxHeight: 248, borderWidth: 1, borderRadius: 15, overflow: "hidden" },
  dropdownSearch: { minHeight: 48, margin: 10, marginBottom: 4, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  dropdownSearchInput: { flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 0, fontSize: typeScale.bodyCompact, outlineStyle: "none" } as any,
  districtOptions: { maxHeight: 184 },
  districtOption: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  districtOptionText: { flex: 1, minWidth: 0, fontSize: typeScale.bodyCompact, fontWeight: "600" },
  districtEmpty: { paddingHorizontal: 14, paddingVertical: 20, textAlign: "center", fontSize: typeScale.bodyCompact },
  talukaSectionHeader: { marginTop: 2, marginBottom: 9, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  talukaSectionTitle: { fontSize: typeScale.body, fontWeight: "700" },
  talukaCount: { fontSize: typeScale.caption, fontWeight: "600" },
  search: { height: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, fontSize: typeScale.body },
  list: { marginTop: 12 },
  option: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 11 },
  optionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  optionPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  optionTitle: { fontSize: typeScale.body, fontWeight: "700" },
  optionDetail: { fontSize: typeScale.caption, marginTop: 3 },
  empty: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, textAlign: "center", paddingVertical: 26 },
});
