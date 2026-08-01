import React, { useMemo, useState } from "react";
import {
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
import type { LocationPreference, SupportedCity } from "@/locations/types";

type Props = {
  label: string;
  locations: SupportedCity[];
  value: LocationPreference | null;
  onChange: (value: LocationPreference) => void;
  helper?: string;
  required?: boolean;
};

export function SupportedLocationField({
  label,
  locations,
  value,
  onChange,
  helper,
  required,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const selectedCity = locations.find((item) => item.id === value?.cityId);
  const selectedArea = selectedCity?.areas.find((item) => item.id === value?.areaId);
  const display = selectedCity
    ? selectedArea ? `${selectedArea.name}, ${selectedCity.name}` : `${selectedCity.name}, ${selectedCity.state}`
    : "Choose a supported city or area";
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.flatMap((city) => [
      { key: `city:${city.id}`, label: `${city.name}, ${city.state}`, detail: "Browse city-wide", value: { cityId: city.id, areaId: null } },
      ...city.areas.map((area) => ({ key: `area:${area.id}`, label: `${area.name}, ${city.name}`, detail: city.state, value: { cityId: city.id, areaId: area.id } })),
    ]).filter((item) => !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle));
  }, [locations, query]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <Pressable onPress={() => setVisible(true)} style={({ pressed }) => [styles.control, pressed && styles.pressed]}>
        <MapPin size={18} color="#E91E63" />
        <Text numberOfLines={1} style={[styles.value, !selectedCity && styles.placeholder]}>{display}</Text>
        <ChevronDown size={18} color="#8A8589" />
      </Pressable>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}

      <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text style={styles.title}>Choose your location</Text>
                <Text style={styles.subtitle}>Only active RoyalLagn service locations are available.</Text>
              </View>
              <Pressable accessibilityLabel="Close location list" onPress={() => setVisible(false)} style={styles.close}><X size={20} color="#241D21" /></Pressable>
            </View>
            <View style={styles.search}>
              <Search size={17} color="#8A8589" />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search city or area" placeholderTextColor="#8A8589" style={styles.searchInput} />
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.map((item) => {
                const selected = value?.cityId === item.value.cityId && value?.areaId === item.value.areaId;
                return <Pressable key={item.key} onPress={() => { onChange(item.value); setVisible(false); setQuery(""); }} style={[styles.option, selected && styles.optionSelected]}>
                  <View style={styles.flex}><Text style={styles.optionTitle}>{item.label}</Text><Text style={styles.optionDetail}>{item.detail}</Text></View>
                  {selected ? <Check size={18} color="#E91E63" /> : null}
                </Pressable>;
              })}
              {!options.length ? <Text style={styles.empty}>No supported location found.</Text> : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  flex: { flex: 1, minWidth: 0 },
  label: { color: "#241D21", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  required: { color: "#E91E63" },
  control: { height: 56, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF" },
  value: { flex: 1, minWidth: 0, color: "#241D21", fontSize: 14 },
  placeholder: { color: "#8A8589" },
  helper: { color: "#786D73", fontSize: 11, lineHeight: 16, marginTop: 6 },
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,15,20,.5)" },
  sheet: { width: "100%", maxWidth: 540, maxHeight: "78%", alignSelf: "center", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28, backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { color: "#241D21", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#786D73", fontSize: 11, lineHeight: 16, marginTop: 3 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F6" },
  search: { height: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFF8FB" },
  searchInput: { flex: 1, minWidth: 0, color: "#241D21", fontSize: 13 },
  list: { marginTop: 12 },
  option: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0D9E4", paddingHorizontal: 6, flexDirection: "row", alignItems: "center" },
  optionSelected: { backgroundColor: "#FFF3F8" },
  optionTitle: { color: "#241D21", fontSize: 13, fontWeight: "700" },
  optionDetail: { color: "#786D73", fontSize: 10, marginTop: 3 },
  empty: { color: "#786D73", fontSize: 12, textAlign: "center", paddingVertical: 26 },
});

