import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, } from "react-native";
import { Check, ChevronDown, MapPin, Star, Trash2, X } from "lucide-react-native";
import { useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import type { LocationPreference } from "@/locations/types";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

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
    defaultPreference,
    loading,
    saving,
    error,
    needsLocationSelection,
    claimLocationOnboardingPrompt,
    setLocation,
    setDefaultLocation,
    removeLocation,
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
  const remove = async () => {
    if (saving) return;
    setSaveError("");
    try {
      await removeLocation();
      setDraft(null);
      setVisible(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Unable to remove this location.");
    }
  };
  const makeDefault = async () => {
    if (!draft || saving) return;
    setSaveError("");
    try {
      await setDefaultLocation(draft);
      setVisible(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Unable to set this default location.");
    }
  };
  const draftIsDefault = Boolean(
    draft
    && defaultPreference?.cityId === draft.cityId
    && defaultPreference?.areaId === draft.areaId,
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change location, currently ${location}`}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        hitSlop={compact ? 7 : 0}
        style={({ pressed, hovered }) => [
          styles.trigger,
          { backgroundColor: colors.surface, borderColor: colors.border },
          compact && [
            styles.triggerCompact,
            {
              backgroundColor: dark ? "#211820" : "#FFF7FA",
              borderColor: dark ? "#4B3440" : "#F5C2D7",
            },
          ],
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

            {preference ? (
              <View style={[styles.preferenceActions, { borderColor: colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove selected location"
                  disabled={saving}
                  onPress={() => void remove()}
                  style={({ pressed }) => [styles.preferenceAction, pressed && styles.pressed, saving && styles.disabled]}
                >
                  <Trash2 size={16} color={brandPalette.light.destructive} />
                  <Text style={styles.removeText}>Remove location</Text>
                </Pressable>
                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={draftIsDefault ? "Selected location is your default" : "Set selected location as default"}
                  accessibilityState={{ disabled: !draft || saving || draftIsDefault }}
                  disabled={!draft || saving || draftIsDefault}
                  onPress={() => void makeDefault()}
                  style={({ pressed }) => [styles.preferenceAction, pressed && styles.pressed, (!draft || saving || draftIsDefault) && styles.disabled]}
                >
                  {draftIsDefault ? <Check size={16} color={PINK} /> : <Star size={16} color={PINK} />}
                  <Text style={[styles.defaultText, { color: PINK }]}>{draftIsDefault ? "Default location" : "Set as default"}</Text>
                </Pressable>
              </View>
            ) : null}

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
  triggerCompact: { maxWidth: 92, height: 30, paddingHorizontal: 7, borderRadius: 10, gap: 4 },
  triggerFilter: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  triggerText: { flexShrink: 1, minWidth: 0, fontSize: typeScale.metadata, lineHeight: typeLeading.caption, fontWeight: "700", includeFontPadding: false },
  triggerTextCompact: { fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  triggerFilterText: { fontSize: typeScale.metadata },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,14,21,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 480, borderWidth: 1, borderRadius: 24, padding: 20 },
  sheetMobile: { maxWidth: "100%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.1, marginTop: 18, marginBottom: 9 },
  options: { gap: 8 },
  optionScroll: { maxHeight: 330 },
  loader: { paddingVertical: 24 },
  option: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  optionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, minWidth: 0 },
  optionText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  optionDetail: { fontSize: typeScale.caption, marginTop: 2 },
  emptyText: { textAlign: "center", paddingVertical: 18, fontSize: typeScale.metadata },
  saveError: { color: brandPalette.light.destructive, fontFamily: fonts.sans.regular, fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 10 },
  preferenceActions: { minHeight: 46, marginTop: 14, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center" },
  preferenceAction: { flex: 1, minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  actionDivider: { width: 1, height: 24 },
  removeText: { color: brandPalette.light.destructive, fontSize: typeScale.caption, fontWeight: "700" },
  defaultText: { fontSize: typeScale.caption, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  cancel: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: typeScale.metadata, fontWeight: "700" },
  confirm: { flex: 1.4, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  confirmText: { color: brandPalette.light.primaryForeground, fontFamily: fonts.sans.bold, fontSize: typeScale.metadata },
  disabled: { opacity: 0.48 },
});
