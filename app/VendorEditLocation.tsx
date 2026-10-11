import React, { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { MapPin } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace, VendorReadinessRules } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import {
  VendorServiceLocationEditor,
  type VendorLocationValue,
} from "@/components/locations/VendorServiceLocationEditor";
import {
  listVendorServiceLocations,
  replaceVendorServiceLocations,
  lookupIndianPincode,
  ensureIndianLocalityCoordinates,
} from "@/services/locations";
import { getVendorGeoStatus } from "@/services/geoLocations";
import { Field, kitStyles, ReadinessBadge, SaveBar, VendorWorkspaceGate } from "@/components/vendor/VendorProfileFormKit";
import VendorSectionHeading, { useVendorSectionPageStyle } from "@/components/vendor/VendorSectionHeading";
import { VendorSectionGroup, VendorSectionPanel } from "@/components/vendor/VendorSectionPanel";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

const emptyLocation: VendorLocationValue = {
  pincode: "",
  primaryCityId: "",
  primaryAreaId: null,
  serviceAreaIds: [],
  geoLocalityId: null,
};

// Canonical location: PIN code and selected locality resolve the hierarchy.
// plus the free-text business address on the vendors row. Only these are
// read or written here -- business identity, contact info, brand and every
// other section stay untouched.
export default function VendorEditLocation() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const pageStyle = useVendorSectionPageStyle();
  const { data, loading, error, refresh } = useVendorWorkspace();
  const [address, setAddress] = useState("");
  const [vendorLocation, setVendorLocation] = useState<VendorLocationValue>(emptyLocation);
  const [locationValid, setLocationValid] = useState(false);
  const [locationDirty, setLocationDirty] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const loadedPincode = useRef("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    setAddress(data.vendor.address ?? "");
  }, [data.vendor]);

  useEffect(() => {
    if (!data.vendor?.id) return;
    let active = true;
    setLocationsLoading(true);
    listVendorServiceLocations(data.vendor.id)
      .then((serviceLocations) => {
        if (!active) return;
        const primary = serviceLocations.find((item) => item.isPrimary);
        const pincode = primary?.pincode ?? (/^[1-9][0-9]{5}$/.test(data.vendor.pincode ?? "") ? data.vendor.pincode : "");
        loadedPincode.current = pincode;
        setVendorLocation({
          pincode,
          primaryCityId: primary?.cityId ?? data.vendor.primary_city_id ?? "",
          primaryAreaId: primary?.areaId ?? data.vendor.primary_area_id ?? null,
          serviceAreaIds: serviceLocations.map((item) => item.areaId).filter((item): item is string => Boolean(item)),
          geoLocalityId: data.vendor.geo_pincode_locality_id ?? null,
        });
        setLocationDirty(false);
      })
      .catch(() => {
        if (!active) return;
        const pincode = /^[1-9][0-9]{5}$/.test(data.vendor.pincode ?? "") ? data.vendor.pincode : "";
        loadedPincode.current = pincode;
        setVendorLocation({
          pincode,
          primaryCityId: data.vendor.primary_city_id ?? "",
          primaryAreaId: data.vendor.primary_area_id ?? null,
          serviceAreaIds: data.vendor.primary_area_id ? [data.vendor.primary_area_id] : [],
          geoLocalityId: data.vendor.geo_pincode_locality_id ?? null,
        });
        setLocationDirty(false);
      })
      .finally(() => { if (active) setLocationsLoading(false); });
    return () => { active = false; };
  }, [data.vendor?.geo_pincode_locality_id, data.vendor?.id, data.vendor?.pincode, data.vendor?.primary_area_id, data.vendor?.primary_city_id]);

  const hasUnsavedChanges = Boolean(data.vendor) && (
    locationDirty || address !== (data.vendor?.address ?? "")
  );
  useUnsavedChangesGuard(hasUnsavedChanges);

  const clearFeedback = () => { setSaved(false); setSaveError(""); };

  const save = async () => {
    if (saving || !data.vendor?.id) return;
    if (locationDirty && !locationValid) {
      const message = "Verify your PIN code and select your area / village before saving.";
      setSaveError(message);
      Alert.alert("Location required", message);
      return;
    }
    setSaving(true);
    setSaveError("");
    let locationWarning = "";
    let coordinateWarning = "";
    try {
      let locationSaved = false;
      const canResolveCurrentLocation = locationValid
        && /^[1-9][0-9]{5}$/.test(vendorLocation.pincode)
        && Boolean(vendorLocation.geoLocalityId);
      if ((locationDirty && locationValid) || canResolveCurrentLocation) {
        // If the PIN changed since it was last loaded/verified, warm the
        // geo_pincodes cache with a fresh lookup first so the atomic save
        // below has the best chance of resolving a canonical Taluka rather
        // than falling back to "needs review". This is best-effort only --
        // if the lookup fails (offline, provider down), the save below
        // still runs and will correctly mark the location unresolved
        // instead of leaving a stale Taluka from the previous PIN attached.
        if (
          /^[1-9][0-9]{5}$/.test(vendorLocation.pincode)
          && vendorLocation.pincode !== loadedPincode.current
        ) {
          try {
            await lookupIndianPincode(vendorLocation.pincode);
          } catch {
            // Ignored -- see comment above.
          }
        }
        if (canResolveCurrentLocation && vendorLocation.geoLocalityId) {
          try {
            await ensureIndianLocalityCoordinates({
              pincode: vendorLocation.pincode,
              localityId: vendorLocation.geoLocalityId,
            });
          } catch (coordinateError) {
            // Saving the postal address remains possible while an external
            // geocoder is unavailable, but do not hide the actual failure.
            coordinateWarning = coordinateError instanceof Error
              ? coordinateError.message
              : "Location coordinates could not be verified automatically.";
          }
        }
        try {
          // Atomic: PIN, locality, and the canonical hierarchy are resolved
          // (or safely cleared) in one database transaction. There is no
          // separate follow-up call that could fail independently and
          // leave a stale Taluka attached to a since-changed PIN.
          await replaceVendorServiceLocations({
            vendorId: data.vendor.id,
            primaryCityId: null,
            primaryAreaId: null,
            serviceAreaIds: [],
            pincode: vendorLocation.pincode,
            geoLocalityId: vendorLocation.geoLocalityId,
          });
          locationSaved = true;
          loadedPincode.current = vendorLocation.pincode;
        } catch (locationError) {
          throw new Error(locationError instanceof Error ? locationError.message : "Unable to update service location.");
        }
        if (locationSaved) {
          // Fresh, non-cached read (not the pre-save hook state) of what
          // the atomic save above actually resolved, so the vendor sees an
          // accurate outcome instead of a silently-assumed success.
          const geoStatus = await getVendorGeoStatus(data.vendor.id).catch(() => null);
          if (geoStatus && geoStatus.status !== "resolved") {
            locationWarning = coordinateWarning || (geoStatus.reviewReason
              ? `Address and PIN saved. Your area's Taluka needs review: ${geoStatus.reviewReason}`
              : "Address and PIN saved. Your area's Taluka needs review before it appears in District/Taluka search.");
          }
        }
      }
      await updateVendorPublicProfile({
        address: address.trim() || null,
      });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setLocationDirty(false);
      setSaveError(locationWarning);
      setSaved(true);
      setTimeout(() => { if (mounted.current) setSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update your service location.";
      setSaveError(message);
      Alert.alert("Not saved", message);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <View style={[kitStyles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
      <KeyboardAwareScrollView
        avoidKeyboardOnAndroid
        contentContainerStyle={pageStyle}
      >
        <VendorSectionHeading
          title="Location"
          subtitle="Enter your PIN code and choose the locality matching your business address. District and Taluka are assigned automatically."
          badge={data.vendor ? <ReadinessBadge colors={colors} state={VendorReadinessRules.location(data.vendor)} /> : null}
        />

        <VendorWorkspaceGate colors={colors} loading={loading} vendor={data.vendor} error={error} onRetry={() => void refresh()}>
          <VendorSectionPanel backgroundColor="#EAF7FF" borderColor="rgba(238, 78, 131, 0.18)">
            <VendorSectionGroup icon={MapPin} iconColor="#EE4E83" title="Business location" detail="Your verified locality becomes the source for District and Taluka discovery.">
              <VendorServiceLocationEditor
                value={vendorLocation}
                onChange={(next) => { clearFeedback(); setLocationDirty(true); setVendorLocation(next); }}
                requireLookup={false}
                onValidationChange={setLocationValid}
              />
              <Field
                label="Business address"
                value={address}
                onChangeText={(value) => { clearFeedback(); setAddress(value); }}
                placeholder="Street, area or landmark (optional)"
                colors={colors}
                editable={!locationsLoading}
              />
            </VendorSectionGroup>
            <SaveBar
              embedded
              colors={colors}
              saving={saving}
              disabled={locationsLoading || (locationDirty && !locationValid)}
              saved={saved}
              saveError={saveError}
              savedLabel="Location updated"
              onPress={() => void save()}
            />
          </VendorSectionPanel>
        </VendorWorkspaceGate>
      </KeyboardAwareScrollView>
    </View>
  );
}
