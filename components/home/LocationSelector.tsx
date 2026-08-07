import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown, MapPin, X } from "lucide-react-native";
import { useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import type { LocationPreference } from "@/locations/types";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts } from "@/constants/typography";

const PINK = brandPalette.light.primary;

type LocationSelectorProps = {
  dark: boolean;
  compact?: boolean;
  filterChip?: boolean;
};

export default function LocationSelector({ dark, compact = false, filterChip = false }: LocationSelectorProps) {
  const {
    location,
    city,
    locations,
    preference,
    loading,
    saving,
    error,
    needsLocationSelection,
    claimLocationOnboardingPrompt,
    setLocation,
  } = useCustomerLocation();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<LocationPreference | null>(preference);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (visible) {
      setDraft(preference);
      setQuery("");
      setSaveError("");
    }
  }, [preference, visible]);

  useEffect(() => {
    if (
      needsLocationSelection
      && locations.length
      && claimLocationOnboardingPrompt()
    ) setVisible(true);
  }, [claimLocationOnboardingPrompt, locations.length, needsLocationSelection]);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return locations.flatMap((supportedCity) => {
      const cityOption = {
        key: `city:${supportedCity.id}`,
        label: `${supportedCity.name}, ${supportedCity.state}`,
        detail: supportedCity.areas.length ? `${supportedCity.areas.length} supported areas` : "City-wide service",
        preference: { cityId: supportedCity.id, areaId: null } satisfies LocationPreference,
      };
      const areaOptions = supportedCity.areas.map((supportedArea) => ({
        key: `area:${supportedArea.id}`,
        label: `${supportedArea.name}, ${supportedCity.name}`,
        detail: supportedCity.state,
        preference: { cityId: supportedCity.id, areaId: supportedArea.id } satisfies LocationPreference,
      }));
      return [cityOption, ...areaOptions].filter((item) =>
        !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle));
    });
  }, [locations, query]);

  const colors = {
    surface: brandColors(dark).card,
    background: brandColors(dark).background,
    text: dark ? "#F8F2F5" : brandColors(dark).foreground,
    muted: brandColors(dark).mutedForeground,
    border: dark ? "#3B3237" : brandColors(dark).border,
  };

  const close = () => {
    if (!needsLocationSelection) setVisible(false);
  };
  const confirm = async () => {
    if (!draft || saving) return;
    setSaveError("");
    try {
      await setLocation(draft);
      setVisible(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Unable to save this location.");
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change location, currently ${location}`}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        style={({ pressed, hovered }) => [
          styles.trigger,
          { backgroundColor: colors.surface, borderColor: colors.border },
          compact && styles.triggerCompact,
          filterChip && [styles.triggerFilter, { backgroundColor: colors.surface, borderColor: colors.border }],
          hovered && Platform.OS === "web" && { backgroundColor: dark ? "#2A2428" : "#FFF1F6" },
          pressed && styles.pressed,
        ]}
      >
        <MapPin size={compact ? 11 : 14} color={PINK} />
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.triggerText, compact && styles.triggerTextCompact, filterChip && styles.triggerFilterText, { color: colors.text }]}>
          {filterChip ? "Location" : city}
        </Text>
        <ChevronDown size={compact ? 9 : 12} color={colors.muted} />
      </Pressable>

      <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={close}>
        <Pressable style={[styles.backdrop, Platform.OS !== "web" && styles.backdropMobile]} onPress={close}>
          <Pressable
            accessibilityViewIsModal
            style={[
              styles.sheet,
              Platform.OS !== "web" && styles.sheetMobile,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.text }]}>Choose your location</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Nearby recommendations update after confirmation.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close location selector" onPress={close} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </Pressable>
            </View>

            <CompactSearchBar
              accessibilityLabel="Search city or area"
              value={query}
              onChangeText={setQuery}
              placeholder="Search city or area"
              dark={dark}
            />

            <Text style={[styles.groupLabel, { color: colors.muted }]}>SUGGESTED LOCATIONS</Text>
            <ScrollView style={styles.optionScroll} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
              {loading ? <ActivityIndicator color={PINK} style={styles.loader} /> : null}
              {suggestions.map((item) => {
                const selected = draft?.cityId === item.preference.cityId
                  && draft?.areaId === item.preference.areaId;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Select ${item.label}`}
                    onPress={() => setDraft(item.preference)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: selected ? (dark ? "#34222B" : "#FFF0F6") : colors.background,
                        borderColor: selected ? PINK : colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: colors.surface }]}><MapPin size={16} color={PINK} /></View>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionText, { color: colors.text }]}>{item.label}</Text>
                      <Text style={[styles.optionDetail, { color: colors.muted }]}>{item.detail}</Text>
                    </View>
                    {selected ? <Check size={18} color={PINK} /> : null}
                  </Pressable>
                );
              })}
              {!loading && !suggestions.length ? <Text style={[styles.emptyText, { color: colors.muted }]}>{error || "No supported location found."}</Text> : null}
            </ScrollView>

            {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={needsLocationSelection || saving} onPress={close} style={[styles.cancel, { borderColor: colors.border }, needsLocationSelection && styles.disabled]}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={!draft || saving} onPress={() => void confirm()} style={[styles.confirm, (!draft || saving) && styles.disabled]}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.confirmText}>Confirm location</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  trigger: { minWidth: 0, maxWidth: 190, flexShrink: 1, height: 36, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 0, flexDirection: "row", alignItems: "center", gap: 3 },
  triggerCompact: { maxWidth: 150, height: 30, paddingHorizontal: 6, borderRadius: 11 },
  triggerFilter: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  triggerText: { flexShrink: 1, minWidth: 0, fontSize: 11, lineHeight: 14, fontWeight: "700", includeFontPadding: false },
  triggerTextCompact: { fontSize: 10, lineHeight: 12 },
  triggerFilterText: { fontSize: 11 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,14,21,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 480, borderWidth: 1, borderRadius: 24, padding: 20 },
  sheetMobile: { maxWidth: "100%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 1.1, marginTop: 18, marginBottom: 9 },
  options: { gap: 8 },
  optionScroll: { maxHeight: 330 },
  loader: { paddingVertical: 24 },
  option: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  optionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, minWidth: 0 },
  optionText: { fontSize: 12, fontWeight: "700" },
  optionDetail: { fontSize: 9, marginTop: 2 },
  emptyText: { textAlign: "center", paddingVertical: 18, fontSize: 11 },
  saveError: { color: brandPalette.light.destructive, fontFamily: fonts.sans.regular, fontSize: 10, lineHeight: 15, marginTop: 10 },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  cancel: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 11, fontWeight: "800" },
  confirm: { flex: 1.4, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  confirmText: { color: brandPalette.light.primaryForeground, fontFamily: fonts.sans.bold, fontSize: 11 },
  disabled: { opacity: 0.48 },
});
