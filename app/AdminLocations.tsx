import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Check, ChevronDown, CircleAlert, MapPin, Search, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import type { GeoDistrict, GeoState, GeoTaluka, PincodeLocality } from "@/locations/types";
import { lookupIndianPincode } from "@/services/locations";
import {
  type AdminTalukaPincode,
  listAdminGeoDistricts,
  listAdminGeoStates,
  listAdminGeoTalukas,
  listAdminTalukaPincodes,
} from "@/services/geoLocations";
import { adminPalette } from "@/theme";
import { fonts, typeLeading, typeScale } from "@/constants/typography";

type Option = { id: string; name: string };

export default function AdminLocations() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const stacked = width < 860;
  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [talukas, setTalukas] = useState<GeoTaluka[]>([]);
  const [stateId, setStateId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [talukaId, setTalukaId] = useState<string | null>(null);
  const [pins, setPins] = useState<AdminTalukaPincode[]>([]);
  const [pin, setPin] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState("");
  const [localities, setLocalities] = useState<PincodeLocality[]>([]);
  const [lookupSummary, setLookupSummary] = useState<{ state: string; district: string; taluka: string; status: string } | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState("");
  const [pinSearch, setPinSearch] = useState("");

  useEffect(() => {
    listAdminGeoStates().then((items) => {
      setStates(items);
      setStateId(items.find((item) => item.isActive)?.id ?? items[0]?.id ?? null);
    }).catch(() => setBrowseError("Unable to load States.")).finally(() => setBrowseLoading(false));
  }, []);

  useEffect(() => {
    setDistrictId(null); setTalukaId(null); setPins([]);
    if (!stateId) { setDistricts([]); return; }
    setBrowseLoading(true);
    listAdminGeoDistricts(stateId).then((items) => {
      setDistricts(items);
      setDistrictId(items.find((item) => item.isActive)?.id ?? items[0]?.id ?? null);
    }).catch(() => setBrowseError("Unable to load Districts.")).finally(() => setBrowseLoading(false));
  }, [stateId]);

  useEffect(() => {
    setTalukaId(null); setPins([]);
    if (!districtId) { setTalukas([]); return; }
    setBrowseLoading(true);
    listAdminGeoTalukas(districtId).then((items) => {
      setTalukas(items);
      setTalukaId(items.find((item) => item.isActive)?.id ?? items[0]?.id ?? null);
    }).catch(() => setBrowseError("Unable to load Talukas.")).finally(() => setBrowseLoading(false));
  }, [districtId]);

  useEffect(() => {
    setPins([]);
    if (!talukaId) return;
    setBrowseLoading(true);
    listAdminTalukaPincodes(talukaId).then(setPins)
      .catch(() => setBrowseError("Unable to load PIN codes for this Taluka."))
      .finally(() => setBrowseLoading(false));
  }, [talukaId]);

  const resolvePin = useCallback(async (value: string) => {
    if (!/^[1-9][0-9]{5}$/.test(value)) return;
    setPinLoading(true); setPinError(""); setLookupSummary(null); setLocalities([]);
    try {
      const result = await lookupIndianPincode(value);
      const geo = result.geo;
      if (!geo || !geo.localities.length) {
        setPinError(result.message || "No canonical location mapping was found for this PIN code.");
        return;
      }
      setLocalities(geo.localities);
      setLookupSummary({
        state: geo.state?.name ?? result.state ?? "Needs review",
        district: geo.district?.name ?? result.district ?? "Needs review",
        taluka: geo.taluka?.name ?? "Needs review",
        status: geo.status,
      });
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "PIN lookup is temporarily unavailable.");
    } finally { setPinLoading(false); }
  }, []);

  const onPinChange = (value: string) => {
    const next = value.replace(/\D/g, "").slice(0, 6);
    setPin(next); setPinError("");
    if (next.length < 6) { setLookupSummary(null); setLocalities([]); }
    if (next.length === 6) void resolvePin(next);
  };

  const filteredPins = useMemo(() => {
    const query = pinSearch.trim().toLowerCase();
    if (!query) return pins;
    return pins.filter((item) => item.pincode.includes(query) || item.localities.some((name) => name.toLowerCase().includes(query)));
  }, [pinSearch, pins]);

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ResponsiveContainer>
          <AdminPageHeader title="PIN & Taluka Mapping" subtitle="Verify the canonical PIN → Locality → Taluka → District → State hierarchy" />
          <View style={[styles.notice, { marginTop: 2 }]}><MapPin size={17} color="#E91E63" /><Text style={styles.noticeText}>Vendor discovery uses these mappings. Legacy City/Area records are not used here.</Text></View>

          <View style={[styles.workspace, stacked && styles.workspaceStacked]}>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>LOOK UP BY PIN</Text>
              <Text style={styles.cardTitle}>Enter a PIN code</Text>
              <Text style={styles.cardSubtitle}>District and Taluka appear automatically after the sixth digit.</Text>
              <View style={[styles.pinInputWrap, pinError ? styles.inputError : null]}>
                <Search size={18} color="#81777C" />
                <TextInput value={pin} onChangeText={onPinChange} keyboardType="number-pad" maxLength={6} placeholder="e.g. 411062" placeholderTextColor="#91898D" style={styles.pinInput} accessibilityLabel="Indian PIN code" />
                {pinLoading ? <ActivityIndicator size="small" color="#E91E63" /> : pin.length === 6 && lookupSummary ? <Check size={18} color="#16845B" /> : null}
              </View>
              {pinError ? <View style={styles.inlineError}><CircleAlert size={15} color="#B42318" /><Text style={styles.inlineErrorText}>{pinError}</Text></View> : null}
              {lookupSummary ? <View style={styles.resultBox}>
                <HierarchyRow label="State" value={lookupSummary.state} />
                <HierarchyRow label="District" value={lookupSummary.district} />
                <HierarchyRow label="Taluka" value={lookupSummary.taluka} />
                <View style={[styles.statusPill, lookupSummary.status !== "resolved" && styles.reviewPill]}><Text style={[styles.statusText, lookupSummary.status !== "resolved" && styles.reviewText]}>{lookupSummary.status === "resolved" ? "Resolved" : "Needs review"}</Text></View>
              </View> : null}
              {localities.length ? <View style={styles.localitySection}><Text style={styles.localityHeading}>{localities.length > 1 ? `${localities.length} localities found` : "Locality found"}</Text>{localities.map((item) => <View key={item.id} style={styles.localityRow}><View style={[styles.dot, !item.trusted && styles.dotReview]} /><View style={styles.flex}><Text style={styles.localityName}>{item.name}</Text><Text style={styles.localityMeta}>{item.taluka?.name ?? "Taluka needs review"} · {item.district?.name ?? "District needs review"}</Text></View></View>)}</View> : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.eyebrow}>FIND PIN CODES</Text>
              <Text style={styles.cardTitle}>Choose District and Taluka</Text>
              <Text style={styles.cardSubtitle}>Only PIN codes already linked to the canonical Taluka are shown.</Text>
              <SelectField label="State" value={states.find((item) => item.id === stateId)?.name} options={states} selectedId={stateId} onSelect={setStateId} />
              <SelectField label="District" value={districts.find((item) => item.id === districtId)?.name} options={districts} selectedId={districtId} onSelect={setDistrictId} disabled={!stateId} />
              <SelectField label="Taluka" value={talukas.find((item) => item.id === talukaId)?.name} options={talukas} selectedId={talukaId} onSelect={setTalukaId} disabled={!districtId} />
              {browseError ? <View style={styles.inlineError}><CircleAlert size={15} color="#B42318" /><Text style={styles.inlineErrorText}>{browseError}</Text></View> : null}
              {talukaId ? <View style={styles.pinResultsHeader}><Text style={styles.localityHeading}>{browseLoading ? "Loading PIN codes…" : `${pins.length} PIN code${pins.length === 1 ? "" : "s"}`}</Text>{pins.length > 5 ? <TextInput value={pinSearch} onChangeText={setPinSearch} placeholder="Filter PIN or locality" placeholderTextColor="#91898D" style={styles.filterInput} /> : null}</View> : null}
              {!browseLoading && talukaId && !pins.length ? <Text style={styles.emptyText}>No canonical PIN mapping exists for this Taluka yet.</Text> : null}
              <View style={styles.pinList}>{filteredPins.map((item) => <View key={item.pincode} style={styles.pinRow}><Text style={styles.pinCode}>{item.pincode}</Text><Text style={styles.pinLocalities} numberOfLines={2}>{item.localities.join(", ")}</Text><View style={[styles.miniDot, !item.trusted && styles.dotReview]} /></View>)}</View>
            </View>
          </View>
          <Pressable onPress={() => router.push("/AdminGeoLocations")} style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}><Text style={styles.manageButtonText}>Manage States, Districts & Talukas</Text></Pressable>
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}

function HierarchyRow({ label, value }: { label: string; value: string }) { return <View style={styles.hierarchyRow}><Text style={styles.hierarchyLabel}>{label}</Text><Text style={styles.hierarchyValue}>{value}</Text></View>; }

function SelectField({ label, value, options, selectedId, onSelect, disabled }: { label: string; value?: string; options: Option[]; selectedId: string | null; onSelect: (id: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Choose ${label}`} disabled={disabled} onPress={() => setOpen(true)} style={({ pressed }) => [styles.select, disabled && styles.disabled, pressed && !disabled && styles.pressed]}><Text style={[styles.selectText, !value && styles.placeholder]} numberOfLines={1}>{value ?? `Select ${label}`}</Text><ChevronDown size={18} color="#6D6368" /></Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}><Pressable style={styles.backdrop} onPress={() => setOpen(false)}><Pressable style={styles.menu} onPress={(event) => event.stopPropagation()}><View style={styles.menuHeader}><View><Text style={styles.menuTitle}>Choose {label}</Text><Text style={styles.menuSubtitle}>{options.length} available</Text></View><Pressable accessibilityLabel="Close dropdown" onPress={() => setOpen(false)} style={styles.closeButton}><X size={18} color="#30272C" /></Pressable></View><ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">{options.map((item) => { const selected = item.id === selectedId; return <Pressable key={item.id} onPress={() => { onSelect(item.id); setOpen(false); }} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{item.name}</Text>{selected ? <Check size={17} color="#E91E63" /> : null}</Pressable>; })}</ScrollView></Pressable></Pressable></Modal></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: adminPalette.canvas }, scroll: { paddingBottom: 120 }, flex: { flex: 1, minWidth: 0 },
  notice: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#FFF1F6", borderWidth: 1, borderColor: "#F8CEDD" }, noticeText: { flex: 1, color: "#655C61", fontFamily: fonts.sans.medium, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  workspace: { flexDirection: "row", alignItems: "flex-start", gap: 18, marginTop: 18 }, workspaceStacked: { flexDirection: "column" },
  card: { flex: 1, width: "100%", minWidth: 0, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: "#E9E2E5", backgroundColor: "#FFFFFF" },
  eyebrow: { color: "#E91E63", fontFamily: fonts.sans.bold, fontSize: 11, letterSpacing: 0.8 }, cardTitle: { marginTop: 6, color: "#241D21", fontFamily: fonts.sans.bold, fontSize: 20, lineHeight: 26 }, cardSubtitle: { marginTop: 5, marginBottom: 18, color: "#756B70", fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 19 },
  pinInputWrap: { minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#D8D0D4", borderRadius: 13, backgroundColor: "#FCFAFB" }, inputError: { borderColor: "#E99A95" }, pinInput: { flex: 1, minHeight: 48, color: "#241D21", fontFamily: fonts.sans.semibold, fontSize: 17, letterSpacing: 1.5, outlineStyle: "none" } as never,
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 10 }, inlineErrorText: { flex: 1, color: "#B42318", fontFamily: fonts.sans.medium, fontSize: 12, lineHeight: 18 },
  resultBox: { marginTop: 16, padding: 15, borderRadius: 14, backgroundColor: "#F8F6F7" }, hierarchyRow: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }, hierarchyLabel: { color: "#756B70", fontFamily: fonts.sans.medium, fontSize: 12 }, hierarchyValue: { flex: 1, color: "#241D21", fontFamily: fonts.sans.bold, fontSize: 13, textAlign: "right" }, statusPill: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#E8F7F1" }, reviewPill: { backgroundColor: "#FFF4E5" }, statusText: { color: "#16845B", fontFamily: fonts.sans.bold, fontSize: 11 }, reviewText: { color: "#A15C00" },
  localitySection: { marginTop: 18 }, localityHeading: { color: "#3A3035", fontFamily: fonts.sans.bold, fontSize: 12 }, localityRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E9E2E5" }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16845B" }, dotReview: { backgroundColor: "#D97706" }, localityName: { color: "#241D21", fontFamily: fonts.sans.semibold, fontSize: 13 }, localityMeta: { marginTop: 2, color: "#81777C", fontFamily: fonts.sans.regular, fontSize: 11 },
  field: { marginTop: 12 }, fieldLabel: { marginBottom: 7, color: "#4C4247", fontFamily: fonts.sans.bold, fontSize: 12 }, select: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: "#D8D0D4", borderRadius: 13, backgroundColor: "#FCFAFB", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, selectText: { flex: 1, color: "#241D21", fontFamily: fonts.sans.semibold, fontSize: 14 }, placeholder: { color: "#91898D" }, disabled: { opacity: 0.46 }, pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  pinResultsHeader: { marginTop: 20 }, filterInput: { minHeight: 42, marginTop: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: "#DDD5D9", borderRadius: 11, color: "#241D21", fontFamily: fonts.sans.medium, fontSize: 13, outlineStyle: "none" } as never, emptyText: { marginTop: 14, color: "#81777C", fontFamily: fonts.sans.regular, fontSize: 13 }, pinList: { marginTop: 8 }, pinRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E9E2E5" }, pinCode: { width: 62, color: "#241D21", fontFamily: fonts.sans.bold, fontSize: 13, letterSpacing: 0.4 }, pinLocalities: { flex: 1, color: "#756B70", fontFamily: fonts.sans.regular, fontSize: 12, lineHeight: 17 }, miniDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#16845B" },
  manageButton: { alignSelf: "flex-start", minHeight: 44, marginTop: 16, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: "#E91E63", alignItems: "center", justifyContent: "center" }, manageButtonText: { color: "#E91E63", fontFamily: fonts.sans.bold, fontSize: 12 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(30,22,26,0.46)" }, menu: { width: "100%", maxWidth: 480, maxHeight: "72%", overflow: "hidden", borderRadius: 18, backgroundColor: "#FFFFFF" }, menuHeader: { minHeight: 68, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#ECE5E8" }, menuTitle: { color: "#241D21", fontFamily: fonts.sans.bold, fontSize: 17 }, menuSubtitle: { marginTop: 2, color: "#81777C", fontFamily: fonts.sans.regular, fontSize: 11 }, closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 }, menuScroll: { paddingHorizontal: 8, paddingVertical: 8 }, option: { minHeight: 48, paddingHorizontal: 12, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, optionSelected: { backgroundColor: "#FFF0F5" }, optionText: { flex: 1, color: "#4C4247", fontFamily: fonts.sans.medium, fontSize: 14 }, optionTextSelected: { color: "#C81652", fontFamily: fonts.sans.bold },
});
