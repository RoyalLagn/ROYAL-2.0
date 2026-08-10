import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react-native";
import type { GeoDistrict, GeoSelection, GeoState, GeoTaluka } from "@/locations/types";
import { listActiveGeoDistricts, listActiveGeoTalukas } from "@/services/geoLocations";
import { typeScale, typeLeading } from "@/constants/typography";

type Props = {
  states: GeoState[];
  value: GeoSelection | null;
  onChange: (value: GeoSelection, districtName: string, talukaName: string) => void;
  onResolvedLabel?: (districtName: string, talukaName: string) => void;
  loading?: boolean;
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
export function TalukaLocationSelector({ states, value, onChange, onResolvedLabel, loading }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [talukasByDistrict, setTalukasByDistrict] = useState<Record<string, GeoTaluka[]>>({});
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedStateName, setSelectedStateName] = useState("");
  const [selectedDistrictName, setSelectedDistrictName] = useState("");
  const [selectedTalukaName, setSelectedTalukaName] = useState("");

  const showStateStep = states.length > 1;

  // Keep the active State selection in sync with `states` loading in and
  // with a persisted/validated `value` that may belong to a different
  // State than whichever loaded first.
  useEffect(() => {
    if (!states.length) {
      setSelectedStateId(null);
      return;
    }
    setSelectedStateId((current) => {
      if (value?.stateId && states.some((state) => state.id === value.stateId)) return value.stateId;
      if (current && states.some((state) => state.id === current)) return current;
      return states[0].id;
    });
  }, [states, value?.stateId]);

  useEffect(() => {
    if (!selectedStateId) { setDistricts([]); setTalukasByDistrict({}); return; }
    let active = true;
    setLoadingOptions(true);
    setDistricts([]);
    setTalukasByDistrict({});
    listActiveGeoDistricts(selectedStateId)
      .then(async (items) => {
        if (!active) return;
        setDistricts(items);
        const entries = await Promise.all(
          items.map(async (district) => [district.id, await listActiveGeoTalukas(district.id)] as const),
        );
        if (!active) return;
        setTalukasByDistrict(Object.fromEntries(entries));
      })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [selectedStateId]);

  useEffect(() => {
    if (!value) {
      setSelectedStateName("");
      setSelectedDistrictName("");
      setSelectedTalukaName("");
      return;
    }
    const state = states.find((item) => item.id === value.stateId);
    const district = districts.find((item) => item.id === value.districtId);
    const taluka = talukasByDistrict[value.districtId]?.find((item) => item.id === value.talukaId);
    setSelectedStateName(state?.name ?? "");
    setSelectedDistrictName(district?.name ?? "");
    setSelectedTalukaName(taluka?.name ?? "");
    if (district && taluka) onResolvedLabel?.(district.name, taluka.name);
  }, [value, states, districts, talukasByDistrict, onResolvedLabel]);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return districts.flatMap((district) => {
      const talukas = talukasByDistrict[district.id] ?? [];
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
      }));
    }).filter((item) => !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle));
  }, [districts, talukasByDistrict, query, selectedStateId]);

  const display = selectedTalukaName
    ? showStateStep
      ? `${selectedTalukaName}, ${selectedDistrictName}, ${selectedStateName}`
      : `${selectedTalukaName}, ${selectedDistrictName}`
    : "Choose your District & Taluka";

  return (
    <View style={styles.field}>
      <Text style={styles.label} nativeID="taluka-selector-label">Where do you need the service?</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selectedTalukaName ? `Change service location, currently ${display}` : "Choose your District and Taluka"}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}
      >
        <MapPin size={18} color="#E91E63" />
        <Text numberOfLines={1} style={[styles.value, !selectedTalukaName && styles.placeholder]}>
          {display}
        </Text>
        {loading ? <ActivityIndicator size="small" color="#E91E63" /> : <ChevronDown size={18} color="#8A8589" />}
      </Pressable>

      <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text style={styles.title}>Choose your location</Text>
                <Text style={styles.subtitle}>
                  We&apos;ll show vendors there first, then nearby Talukas automatically.
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setVisible(false)} style={styles.close}>
                <X size={20} color="#241D21" />
              </Pressable>
            </View>

            {showStateStep ? (
              <View style={styles.stateRow}>
                <Text style={styles.stateLabel}>State</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stateChips}>
                  {states.map((state) => {
                    const selected = state.id === selectedStateId;
                    return (
                      <Pressable
                        key={state.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Select ${state.name}`}
                        onPress={() => { setSelectedStateId(state.id); setQuery(""); }}
                        style={[styles.stateChip, selected && styles.stateChipSelected]}
                      >
                        <Text style={[styles.stateChipText, selected && styles.stateChipTextSelected]}>{state.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.search}>
              <Search size={17} color="#8A8589" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Taluka or District"
                placeholderTextColor="#8A8589"
                style={styles.searchInput}
                accessibilityLabel="Search Taluka or District"
              />
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {loadingOptions ? <ActivityIndicator color="#E91E63" style={{ marginVertical: 20 }} /> : null}
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
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.optionTitle}>{item.label}</Text>
                      <Text style={styles.optionDetail}>{item.detail}</Text>
                    </View>
                    {selected ? <Check size={18} color="#E91E63" /> : null}
                  </Pressable>
                );
              })}
              {!loadingOptions && !options.length ? (
                <Text style={styles.empty}>No supported Taluka found yet.</Text>
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
  flex: { flex: 1, minWidth: 0 },
  label: { color: "#241D21", fontSize: typeScale.body, fontWeight: "600", marginBottom: 8 },
  control: { height: 52, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF" },
  value: { flex: 1, minWidth: 0, color: "#241D21", fontSize: typeScale.body },
  placeholder: { color: "#8A8589" },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,15,20,.5)" },
  sheet: { width: "100%", maxWidth: 540, maxHeight: "82%", alignSelf: "center", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  title: { color: "#241D21", fontSize: typeScale.sectionTitle, fontWeight: "700" },
  subtitle: { color: "#786D73", fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F6" },
  stateRow: { marginBottom: 12 },
  stateLabel: { color: "#786D73", fontSize: typeScale.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  stateChips: { gap: 8, paddingRight: 8 },
  stateChip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, borderColor: "#E7E1E4", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  stateChipSelected: { borderColor: "#E91E63", backgroundColor: "#FFF1F6" },
  stateChipText: { color: "#655C61", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  stateChipTextSelected: { color: "#E91E63" },
  search: { height: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFF8FB" },
  searchInput: { flex: 1, minWidth: 0, color: "#241D21", fontSize: typeScale.body },
  list: { marginTop: 12 },
  option: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0D9E4", paddingHorizontal: 6, flexDirection: "row", alignItems: "center" },
  optionSelected: { backgroundColor: "#FFF3F8" },
  optionTitle: { color: "#241D21", fontSize: typeScale.body, fontWeight: "700" },
  optionDetail: { color: "#786D73", fontSize: typeScale.caption, marginTop: 3 },
  empty: { color: "#786D73", fontSize: typeScale.bodyCompact, textAlign: "center", paddingVertical: 26 },
});
