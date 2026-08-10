import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Compass,
  Landmark,
  Map,
  MapPinned,
  RefreshCw,
  Waypoints,
} from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import type { GeoDistrict, GeoState, GeoTaluka } from "@/locations/types";
import {
  type GeoAdminOverview,
  type UnmappedVendorPincode,
  adminRetryVendorGeoResolution,
  getGeoAdminOverview,
  listAdminGeoDistricts,
  listAdminGeoStates,
  listAdminGeoTalukas,
  listUnmappedVendorPincodes,
  rebuildTalukaNeighbors,
  setGeoDistrictActive,
  setGeoStateActive,
  setGeoTalukaActive,
} from "@/services/geoLocations";

// Admin console for the generic State -> District -> Taluka discovery
// hierarchy that powers the public VendorsListing location picker. This is
// deliberately a separate screen/route from the legacy City/Area manager at
// /AdminLocations (see that file's "New" link) -- the two systems run
// side-by-side, so neither admin flow risks the other's data.
//
// Read-mostly: activate/deactivate rows, inspect imported data and the
// automatically generated nearby-Taluka cache, and flag PIN codes that
// still need review. There is deliberately no "link Taluka A to Taluka B"
// control -- neighbours are always computed, never hand-authored.
export default function AdminGeoLocations() {
  const router = useRouter();
  const [overview, setOverview] = useState<GeoAdminOverview | null>(null);
  const [states, setStates] = useState<GeoState[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [talukas, setTalukas] = useState<GeoTaluka[]>([]);
  const [problemPincodes, setProblemPincodes] = useState<UnmappedVendorPincode[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [retryingVendorId, setRetryingVendorId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [overviewResult, statesResult, unmapped] = await Promise.all([
        getGeoAdminOverview(),
        listAdminGeoStates(),
        listUnmappedVendorPincodes(25),
      ]);
      setOverview(overviewResult);
      setStates(statesResult);
      setProblemPincodes(unmapped);
      setSelectedStateId((current) => current ?? statesResult[0]?.id ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load location data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selectedStateId) { setDistricts([]); return; }
    listAdminGeoDistricts(selectedStateId)
      .then((items) => {
        setDistricts(items);
        setSelectedDistrictId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? null));
      })
      .catch(() => setDistricts([]));
  }, [selectedStateId]);

  useEffect(() => {
    if (!selectedDistrictId) { setTalukas([]); return; }
    listAdminGeoTalukas(selectedDistrictId).then(setTalukas).catch(() => setTalukas([]));
  }, [selectedDistrictId]);

  const reload = async () => { setRefreshing(true); await load(); };

  const retryVendor = async (vendorId: string) => {
    setRetryingVendorId(vendorId);
    try {
      await adminRetryVendorGeoResolution(vendorId);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to retry this vendor's location.");
    } finally {
      setRetryingVendorId(null);
    }
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      await rebuildTalukaNeighbors({ stateId: selectedStateId });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rebuild nearby Talukas.");
    } finally {
      setRebuilding(false);
    }
  };

  const metrics = useMemo(() => overview ? [
    { icon: Landmark, value: `${overview.statesActive}/${overview.statesTotal}`, label: "Active States" },
    { icon: Map, value: `${overview.districtsActive}/${overview.districtsTotal}`, label: "Active Districts" },
    { icon: MapPinned, value: `${overview.talukasActive}/${overview.talukasTotal}`, label: "Active Talukas" },
    { icon: Waypoints, value: overview.talukasWithoutNeighbors, label: "Talukas missing neighbours" },
    { icon: Compass, value: `${overview.pincodesResolved}/${overview.pincodesTotal}`, label: "PIN codes resolved" },
    { icon: AlertTriangle, value: overview.vendorsNeedsReview + overview.vendorsUnresolved, label: "Vendors needing review" },
  ] : [], [overview]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="District & Taluka Locations"
            subtitle="State → District → Taluka discovery hierarchy (Maharashtra pilot)"
            action={<Pressable accessibilityLabel="Refresh" onPress={() => void reload()} className="min-w-11 min-h-11 items-center justify-center"><RefreshCw size={19} className="text-primary" /></Pressable>}
          />

          <Pressable onPress={() => router.push("/AdminLocations")} className="mb-4">
            <Text className="text-primary font-inter-semibold text-body-compact">← City / Area location manager</Text>
          </Pressable>

          {loading ? <AdminLoadingState label="Loading location data…" /> : error ? (
            <AdminEmptyState title="Couldn't load location data" message={error} />
          ) : (
            <>
              <View className="flex-row flex-wrap gap-3 mb-4">
                {metrics.map((metric) => {
                  const Icon = metric.icon;
                  return (
                    <View key={metric.label} className="bg-card border border-border rounded-2xl p-4" style={{ minWidth: 150, flexGrow: 1 }}>
                      <Icon size={18} className="text-primary" />
                      <Text className="text-foreground text-2xl font-bold mt-2">{metric.value}</Text>
                      <Text className="text-muted-foreground text-xs mt-1">{metric.label}</Text>
                    </View>
                  );
                })}
              </View>

              <View className="bg-card border border-border rounded-2xl p-4 mb-4">
                <Text className="text-foreground font-bold mb-1">Nearby-Taluka generation</Text>
                <Text className="text-muted-foreground text-xs mb-3">
                  Nearby Talukas are always calculated automatically from each Taluka&apos;s
                  centroid distance -- there is no manual adjacency list to maintain.
                  {overview?.neighborsGeneratedAt
                    ? ` Last generated ${new Date(overview.neighborsGeneratedAt).toLocaleString()}.`
                    : " Not generated yet."}
                </Text>
                <Pressable
                  disabled={rebuilding}
                  onPress={() => void rebuild()}
                  className="min-h-11 rounded-xl bg-primary items-center justify-center px-4"
                  style={{ opacity: rebuilding ? 0.6 : 1, alignSelf: "flex-start" }}
                >
                  <Text className="text-white font-inter-semibold text-body-compact">
                    {rebuilding ? "Rebuilding…" : "Rebuild nearby Talukas"}
                  </Text>
                </Pressable>
              </View>

              <Text className="text-foreground font-bold mb-2">States</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
                {states.map((state) => (
                  <Pressable
                    key={state.id}
                    onPress={() => setSelectedStateId(state.id)}
                    className={`min-h-11 px-4 rounded-full border items-center justify-center ${selectedStateId === state.id ? "bg-primary border-primary" : "bg-card border-border"}`}
                  >
                    <Text className={selectedStateId === state.id ? "text-white font-inter-semibold" : "text-foreground"}>
                      {state.name}{!state.isActive ? " (inactive)" : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {selectedStateId ? (
                <RowToggle
                  label={states.find((s) => s.id === selectedStateId)?.name ?? ""}
                  detail="State"
                  isActive={states.find((s) => s.id === selectedStateId)?.isActive ?? true}
                  onToggle={async (value) => {
                    await setGeoStateActive(selectedStateId, value);
                    void load();
                  }}
                />
              ) : null}

              <Text className="text-foreground font-bold mt-4 mb-2">Districts</Text>
              <View className="gap-2 mb-2">
                {districts.map((district) => (
                  <Pressable key={district.id} onPress={() => setSelectedDistrictId(district.id)}>
                    <RowToggle
                      label={district.name}
                      detail="District"
                      selected={selectedDistrictId === district.id}
                      isActive={district.isActive}
                      onToggle={async (value) => {
                        await setGeoDistrictActive(district.id, value);
                        void load();
                      }}
                    />
                  </Pressable>
                ))}
                {!districts.length ? <Text className="text-muted-foreground text-xs">No Districts imported for this State yet.</Text> : null}
              </View>

              <Text className="text-foreground font-bold mt-4 mb-2">Talukas</Text>
              <View className="gap-2 mb-2">
                {talukas.map((taluka) => (
                  <RowToggle
                    key={taluka.id}
                    label={taluka.name}
                    detail="Taluka"
                    isActive={taluka.isActive}
                    onToggle={async (value) => {
                      await setGeoTalukaActive(taluka.id, value);
                      void load();
                    }}
                  />
                ))}
                {!talukas.length ? <Text className="text-muted-foreground text-xs">No Talukas imported for this District yet.</Text> : null}
              </View>

              <Text className="text-foreground font-bold mt-6 mb-2">Vendor PIN codes needing review</Text>
              {!problemPincodes.length ? (
                <AdminEmptyState title="Nothing to review" message="Every vendor PIN code with a value has resolved cleanly to a Taluka." />
              ) : (
                <View className="gap-2">
                  {problemPincodes.map((row) => (
                    <View key={row.vendorId} className="bg-card border border-border rounded-2xl p-4">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1 min-w-0 mr-3">
                          <Text className="text-foreground font-bold" numberOfLines={1}>{row.businessName}</Text>
                          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>
                            PIN {row.pincode} · {row.city}, {row.state}
                          </Text>
                        </View>
                        <Text className={row.geoResolutionStatus === "needs_review" ? "text-amber-600 text-caption font-inter-semibold" : "text-muted-foreground text-caption font-inter-semibold"}>
                          {row.geoResolutionStatus === "needs_review" ? "Needs review" : "Unresolved"}
                        </Text>
                      </View>
                      {row.geoReviewReason ? (
                        <Text className="text-muted-foreground text-xs mt-2">{row.geoReviewReason}</Text>
                      ) : null}
                      <Pressable
                        disabled={retryingVendorId === row.vendorId}
                        onPress={() => void retryVendor(row.vendorId)}
                        className="min-h-9 mt-3 self-start px-3 rounded-lg bg-primary/10 items-center justify-center"
                      >
                        <Text className="text-primary font-inter-semibold text-caption">
                          {retryingVendorId === row.vendorId ? "Retrying…" : "Retry resolution"}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}

function RowToggle({
  label,
  detail,
  isActive,
  onToggle,
  selected,
}: {
  label: string;
  detail: string;
  isActive: boolean;
  onToggle: (value: boolean) => void | Promise<void>;
  selected?: boolean;
}) {
  return (
    <View className={`bg-card border rounded-2xl p-4 flex-row items-center justify-between ${selected ? "border-primary" : "border-border"}`}>
      <View className="flex-1 min-w-0 mr-3">
        <Text className="text-foreground font-bold" numberOfLines={1}>{label}</Text>
        <Text className="text-muted-foreground text-xs mt-1">{detail}</Text>
      </View>
      <Switch value={isActive} onValueChange={(value) => void onToggle(value)} trackColor={{ true: "#E91E63" }} />
    </View>
  );
}
