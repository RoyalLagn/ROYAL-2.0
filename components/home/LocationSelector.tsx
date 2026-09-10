import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown, LocateFixed, MapPin, Navigation, X } from "lucide-react-native";
import { useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import type { LocationPreference } from "@/locations/types";
import { brandColors, brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import {
  getCurrentDeviceLocation,
  requestDeviceLocationPermission,
  requestDeviceLocationServices,
  reverseGeocodeLabel,
  reverseGeocodePincode,
} from "@/services/deviceLocation";

const PINK = brandPalette.light.primary;

type LocationSelectorProps = {
  dark: boolean;
  compact?: boolean;
  filterChip?: boolean;
  homeHeader?: boolean;
};

type LocationSuggestion = {
  key: string;
  label: string;
  detail: string;
  preference: LocationPreference;
};

export default function LocationSelector({ dark, compact = false, filterChip = false, homeHeader = false }: LocationSelectorProps) {
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
  const [saveError, setSaveError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (visible) {
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
    const numericNeedle = needle.replace(/\D/g, "");
    const searchingPincode = numericNeedle.length > 0 && numericNeedle === needle;
    const options = locations.flatMap((supportedCity): LocationSuggestion[] => {
      if (searchingPincode) {
        const cityPins = (supportedCity.pincodes ?? []).map((pincode) => ({
          key: `pin:city:${supportedCity.id}:${pincode}`,
          label: `${supportedCity.name}, ${supportedCity.state}`,
          detail: `PIN ${pincode}`,
          preference: { cityId: supportedCity.id, areaId: null, pincode },
        }));
        const areaPins = supportedCity.areas.flatMap((supportedArea) =>
          (supportedArea.pincodes ?? []).map((pincode) => ({
            key: `pin:area:${supportedArea.id}:${pincode}`,
            label: `${supportedArea.name}, ${supportedCity.name}`,
            detail: `PIN ${pincode} · ${supportedCity.state}`,
            preference: { cityId: supportedCity.id, areaId: supportedArea.id, pincode },
          })),
        );
        return [...cityPins, ...areaPins].filter((item) => item.preference.pincode?.startsWith(numericNeedle));
      }

      const cityOption: LocationSuggestion = {
        key: `city:${supportedCity.id}`,
        label: `${supportedCity.name}, ${supportedCity.state}`,
        detail: supportedCity.areas.length ? `${supportedCity.areas.length} supported areas` : "City-wide service",
        preference: { cityId: supportedCity.id, areaId: null },
      };
      const areaOptions: LocationSuggestion[] = supportedCity.areas.map((supportedArea) => ({
        key: `area:${supportedArea.id}`,
        label: `${supportedArea.name}, ${supportedCity.name}`,
        detail: (supportedArea.pincodes ?? []).length
          ? `${supportedCity.state} · PIN ${(supportedArea.pincodes ?? []).join(", ")}`
          : supportedCity.state,
        preference: {
          cityId: supportedCity.id,
          areaId: supportedArea.id,
          pincode: supportedArea.pincodes?.length === 1 ? supportedArea.pincodes[0] : null,
        },
      }));
      return [cityOption, ...areaOptions].filter((item) =>
        !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle));
    });
    return options.slice(0, 30);
  }, [locations, query]);

  const colors = {
    surface: brandColors(dark).card,
    background: brandColors(dark).background,
    text: dark ? "#F8F2F5" : brandColors(dark).foreground,
    muted: brandColors(dark).mutedForeground,
    border: dark ? "#3B3237" : brandColors(dark).border,
  };

  const close = () => {
    // A required location should be prompted, not used as an uncloseable
    // global modal. Expo Router can retain the public screen while another
    // role route is active; refusing to close here lets this modal intercept
    // Vendor/Admin login and navigation outside the marketplace.
    setVisible(false);
  };
  const chooseLocation = async (next: LocationPreference) => {
    if (saving || locating) return;
    setSaveError("");
    try {
      await setLocation(next);
      setVisible(false);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Unable to save this location.");
    }
  };

  const detectCurrentLocation = async () => {
    if (saving || locating) return;
    setLocating(true);
    setSaveError("");
    try {
      const permission = await requestDeviceLocationPermission();
      if (permission !== "granted") throw new Error("Allow location permission to use your current location.");
      if (!(await requestDeviceLocationServices())) throw new Error("Turn on device location and try again.");

      const coordinates = await getCurrentDeviceLocation();
      const [pincode, label] = await Promise.all([
        reverseGeocodePincode(coordinates),
        reverseGeocodeLabel(coordinates),
      ]);
      const pinMatch = pincode ? locations.flatMap((supportedCity) => [
        ...(supportedCity.pincodes ?? []).map((pin) => ({ city: supportedCity, areaId: null, pin })),
        ...supportedCity.areas.flatMap((area) =>
          (area.pincodes ?? []).map((pin) => ({ city: supportedCity, areaId: area.id, pin }))),
      ]).find((item) => item.pin === pincode) : null;

      if (pinMatch) {
        await chooseLocation({ cityId: pinMatch.city.id, areaId: pinMatch.areaId, pincode });
        return;
      }

      const normalizedLabel = label?.toLowerCase() ?? "";
      const cityMatch = locations.find((supportedCity) =>
        normalizedLabel.includes(supportedCity.name.toLowerCase()));
      const areaMatch = cityMatch?.areas.find((area) =>
        normalizedLabel.includes(area.name.toLowerCase()));
      if (!cityMatch) throw new Error("Your current location is not available on RoyalLagn yet. Search for a supported location or PIN code.");
      await chooseLocation({ cityId: cityMatch.id, areaId: areaMatch?.id ?? null, pincode });
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Unable to detect your current location.");
    } finally {
      setLocating(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change location, currently ${location}`}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        hitSlop={compact ? 7 : 0}
        style={[
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
          homeHeader && styles.homeTrigger,
        ]}
      >
        {homeHeader ? (
          <>
            <View style={[styles.homeLocationIcon, { backgroundColor: dark ? "#2B1B23" : "#FFF0F6" }]}>
              <LocateFixed size={15} color={PINK} />
            </View>
            <View style={styles.homeLocationCopy}>
              <Text style={[styles.homeLocationLabel, { color: colors.muted }]}>Location</Text>
              <Text numberOfLines={1} style={[styles.homeLocationValue, { color: PINK }]}>
                {location === "Choose location" ? "Set location" : location.split(",")[0]?.trim()}
              </Text>
            </View>
          </>
        ) : (
          <>
            <MapPin size={compact ? 11 : 14} color={PINK} />
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.triggerText, compact && styles.triggerTextCompact, filterChip && styles.triggerFilterText, { color: colors.text }]}>
              {filterChip ? "Location" : city}
            </Text>
            <ChevronDown size={compact ? 9 : 12} color={colors.muted} />
          </>
        )}
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
                <Text style={[styles.subtitle, { color: colors.muted }]}>Choose once and return directly to Home.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close location selector" onPress={close} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use current location"
              disabled={saving || locating}
              onPress={() => void detectCurrentLocation()}
              style={({ pressed }) => [
                styles.currentLocation,
                { borderColor: colors.border, backgroundColor: dark ? "#261922" : "#FFF5F8" },
                pressed && styles.pressed,
                (saving || locating) && styles.disabled,
              ]}
            >
              <View style={styles.currentLocationIcon}>
                {locating ? <ActivityIndicator size="small" color={PINK} /> : <Navigation size={18} color={PINK} />}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.currentLocationTitle, { color: colors.text }]}>{locating ? "Finding your location…" : "Use current location"}</Text>
                <Text style={[styles.currentLocationDetail, { color: colors.muted }]}>Uses your device GPS</Text>
              </View>
            </Pressable>

            <CompactSearchBar
              accessibilityLabel="Search location or PIN code"
              value={query}
              onChangeText={setQuery}
              placeholder="Search location or PIN code"
              dark={dark}
            />

            <Text style={[styles.groupLabel, { color: colors.muted }]}>SUGGESTED LOCATIONS</Text>
            <ScrollView style={styles.optionScroll} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
              {loading ? <ActivityIndicator color={PINK} style={styles.loader} /> : null}
              {suggestions.map((item) => {
                const selected = preference?.cityId === item.preference.cityId
                  && preference?.areaId === item.preference.areaId
                  && (!item.preference.pincode || preference?.pincode === item.preference.pincode);
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Select ${item.label}`}
                    disabled={saving || locating}
                    onPress={() => void chooseLocation(item.preference)}
                    style={[
                      styles.option,
                      {
                        backgroundColor: selected ? (dark ? "#34222B" : "#FFF0F6") : colors.background,
                        borderColor: selected ? PINK : colors.border,
                      },
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

            {saving ? <View style={styles.savingRow}><ActivityIndicator size="small" color={PINK} /><Text style={[styles.savingText, { color: colors.muted }]}>Setting location…</Text></View> : null}
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
  homeTrigger: { width: "100%", maxWidth: "100%", height: 44, paddingHorizontal: 0, borderWidth: 0, borderRadius: 0, gap: 6, backgroundColor: "transparent" },
  homeLocationIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  homeLocationCopy: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  homeLocationLabel: { fontSize: 9, lineHeight: 11 },
  homeLocationValue: { maxWidth: "100%", fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "800" },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,14,21,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 480, borderWidth: 1, borderRadius: 24, padding: 20 },
  sheetMobile: { maxWidth: "100%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700", letterSpacing: -0.3 },
  subtitle: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  currentLocation: { minHeight: 58, marginBottom: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 11 },
  currentLocationIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  currentLocationTitle: { fontSize: typeScale.bodyCompact, fontWeight: "800" },
  currentLocationDetail: { fontSize: typeScale.caption, marginTop: 2 },
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
  savingRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10 },
  savingText: { fontSize: typeScale.caption, fontFamily: fonts.sans.regular },
  disabled: { opacity: 0.48 },
});
