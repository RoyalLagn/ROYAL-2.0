import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, MapPin, Search, ShieldCheck } from "lucide-react-native";
import { useCustomerLocation } from "@/context/LocationContext";
import { SupportedLocationField } from "@/components/locations/SupportedLocationField";
import type { LocationPreference } from "@/locations/types";
import {
  lookupIndianPincode,
  PincodeLookupUnavailableError,
} from "@/services/locations";
import { typeScale, typeLeading } from "@/constants/typography";

export type VendorLocationValue = {
  pincode: string;
  primaryCityId: string;
  primaryAreaId: string | null;
  serviceAreaIds: string[];
};

type Props = {
  value: VendorLocationValue;
  onChange: (value: VendorLocationValue) => void;
  requireLookup?: boolean;
  onValidationChange?: (valid: boolean, source: "verified" | "manual_fallback" | null) => void;
};

export function VendorServiceLocationEditor({
  value,
  onChange,
  requireLookup = true,
  onValidationChange,
}: Props) {
  const { locations, loading, error } = useCustomerLocation();
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupVerified, setLookupVerified] = useState(!requireLookup && Boolean(value.primaryCityId));
  const [manualFallback, setManualFallback] = useState(!requireLookup);
  const [lookupMessage, setLookupMessage] = useState("");
  const selectedCity = locations.find((item) => item.id === value.primaryCityId);
  const locationValue = value.primaryCityId
    ? { cityId: value.primaryCityId, areaId: value.primaryAreaId } satisfies LocationPreference
    : null;
  const valid = /^[1-9][0-9]{5}$/.test(value.pincode)
    && Boolean(value.primaryCityId)
    && (!requireLookup || lookupVerified || manualFallback);

  useEffect(() => {
    onValidationChange?.(valid, valid ? lookupVerified ? "verified" : "manual_fallback" : null);
  }, [lookupVerified, onValidationChange, valid]);

  const updatePincode = (pincode: string) => {
    setLookupVerified(false);
    setManualFallback(!requireLookup);
    setLookupMessage("");
    onChange({ ...value, pincode: pincode.replace(/\D/g, "").slice(0, 6) });
  };

  const lookup = async () => {
    if (!/^[1-9][0-9]{5}$/.test(value.pincode) || lookingUp) {
      setLookupMessage("Enter a valid six-digit Indian PIN code.");
      return;
    }
    setLookingUp(true);
    setLookupMessage("");
    setLookupVerified(false);
    setManualFallback(false);
    try {
      const result = await lookupIndianPincode(value.pincode);
      if (!result.supported || !result.city) {
        setLookupMessage(result.message ?? "RoyalLagn is not yet available in this location.");
        return;
      }
      const areaId = result.area?.id ?? null;
      onChange({
        ...value,
        primaryCityId: result.city.id,
        primaryAreaId: areaId,
        serviceAreaIds: areaId ? [areaId] : [],
      });
      setLookupVerified(true);
      setLookupMessage(`${result.officeName || result.area?.name || result.city.name}, ${result.city.name}, ${result.city.state} · verified`);
    } catch (caught) {
      if (caught instanceof PincodeLookupUnavailableError) {
        setManualFallback(true);
        setLookupMessage("PIN lookup is temporarily unavailable. Choose only from the supported locations below.");
      } else {
        setLookupMessage(caught instanceof Error ? caught.message : "Unable to look up this PIN code.");
      }
    } finally {
      setLookingUp(false);
    }
  };

  const selectLocation = (next: LocationPreference) => {
    const keepAreas = next.cityId === value.primaryCityId ? value.serviceAreaIds : [];
    const serviceAreaIds = next.areaId
      ? [...new Set([...keepAreas, next.areaId])]
      : keepAreas;
    onChange({
      ...value,
      primaryCityId: next.cityId,
      primaryAreaId: next.areaId,
      serviceAreaIds,
    });
  };

  const toggleArea = (areaId: string) => {
    const selected = value.serviceAreaIds.includes(areaId);
    const next = selected
      ? value.serviceAreaIds.filter((id) => id !== areaId)
      : [...value.serviceAreaIds, areaId];
    onChange({
      ...value,
      serviceAreaIds: next,
      primaryAreaId: value.primaryAreaId === areaId && selected ? null : value.primaryAreaId,
    });
  };

  const canChooseManually = manualFallback || lookupVerified || !requireLookup;
  return (
    <View>
      <Text style={styles.label}>Business PIN code <Text style={styles.required}>*</Text></Text>
      <View style={styles.pincodeRow}>
        <View style={styles.pincodeControl}>
          <MapPin size={18} color="#E91E63" />
          <TextInput
            value={value.pincode}
            onChangeText={updatePincode}
            placeholder="6-digit Indian PIN"
            placeholderTextColor="#8A8589"
            keyboardType="number-pad"
            maxLength={6}
            style={styles.pincodeInput}
          />
        </View>
        <Pressable onPress={() => void lookup()} disabled={lookingUp} style={({ pressed }) => [styles.lookupButton, pressed && styles.pressed, lookingUp && styles.disabled]}>
          {lookingUp ? <ActivityIndicator color="#FFFFFF" /> : <><Search size={16} color="#FFFFFF" /><Text style={styles.lookupText}>Verify</Text></>}
        </Pressable>
      </View>
      {lookupMessage ? <View style={[styles.message, lookupVerified && styles.verifiedMessage]}>{lookupVerified ? <ShieldCheck size={15} color="#16845B" /> : null}<Text style={[styles.messageText, lookupVerified && styles.verifiedText]}>{lookupMessage}</Text></View> : null}
      {loading ? <ActivityIndicator color="#E91E63" style={styles.locationLoader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View pointerEvents={canChooseManually ? "auto" : "none"} style={!canChooseManually ? styles.disabled : undefined}>
        <SupportedLocationField
          label="Primary service location"
          required
          locations={locations}
          value={locationValue}
          onChange={selectLocation}
          helper={requireLookup && !canChooseManually ? "Verify the PIN code first." : "Vendors can only select active admin-supported locations."}
        />
      </View>
      {selectedCity?.areas.length ? (
        <View style={styles.areasSection}>
          <Text style={styles.label}>Service areas</Text>
          <Text style={styles.helper}>Select every locality you currently serve in {selectedCity.name}.</Text>
          <View style={styles.areaGrid}>
            {selectedCity.areas.map((area) => {
              const selected = value.serviceAreaIds.includes(area.id);
              return <Pressable key={area.id} disabled={!canChooseManually} onPress={() => toggleArea(area.id)} style={[styles.areaChip, selected && styles.areaChipSelected]}>
                {selected ? <Check size={14} color="#E91E63" /> : null}
                <Text style={[styles.areaText, selected && styles.areaTextSelected]}>{area.name}</Text>
              </Pressable>;
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: "#241D21", fontSize: typeScale.body, fontWeight: "600", marginBottom: 8 },
  required: { color: "#E91E63" },
  pincodeRow: { flexDirection: "row", gap: 9, marginBottom: 8 },
  pincodeControl: { flex: 1, minWidth: 0, height: 56, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 16, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#FFFFFF" },
  pincodeInput: { flex: 1, minWidth: 0, color: "#241D21", fontSize: typeScale.body, letterSpacing: 1.2 },
  lookupButton: { width: 104, height: 56, borderRadius: 16, backgroundColor: "#E91E63", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  lookupText: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  message: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14, backgroundColor: "#FFF2F2", flexDirection: "row", alignItems: "center", gap: 7 },
  messageText: { flex: 1, color: "#B42318", fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  verifiedMessage: { backgroundColor: "#ECFDF5" },
  verifiedText: { color: "#16845B" },
  error: { color: "#B42318", fontSize: typeScale.metadata, marginBottom: 12 },
  locationLoader: { marginVertical: 12 },
  helper: { color: "#786D73", fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: -3, marginBottom: 10 },
  areasSection: { marginTop: 2, marginBottom: 8 },
  areaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  areaChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, borderColor: "#E7E1E4", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFFFFF" },
  areaChipSelected: { borderColor: "#F4A9C4", backgroundColor: "#FFF1F6" },
  areaText: { color: "#655C61", fontSize: typeScale.metadata, fontWeight: "600" },
  areaTextSelected: { color: "#E91E63" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.48 },
});
