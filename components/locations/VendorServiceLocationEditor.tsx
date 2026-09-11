import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareTextInput } from "@/components/keyboard/KeyboardAwareScrollView";
import { Check, CircleAlert, MapPin, Search, ShieldCheck } from "lucide-react-native";
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
  /** New-application flow only (never set by the existing-vendor "edit my
   * location" screen): as soon as the PIN/locality resolves to a canonical
   * Taluka, immediately surface whether that Taluka is currently accepting
   * NEW vendor applications -- before the vendor fills out the rest of the
   * form, not just at final submission. The deployed submit-vendor-application
   * Edge Function repeats this exact check server-side; this is a UX
   * head-start, never the authority. */
  enforceApplicationAvailability?: boolean;
};

/** Vendor-facing description of a selected locality. Source trust is internal
 * plumbing, so every selectable locality is presented in the same way. */
const describeSelectedLocality = (
  locality: PincodeLocality,
  inheritedTaluka: PincodeLocality["taluka"] = null,
): string => {
  const hierarchy = [
    locality.taluka?.name ?? inheritedTaluka?.name,
    locality.district?.name,
    locality.state?.name,
  ].filter(Boolean).join(", ");
  return hierarchy ? `${locality.name}, ${hierarchy} selected` : `${locality.name} selected`;
};

export function VendorServiceLocationEditor({
  value,
  onChange,
  requireLookup = true,
  onValidationChange,
  enforceApplicationAvailability = false,
}: Props) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupVerified, setLookupVerified] = useState(false);
  const [lookupCompleted, setLookupCompleted] = useState(!requireLookup);
  const [lookupMessage, setLookupMessage] = useState("");
  const [localityOptions, setLocalityOptions] = useState<PincodeLocality[]>([]);
  // Distinct from lookupMessage: this is specifically the "can a new vendor
  // apply from here" outcome, kept separate so it always renders as a hard
  // block (not just an informational verification note) and is never
  // silently overwritten by an unrelated locality-selection message.
  const [applicationBlockedMessage, setApplicationBlockedMessage] = useState("");
  // Tracks the last PIN a lookup was actually started for (set the instant
  // lookup() begins, not when it finishes) -- lets the auto-lookup effect
  // below and the pre-filled-value hydration effect share one "don't
  // trigger twice for the same PIN" guard without needing to coordinate
  // with each other directly.
  const [pinTaluka, setPinTaluka] = useState<PincodeLocality["taluka"]>(null);
  const lastTriggeredPincodeRef = useRef<string | null>(null);
  const selectedLocality = localityOptions.find((item) => item.id === value.geoLocalityId) ?? null;
  const selectedLocalityBelongsToPin = Boolean(selectedLocality);
  const valid = /^[1-9][0-9]{5}$/.test(value.pincode)
    && lookupCompleted
    && localityOptions.length > 0
    && selectedLocalityBelongsToPin
    && !applicationBlockedMessage;

  useEffect(() => {
    onValidationChange?.(valid, valid ? lookupVerified ? "verified" : "manual_fallback" : null);
  }, [lookupVerified, onValidationChange, valid]);

  const updatePincode = (pincode: string) => {
    setLookupVerified(false);
    setLookupCompleted(!requireLookup);
    setLookupMessage("");
    setApplicationBlockedMessage("");
    setPinTaluka(null);
    setLocalityOptions([]);
    onChange({
      ...value,
      pincode: pincode.replace(/\D/g, "").slice(0, 6),
      primaryCityId: "",
      primaryAreaId: null,
      serviceAreaIds: [],
      geoLocalityId: null,
    });
  };

  // Mirrors the exact authorization gate submit-vendor-application enforces
  // server-side (see the Edge Function's "Canonical Taluka authorization
  // gate" comment): once a locality is on screen, its Taluka (including a
  // unique PIN-level Taluka inherited onto village B.O.s) is authoritative.
  // Source trust never blocks. The only hard blocks are a Taluka that is
  // toggled OFF, or a true blank PIN with zero Taluka matches anywhere.
  const blockedMessageFor = (
    locality: PincodeLocality | null,
    appStatus: string | null,
    appMessage?: string | null,
    pinTaluka?: PincodeLocality["taluka"],
  ): string => {
    const taluka = locality?.taluka ?? pinTaluka ?? null;
    if (locality) {
      return taluka?.acceptingApplications === false
        ? `RoyalLagn is not currently accepting new vendor applications from ${taluka.name}.`
        : "";
    }
    return appStatus === "resolved_disabled" || appStatus === "unresolved"
      ? (appMessage ?? "This location is not currently available for new vendor applications.")
      : "";
  };

  const lookup = useCallback(async () => {
    if (!/^[1-9][0-9]{5}$/.test(value.pincode) || lookingUp) {
      setLookupMessage("Enter a valid six-digit Indian PIN code.");
      return;
    }
    lastTriggeredPincodeRef.current = value.pincode;
    setLookingUp(true);
    setLookupMessage("");
    setApplicationBlockedMessage("");
    setLookupVerified(false);
    setLookupCompleted(false);
    try {
      const result = await lookupIndianPincode(value.pincode);
      const localities = result.geo?.localities ?? [];
      const resolvedPinTaluka = result.geo?.ambiguous ? null : (result.geo?.taluka ?? null);
      setPinTaluka(resolvedPinTaluka);
      setLocalityOptions(localities);
      setLookupCompleted(true);
      const appStatus = result.geo?.applicationStatus ?? null;
      if (!localities.length) {
        onChange({
          ...value,
          primaryCityId: result.city?.id ?? "",
          geoLocalityId: null,
        });
        if (enforceApplicationAvailability) {
          // A genuine postal miss is not an Admin-review case. Neither the
          // government directory nor the India Post fallback knows this PIN,
          // so asking an applicant to wait for a review is misleading. Keep
          // the form safely blocked, but tell them how to recover: check the
          // six digits and try again.
          const noPostalMatch = result.geo?.sourceTrust === "none"
            && !result.geo?.state
            && !result.geo?.district;
          setApplicationBlockedMessage(noPostalMatch
            ? "We couldn’t find this PIN code. Check the six digits and try again."
            : blockedMessageFor(null, appStatus, result.geo?.applicationMessage, resolvedPinTaluka));
        }
        setLookupMessage(result.message ?? "No locations found for this PIN.");
        return;
      }
      const selectedLocality = localities.length === 1
        ? localities[0]
        : localities.find((item) => item.id === value.geoLocalityId) ?? null;
      onChange({
        ...value,
        primaryCityId: result.city?.id ?? "",
        geoLocalityId: selectedLocality?.id ?? null,
      });
      if (enforceApplicationAvailability) {
        setApplicationBlockedMessage(blockedMessageFor(selectedLocality, appStatus, result.geo?.applicationMessage, resolvedPinTaluka));
      }
      if (localities.length > 1 && !selectedLocality) {
        setLookupMessage("Multiple localities match this PIN code. Select your area / village below to enable Submit Application.");
      } else if (selectedLocality) {
        // Colored/marked the same way regardless of official vs unofficial
        // source -- see describeSelectedLocality above.
        setLookupVerified(true);
        setLookupMessage(describeSelectedLocality(selectedLocality, resolvedPinTaluka));
      } else {
        setLookupMessage(result.message ?? "Select your area / village below.");
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
  }, [enforceApplicationAvailability, lookingUp, onChange, value]);

  const hydratedSelection = useRef(false);
  useEffect(() => {
    if (!hydratedSelection.current && value.geoLocalityId && /^[1-9][0-9]{5}$/.test(value.pincode)) {
      hydratedSelection.current = true;
      void lookup();
    }
  }, [lookup, value.geoLocalityId, value.pincode]);

  // Auto-verify once a full 6-digit PIN is typed -- the Verify button stays
  // as a manual retry, but nobody should have to press it for the normal
  // case. Debounced so it fires once typing pauses, not on every keystroke;
  // `lookupRef` holds the latest `lookup` closure so this effect's own
  // dependency is just the PIN string itself -- otherwise `lookup`'s
  // identity changing on every unrelated field update (city/area/etc, all
  // set via the same onChange) would re-arm the debounce timer for no
  // reason. `lastTriggeredPincodeRef` (set inside lookup() itself) stops
  // this from firing a redundant second lookup right after the
  // pre-filled-value hydration effect above already started one.
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(value.pincode)) return;
    if (lastTriggeredPincodeRef.current === value.pincode) return;
    const timer = setTimeout(() => void lookupRef.current(), 600);
    return () => clearTimeout(timer);
  }, [value.pincode]);

  const selectLocality = (locality: PincodeLocality) => {
    onChange({ ...value, geoLocalityId: locality.id });
    if (enforceApplicationAvailability) {
      setApplicationBlockedMessage(blockedMessageFor(locality, null, null, pinTaluka));
    }
    // Colored/marked the same way regardless of official vs unofficial
    // source -- see describeSelectedLocality above.
    setLookupVerified(true);
    setLookupMessage(describeSelectedLocality(locality, pinTaluka));
  };

  return (
    <View>
      <Text style={styles.label}>Business PIN code <Text style={styles.required}>*</Text></Text>
      <View style={styles.pincodeRow}>
        <View style={styles.pincodeControl}>
          <MapPin size={18} color="#E91E63" />
          <KeyboardAwareTextInput
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
      {applicationBlockedMessage ? (
        <View style={styles.message} accessibilityRole="alert">
          <CircleAlert size={15} color="#B42318" />
          <Text style={styles.messageText}>{applicationBlockedMessage}</Text>
        </View>
      ) : lookupMessage ? (
        // Verified (green) and blocked (red, handled above) are the only
        // two states that need an alert color -- "selected, unofficial
        // source, but the Taluka is known and accepting" is neither: it's
        // informational, not a problem, so it gets a neutral amber note
        // instead of red text that reads as an error.
        <View style={[styles.message, lookupVerified ? styles.verifiedMessage : styles.pendingMessage]}>
          {lookupVerified ? <ShieldCheck size={15} color="#16845B" /> : null}
          <Text style={[styles.messageText, lookupVerified ? styles.verifiedText : styles.pendingText]}>{lookupMessage}</Text>
        </View>
      ) : null}
      {localityOptions.length > 1 ? (
        <View style={styles.localitySection}>
          <Text style={styles.label}>Your area / village <Text style={styles.required}>*</Text></Text>
          <Text style={styles.helper}>Select the post office or locality matching your business address.</Text>
          <ScrollView style={styles.localityList} nestedScrollEnabled keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup">
            {localityOptions.map((locality) => {
              const selected = locality.id === value.geoLocalityId;
              const hierarchy = [locality.taluka?.name ?? pinTaluka?.name, locality.district?.name, locality.state?.name].filter(Boolean).join(", ");
              return <Pressable key={locality.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => selectLocality(locality)} style={[styles.localityOption, selected && styles.localityOptionSelected]}>
                <View style={styles.localityText}><Text style={[styles.localityName, selected && styles.areaTextSelected]}>{locality.name}</Text><Text style={styles.localityMeta}>{hierarchy || "Hierarchy pending review"}</Text></View>
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
  // A selected locality that's simply from an unofficial source (but whose
  // Taluka IS known and accepting applications) is not an error -- red text
  // here reads as "something's wrong" when nothing is blocking submission.
  pendingMessage: { backgroundColor: "#FFF8E8" },
  pendingText: { color: "#8A6100" },
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
