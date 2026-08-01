import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Edit3,
  MapPin,
  MapPinned,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import type { LocationUsageCount, SupportedArea, SupportedCity } from "@/locations/types";
import {
  createSupportedArea,
  createSupportedCity,
  deleteSupportedArea,
  deleteSupportedCity,
  getLocationUsageCounts,
  listAdminLocations,
  loadLocationSettings,
  replaceSupportedPincodes,
  updateStrictCityMode,
  updateSupportedArea,
  updateSupportedCity,
} from "@/services/locations";

type EditorState = {
  kind: "city" | "area";
  id?: string;
  cityId?: string;
  name: string;
  state: string;
  pincodes: string;
};

type PendingAction = {
  title: string;
  message: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

const usageKey = (kind: "city" | "area", id: string) => `${kind}:${id}`;
const parsePincodes = (value: string) => [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];

export default function AdminLocations() {
  const [cities, setCities] = useState<SupportedCity[]>([]);
  const [usage, setUsage] = useState<Record<string, LocationUsageCount>>({});
  const [strictCityOnly, setStrictCityOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [nextCities, counts, settings] = await Promise.all([
        listAdminLocations(),
        getLocationUsageCounts(),
        loadLocationSettings(),
      ]);
      setCities(nextCities);
      setUsage(Object.fromEntries(counts.map((item) => [usageKey(item.kind, item.id), item])));
      setStrictCityOnly(settings.strictCityOnly);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Location Management.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    activeCities: cities.filter((city) => city.isActive).length,
    activeAreas: cities.flatMap((city) => city.areas).filter((area) => area.isActive).length,
    vendors: Object.values(usage).filter((item) => item.kind === "city").reduce((sum, item) => sum + item.vendorCount, 0),
    customers: Object.values(usage).filter((item) => item.kind === "city").reduce((sum, item) => sum + item.customerCount, 0),
  }), [cities, usage]);

  const perform = async (action: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await action();
      setEditor(null);
      setPending(null);
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The location change could not be saved.");
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

  const saveEditor = async () => {
    if (!editor?.name.trim()) return setError("Enter a location name.");
    if (editor.kind === "city" && !editor.state.trim()) return setError("Enter the state.");
    const pincodes = parsePincodes(editor.pincodes);
    if (pincodes.some((item) => !/^[1-9][0-9]{5}$/.test(item))) return setError("Every PIN code must contain exactly six digits.");
    await perform(async () => {
      if (editor.kind === "city") {
        if (editor.id) {
          await updateSupportedCity(editor.id, { name: editor.name, state: editor.state });
          await replaceSupportedPincodes(editor.id, null, pincodes);
        } else {
          await createSupportedCity({
            name: editor.name,
            state: editor.state,
            displayOrder: (cities[cities.length - 1]?.displayOrder ?? 0) + 10,
            pincodes,
          });
        }
        return;
      }
      if (!editor.cityId) throw new Error("Choose a parent city.");
      if (editor.id) {
        await updateSupportedArea(editor.id, { name: editor.name });
        await replaceSupportedPincodes(editor.cityId, editor.id, pincodes);
      } else {
        const city = cities.find((item) => item.id === editor.cityId);
        await createSupportedArea({
          cityId: editor.cityId,
          name: editor.name,
          displayOrder: ((city?.areas ?? [])[(city?.areas.length ?? 0) - 1]?.displayOrder ?? 0) + 10,
          pincodes,
        });
      }
    });
  };

  const confirmStatusChange = (kind: "city" | "area", item: SupportedCity | SupportedArea) => {
    const count = usage[usageKey(kind, item.id)] ?? { vendorCount: 0, customerCount: 0 };
    const nextActive = !item.isActive;
    if (nextActive) {
      void perform(() => kind === "city"
        ? updateSupportedCity(item.id, { isActive: true })
        : updateSupportedArea(item.id, { isActive: true }));
      return;
    }
    setPending({
      title: `Deactivate ${item.name}?`,
      message: `${count.vendorCount} vendors and ${count.customerCount} customers currently use this ${kind}. Existing records will remain unchanged, but it will disappear from new selections.`,
      destructive: true,
      run: () => kind === "city"
        ? updateSupportedCity(item.id, { isActive: false })
        : updateSupportedArea(item.id, { isActive: false }),
    });
  };

  const confirmDelete = (kind: "city" | "area", item: SupportedCity | SupportedArea) => {
    const count = usage[usageKey(kind, item.id)] ?? { vendorCount: 0, customerCount: 0 };
    if (count.vendorCount || count.customerCount) {
      setError(`${item.name} is in use by ${count.vendorCount} vendors and ${count.customerCount} customers. Deactivate it to preserve historical records.`);
      return;
    }
    setPending({
      title: `Delete ${item.name}?`,
      message: kind === "city"
        ? "This is only allowed when the city has no areas, PIN mappings, vendors or customers. This action cannot be undone."
        : "This is only allowed when the area has no PIN mappings, vendors or customers. This action cannot be undone.",
      destructive: true,
      run: () => kind === "city" ? deleteSupportedCity(item.id) : deleteSupportedArea(item.id),
    });
  };

  const move = async (kind: "city" | "area", cityId: string, index: number, direction: -1 | 1) => {
    const list = kind === "city" ? cities : cities.find((item) => item.id === cityId)?.areas ?? [];
    const otherIndex = index + direction;
    if (!list[otherIndex]) return;
    const current = list[index];
    const other = list[otherIndex];
    await perform(async () => {
      if (kind === "city") {
        await Promise.all([
          updateSupportedCity(current.id, { displayOrder: other.displayOrder }),
          updateSupportedCity(other.id, { displayOrder: current.displayOrder }),
        ]);
      } else {
        await Promise.all([
          updateSupportedArea(current.id, { displayOrder: other.displayOrder }),
          updateSupportedArea(other.id, { displayOrder: current.displayOrder }),
        ]);
      }
    });
  };

  return (
    <SafeAreaView style={styles.page} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#E91E63" />}>
        <ResponsiveContainer>
          <AdminPageHeader
            title="Location Management"
            subtitle="Control where RoyalLagn customers can browse and vendors can register"
            action={<Pressable onPress={() => setEditor({ kind: "city", name: "", state: "", pincodes: "" })} style={styles.primaryButton}><Plus size={16} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Add city</Text></Pressable>}
          />

          {error ? <View style={styles.errorBanner}><CircleAlert size={17} color="#B42318" /><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => setError("")}><X size={16} color="#B42318" /></Pressable></View> : null}

          <View style={styles.metrics}>
            <Metric icon={MapPinned} value={metrics.activeCities} label="Active cities" />
            <Metric icon={MapPin} value={metrics.activeAreas} label="Active areas" />
            <Metric icon={Users} value={metrics.vendors} label="Vendor links" />
            <Metric icon={Users} value={metrics.customers} label="Customer choices" />
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingCopy}><Text style={styles.settingTitle}>Strict city-only discovery</Text><Text style={styles.settingText}>When enabled, customers only see vendors serving their selected city. Approval, category, subscription and relevance checks still apply first.</Text></View>
            <Switch value={strictCityOnly} onValueChange={(value) => void perform(async () => { await updateStrictCityMode(value); })} trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }} thumbColor={strictCityOnly ? "#E91E63" : "#FFFFFF"} />
          </View>

          <View style={styles.sectionHeading}>
            <View><Text style={styles.sectionTitle}>Supported locations</Text><Text style={styles.sectionSubtitle}>Drag-free ordering controls work consistently on mobile, tablet and web.</Text></View>
            <Pressable accessibilityLabel="Refresh locations" onPress={() => void load(true)} style={styles.iconButton}><RefreshCw size={18} color="#E91E63" /></Pressable>
          </View>

          {loading ? <AdminLoadingState label="Loading managed locations…" /> : !cities.length ? <AdminEmptyState title="No supported cities" message="Add the first city to enable customer and vendor location selection." /> : (
            <View style={styles.cityList}>
              {cities.map((city, cityIndex) => {
                const cityUsage = usage[usageKey("city", city.id)];
                return <View key={city.id} style={styles.cityCard}>
                  <View style={styles.cityHeader}>
                    <View style={[styles.locationIcon, !city.isActive && styles.inactiveIcon]}><MapPinned size={20} color={city.isActive ? "#E91E63" : "#8A8589"} /></View>
                    <View style={styles.flex}><View style={styles.titleRow}><Text style={styles.cityName}>{city.name}</Text><Status active={city.isActive} /></View><Text style={styles.cityMeta}>{city.state} · {city.areas.length} areas · {cityUsage?.vendorCount ?? 0} vendors · {cityUsage?.customerCount ?? 0} customers</Text></View>
                    <View style={styles.actions}>
                      <Pressable accessibilityLabel="Move city up" onPress={() => void move("city", city.id, cityIndex, -1)} disabled={!cityIndex} style={[styles.smallIcon, !cityIndex && styles.disabled]}><ChevronUp size={16} color="#655C61" /></Pressable>
                      <Pressable accessibilityLabel="Move city down" onPress={() => void move("city", city.id, cityIndex, 1)} disabled={cityIndex === cities.length - 1} style={[styles.smallIcon, cityIndex === cities.length - 1 && styles.disabled]}><ChevronDown size={16} color="#655C61" /></Pressable>
                      <Pressable accessibilityLabel={`Edit ${city.name}`} onPress={() => setEditor({ kind: "city", id: city.id, name: city.name, state: city.state, pincodes: (city.pincodes ?? []).join(", ") })} style={styles.smallIcon}><Edit3 size={15} color="#E91E63" /></Pressable>
                      <Switch value={city.isActive} onValueChange={() => confirmStatusChange("city", city)} trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }} thumbColor={city.isActive ? "#E91E63" : "#FFFFFF"} />
                      <Pressable accessibilityLabel={`Delete ${city.name}`} onPress={() => confirmDelete("city", city)} style={styles.smallIcon}><Trash2 size={15} color="#D92D20" /></Pressable>
                    </View>
                  </View>

                  <View style={styles.areaBlock}>
                    <View style={styles.areaHeading}><Text style={styles.areaTitle}>Areas and localities</Text><Pressable onPress={() => setEditor({ kind: "area", cityId: city.id, name: "", state: city.state, pincodes: "" })} style={styles.addArea}><Plus size={14} color="#E91E63" /><Text style={styles.addAreaText}>Add area</Text></Pressable></View>
                    {!city.areas.length ? <Text style={styles.noAreas}>No areas yet. Customers can still select the city-wide option.</Text> : city.areas.map((area, areaIndex) => {
                      const areaUsage = usage[usageKey("area", area.id)];
                      return <View key={area.id} style={styles.areaRow}>
                        <View style={styles.areaDot} />
                        <View style={styles.flex}><View style={styles.titleRow}><Text style={styles.areaName}>{area.name}</Text><Status active={area.isActive} /></View><Text style={styles.areaMeta}>{(area.pincodes ?? []).length ? `${area.pincodes?.join(", ")} · ` : ""}{areaUsage?.vendorCount ?? 0} vendors · {areaUsage?.customerCount ?? 0} customers</Text></View>
                        <View style={styles.actions}>
                          <Pressable onPress={() => void move("area", city.id, areaIndex, -1)} disabled={!areaIndex} style={[styles.smallIcon, !areaIndex && styles.disabled]}><ChevronUp size={15} color="#655C61" /></Pressable>
                          <Pressable onPress={() => void move("area", city.id, areaIndex, 1)} disabled={areaIndex === city.areas.length - 1} style={[styles.smallIcon, areaIndex === city.areas.length - 1 && styles.disabled]}><ChevronDown size={15} color="#655C61" /></Pressable>
                          <Pressable onPress={() => setEditor({ kind: "area", id: area.id, cityId: city.id, name: area.name, state: city.state, pincodes: (area.pincodes ?? []).join(", ") })} style={styles.smallIcon}><Edit3 size={14} color="#E91E63" /></Pressable>
                          <Switch value={area.isActive} onValueChange={() => confirmStatusChange("area", area)} trackColor={{ false: "#E7E1E4", true: "#F4A9C4" }} thumbColor={area.isActive ? "#E91E63" : "#FFFFFF"} />
                          <Pressable onPress={() => confirmDelete("area", area)} style={styles.smallIcon}><Trash2 size={14} color="#D92D20" /></Pressable>
                        </View>
                      </View>;
                    })}
                  </View>
                </View>;
              })}
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />

      <Modal visible={Boolean(editor)} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <Pressable style={styles.backdrop} onPress={() => !saving && setEditor(null)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.modalHeader}><View style={styles.flex}><Text style={styles.modalTitle}>{editor?.id ? "Edit" : "Add"} {editor?.kind}</Text><Text style={styles.modalSubtitle}>Only active saved locations appear to customers and vendors.</Text></View><Pressable onPress={() => setEditor(null)} style={styles.smallIcon}><X size={18} color="#241D21" /></Pressable></View>
            <Field label={editor?.kind === "city" ? "City name" : "Area or locality name"} value={editor?.name ?? ""} onChangeText={(name) => setEditor((current) => current ? { ...current, name } : current)} />
            {editor?.kind === "city" ? <Field label="State" value={editor.state} onChangeText={(state) => setEditor((current) => current ? { ...current, state } : current)} /> : null}
            <Field label="PIN codes (optional)" value={editor?.pincodes ?? ""} onChangeText={(pincodes) => setEditor((current) => current ? { ...current, pincodes } : current)} placeholder="411001, 411002" />
            <Text style={styles.fieldHelper}>Separate multiple six-digit PIN codes with commas or spaces.</Text>
            <View style={styles.modalActions}><Pressable disabled={saving} onPress={() => setEditor(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => void saveEditor()} style={styles.primaryModalButton}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save location</Text>}</Pressable></View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(pending)} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <Pressable style={styles.backdrop} onPress={() => !saving && setPending(null)}>
          <Pressable style={styles.confirmCard} onPress={(event) => event.stopPropagation()}><View style={styles.warningIcon}><CircleAlert size={23} color="#D92D20" /></View><Text style={styles.confirmTitle}>{pending?.title}</Text><Text style={styles.confirmText}>{pending?.message}</Text><View style={styles.modalActions}><Pressable disabled={saving} onPress={() => setPending(null)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => pending && void perform(pending.run)} style={styles.destructiveButton}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Confirm</Text>}</Pressable></View></Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) { return <View style={styles.metric}><Icon size={18} color="#E91E63" /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Status({ active }: { active: boolean }) { return <View style={[styles.status, active ? styles.activeStatus : styles.inactiveStatus]}><Text style={[styles.statusText, { color: active ? "#16845B" : "#655C61" }]}>{active ? "Active" : "Inactive"}</Text></View>; }
function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder ?? `Enter ${label.toLowerCase()}`} placeholderTextColor="#8A8589" style={styles.input} /></View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFAFC" },
  scroll: { paddingBottom: 120 },
  flex: { flex: 1, minWidth: 0 },
  primaryButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#E91E63", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  errorBanner: { marginBottom: 14, borderRadius: 14, padding: 12, backgroundColor: "#FEF3F2", flexDirection: "row", alignItems: "center", gap: 9 },
  errorText: { flex: 1, color: "#B42318", fontSize: 11, lineHeight: 16 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  metric: { flexGrow: 1, flexBasis: 150, minHeight: 104, borderWidth: 1, borderColor: "#F0D9E4", borderRadius: 18, padding: 15, backgroundColor: "#FFFFFF" },
  metricValue: { color: "#241D21", fontSize: 24, fontWeight: "800", marginTop: 8 },
  metricLabel: { color: "#786D73", fontSize: 10, marginTop: 2 },
  settingCard: { borderWidth: 1, borderColor: "#F0D9E4", borderRadius: 18, padding: 16, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22 },
  settingCopy: { flex: 1, minWidth: 0 },
  settingTitle: { color: "#241D21", fontSize: 14, fontWeight: "800" },
  settingText: { color: "#786D73", fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  sectionTitle: { color: "#241D21", fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { color: "#786D73", fontSize: 10, marginTop: 3 },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F6" },
  cityList: { gap: 12 },
  cityCard: { borderWidth: 1, borderColor: "#F0D9E4", borderRadius: 20, padding: 15, backgroundColor: "#FFFFFF" },
  cityHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  locationIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F6" },
  inactiveIcon: { backgroundColor: "#F4F1F3" },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  cityName: { color: "#241D21", fontSize: 15, fontWeight: "800" },
  cityMeta: { color: "#786D73", fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 3 },
  smallIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.3 },
  status: { minHeight: 22, borderRadius: 999, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  activeStatus: { backgroundColor: "#ECFDF5" },
  inactiveStatus: { backgroundColor: "#F4F1F3" },
  statusText: { fontSize: 8.5, fontWeight: "800" },
  areaBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F0D9E4" },
  areaHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 7 },
  areaTitle: { color: "#655C61", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  addArea: { minHeight: 34, paddingHorizontal: 10, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF1F6" },
  addAreaText: { color: "#E91E63", fontSize: 10, fontWeight: "800" },
  noAreas: { color: "#8A8589", fontSize: 10.5, paddingVertical: 10 },
  areaRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#F3E9EE" },
  areaDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#F4A9C4" },
  areaName: { color: "#241D21", fontSize: 12, fontWeight: "700" },
  areaMeta: { color: "#786D73", fontSize: 9, marginTop: 3 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(25,15,20,.5)" },
  modalCard: { width: "100%", maxWidth: 500, borderRadius: 22, padding: 20, backgroundColor: "#FFFFFF" },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  modalTitle: { color: "#241D21", fontSize: 19, fontWeight: "800", textTransform: "capitalize" },
  modalSubtitle: { color: "#786D73", fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  field: { marginBottom: 13 },
  fieldLabel: { color: "#241D21", fontSize: 11, fontWeight: "700", marginBottom: 6 },
  input: { height: 50, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 14, paddingHorizontal: 14, color: "#241D21", fontSize: 13, backgroundColor: "#FFFAFC" },
  fieldHelper: { color: "#786D73", fontSize: 9.5, marginTop: -7 },
  modalActions: { flexDirection: "row", gap: 9, marginTop: 20 },
  secondaryButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: "#E7E1E4", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { color: "#241D21", fontSize: 11, fontWeight: "800" },
  primaryModalButton: { flex: 1.2, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63" },
  confirmCard: { width: "100%", maxWidth: 440, borderRadius: 22, padding: 22, backgroundColor: "#FFFFFF", alignItems: "center" },
  warningIcon: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3F2", marginBottom: 13 },
  confirmTitle: { color: "#241D21", fontSize: 18, fontWeight: "800", textAlign: "center" },
  confirmText: { color: "#786D73", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 7 },
  destructiveButton: { flex: 1.2, minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#D92D20" },
});
