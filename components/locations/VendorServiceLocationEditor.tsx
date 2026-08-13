import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, MapPin, Search, ShieldCheck } from "lucide-react-native";
import type { PincodeLocality } from "@/locations/types";
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
  geoLocalityId: string | null;
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
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupVerified, setLookupVerified] = useState(false);
  const [lookupCompleted, setLookupCompleted] = useState(!requireLookup);
  const [lookupMessage, setLookupMessage] = useState("");
  const [localityOptions, setLocalityOptions] = useState<PincodeLocality[]>([]);
  const selectedLocalityBelongsToPin = localityOptions.some((item) => item.id === value.geoLocalityId);
  const valid = /^[1-9][0-9]{5}$/.test(value.pincode)
    && lookupCompleted
    && localityOptions.length > 0
    && selectedLocalityBelongsToPin;

  useEffect(() => {
    onValidationChange?.(valid, valid ? lookupVerified ? "verified" : "manual_fallback" : null);
  }, [lookupVerified, onValidationChange, valid]);

  const updatePincode = (pincode: string) => {
    setLookupVerified(false);
    setLookupCompleted(!requireLookup);
    setLookupMessage("");
    setLocalityOptions([]);
    onChange({ ...value, pincode: pincode.replace(/\D/g, "").slice(0, 6), geoLocalityId: null });
  };

  const lookup = useCallback(async () => {
    if (!/^[1-9][0-9]{5}$/.test(value.pincode) || lookingUp) {
      setLookupMessage("Enter a valid six-digit Indian PIN code.");
      return;
    }
    setLookingUp(true);
    setLookupMessage("");
    setLookupVerified(false);
    setLookupCompleted(false);
    try {
      const result = await lookupIndianPincode(value.pincode);
      const localities = result.geo?.localities ?? [];
      setLocalityOptions(localities);
      setLookupCompleted(true);
      if (!localities.length) {
        onChange({ ...value, geoLocalityId: null });
        setLookupMessage(result.message ?? "No locations found for this PIN.");
        return;
      }
      const selectedLocality = localities.length === 1
        ? localities[0]
        : localities.find((item) => item.id === value.geoLocalityId) ?? null;
      onChange({
        ...value,
        geoLocalityId: selectedLocality?.id ?? null,
      });
      if (localities.length > 1 && !selectedLocality) {
        setLookupMessage("Select your area / village to continue.");
      } else if (selectedLocality) {
        const trusted = Boolean(selectedLocality.trusted && selectedLocality.taluka && selectedLocality.district && selectedLocality.state);
        setLookupVerified(trusted);
        setLookupMessage(trusted
          ? `${selectedLocality.name}, ${selectedLocality.taluka!.name}, ${selectedLocality.district!.name}, ${selectedLocality.state!.name} - verified`
          : `${selectedLocality.name} selected - canonical hierarchy pending review`);
      } else {
        setLookupMessage(result.message ?? "This PIN requires location review.");
      }
    } catch (caught) {
      if (caught instanceof PincodeLookupUnavailableError) {
        setLookupMessage("PIN lookup is temporarily unavailable. Try again before continuing.");
      } else {
        setLookupMessage(caught instanceof Error ? caught.message : "Unable to look up this PIN code.");
      }
    } finally {
      setLookingUp(false);
    }
  }, [lookingUp, onChange, value]);

  const hydratedSelection = useRef(false);
  useEffect(() => {
    if (!hydratedSelection.current && value.geoLocalityId && /^[1-9][0-9]{5}$/.test(value.pincode)) {
      hydratedSelection.current = true;
      void lookup();
    }
  }, [lookup, value.geoLocalityId, value.pincode]);

  const selectLocality = (locality: PincodeLocality) => {
    onChange({ ...value, geoLocalityId: locality.id });
    const canonicallyTrusted = Boolean(locality.trusted && locality.taluka && locality.district && locality.state);
    setLookupVerified(canonicallyTrusted);
    setLookupMessage(canonicallyTrusted
      ? `${locality.name}, ${locality.taluka!.name}, ${locality.district!.name}, ${locality.state!.name} - verified`
      : `${locality.name} selected - canonical hierarchy pending review`);
  };

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
      {localityOptions.length > 1 ? (
        <View style={styles.localitySection}>
          <Text style={styles.label}>Your area / village <Text style={styles.required}>*</Text></Text>
          <Text style={styles.helper}>Select the post office or locality matching your business address.</Text>
          <ScrollView style={styles.localityList} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
            {localityOptions.map((locality) => {
              const selected = locality.id === value.geoLocalityId;
              const hierarchy = [locality.taluka?.name, locality.district?.name, locality.state?.name].filter(Boolean).join(", ");
              return <Pressable key={locality.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => selectLocality(locality)} style={[styles.localityOption, selected && styles.localityOptionSelected]}>
                <View style={styles.localityText}><Text style={[styles.localityName, selected && styles.areaTextSelected]}>{locality.name}</Text><Text style={styles.localityMeta}>{hierarchy || "Hierarchy pending review"}{locality.trusted ? "" : " · Unofficial candidate"}</Text></View>
                {selected ? <Check size={17} color="#E91E63" /> : null}
              </Pressable>;
            })}
          </ScrollView>
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
  localitySection: { marginBottom: 16 },
  localityList: { maxHeight: 330, marginTop: 9 },
  localityOption: { minHeight: 54, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF" },
  localityOptionSelected: { borderColor: "#E91E63", backgroundColor: "#FFF3F8" },
  localityText: { flex: 1, minWidth: 0 },
  localityName: { color: "#241D21", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  localityMeta: { color: "#786D73", fontSize: typeScale.caption, marginTop: 3 },
  helper: { color: "#786D73", fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: -3, marginBottom: 10 },
  areaTextSelected: { color: "#E91E63" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.48 },
});
