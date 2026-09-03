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
 * for the current Maharashtra-only rollout) it is preselected automatically
 * to keep the flow to two taps; the moment a second State goes active in
 * geo_states, a State-selection row appears here with no code change
 * required anywhere else.
 */
export function TalukaLocationSelector({ states, value, onChange, onClear, onResolvedLabel, onUseCurrentLocation, loading, hideLabel = false, compact = false }: Props) {
  const { colorScheme } = useColorScheme();
  const colors = brandColors(colorScheme === "dark");
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
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

  const display = selectedTalukaName
    ? showStateStep
      ? `${selectedTalukaName}, ${selectedDistrictName}, ${selectedStateName}`
      : `${selectedTalukaName}, ${selectedDistrictName}`
    : compact ? "Choose location" : "Choose your District & Taluka";

  return (
    <View style={styles.field}>
      {!hideLabel ? <Text style={[styles.label, { color: colors.foreground }]} nativeID="taluka-selector-label">Where do you need the service?</Text> : null}
      <View style={styles.controlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: visible }}
          accessibilityLabel={selectedTalukaName ? `Change service location, currently ${display}` : "Choose your District and Taluka"}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [styles.control, compact && styles.controlCompact, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}
        >
          <MapPin size={18} color={colors.primary} />
          <Text numberOfLines={1} style={[styles.value, { color: colors.foreground }, !selectedTalukaName && { color: colors.mutedForeground }]}>
            {display}
          </Text>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
        </Pressable>
        {value && onClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove service location ${display}`}
            onPress={onClear}
            style={({ pressed }) => [styles.clearControl, { backgroundColor: colors.background, borderColor: colors.border }, pressed && styles.pressed]}
          >
            <X size={16} color={colors.primaryStrong} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={visible} transparent accessibilityViewIsModal animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={(event) => event.stopPropagation()}>
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
                  style={({ pressed }) => [styles.currentLocation, { borderColor: colors.border, backgroundColor: colors.secondary }, pressed && styles.pressed]}
                >
                  <View style={[styles.currentLocationIcon, { backgroundColor: colors.background }]}>
                    {usingCurrentLocation
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <LocateFixed size={19} color={colors.primary} />}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.currentLocationTitle, { color: colors.primaryStrong }]}>Use current location</Text>
                    <Text style={[styles.currentLocationDetail, { color: colors.mutedForeground }]}>Show vendors nearest to you</Text>
                  </View>
                </Pressable>
                {currentLocationError ? <Text accessibilityRole="alert" style={[styles.currentLocationError, { color: colors.destructive }]}>{currentLocationError}</Text> : null}
              </>
            ) : null}

            {showStateStep ? (
              <View style={styles.stateRow}>
                <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>State</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateChips}>
                  {states.map((state) => {
                    const selected = state.id === selectedStateId;
                    return (
                      <Pressable
                        key={state.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Select ${state.name}`}
                        onPress={() => { setSelectedStateId(state.id); setSelectedDistrictId(null); setQuery(""); }}
                        style={[styles.stateChip, { borderColor: colors.border, backgroundColor: colors.background }, selected && { borderColor: colors.primary, backgroundColor: colors.secondary }]}
                      >
                        <Text style={[styles.stateChipText, { color: selected ? colors.primaryStrong : colors.mutedForeground }]}>{state.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.districtRow}>
              <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>District</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateChips}>
                {districts.map((district) => {
                  const selected = district.id === selectedDistrictId;
                  return (
                    <Pressable
                      key={district.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Select ${district.name} District`}
                      onPress={() => { setSelectedDistrictId(district.id); setQuery(""); }}
                      style={[styles.stateChip, { borderColor: colors.border, backgroundColor: colors.background }, selected && { borderColor: colors.primary, backgroundColor: colors.secondary }]}
                    >
                      <Text style={[styles.stateChipText, { color: selected ? colors.primaryStrong : colors.mutedForeground }]}>{district.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {selectedDistrictId ? (
              <View style={[styles.search, { backgroundColor: colors.input }]}>
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
                    style={[styles.option, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.secondary }]}
                  >
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
  controlRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  label: { fontSize: typeScale.body, fontWeight: "600", marginBottom: 8 },
  control: { flex: 1, height: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  controlCompact: { width: 164, height: 42, borderRadius: 999, paddingHorizontal: 11, gap: 6 },
  clearControl: { width: 42, height: 42, flexShrink: 0, borderWidth: 1, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  value: { flex: 1, minWidth: 0, fontSize: typeScale.body },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,15,20,.5)" },
  sheet: { width: "100%", maxWidth: 540, maxHeight: "82%", alignSelf: "center", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  title: { fontSize: typeScale.sectionTitle, fontWeight: "700" },
  subtitle: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 3 },
  close: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  currentLocation: { minHeight: 64, marginBottom: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  currentLocationIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  currentLocationTitle: { fontSize: typeScale.body, fontWeight: "700" },
  currentLocationDetail: { marginTop: 2, fontSize: typeScale.caption },
  currentLocationError: { marginTop: -6, marginBottom: 12, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  stateRow: { marginBottom: 12 },
  districtRow: { marginBottom: 12 },
  stepLabel: { fontSize: typeScale.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  stateChips: { gap: 8, paddingRight: 8 },
  stateChip: { minHeight: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  stateChipText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  search: { height: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  searchInput: { flex: 1, minWidth: 0, fontSize: typeScale.body },
  list: { marginTop: 12 },
  option: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6, flexDirection: "row", alignItems: "center" },
  optionTitle: { fontSize: typeScale.body, fontWeight: "700" },
  optionDetail: { fontSize: typeScale.caption, marginTop: 3 },
  empty: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, textAlign: "center", paddingVertical: 26 },
});
