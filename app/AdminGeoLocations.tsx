import React from "react";
import { RefreshControl, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminState";
import { HierarchySelect } from "@/components/admin/locations/HierarchySelect";
import { TalukaAvailabilityList } from "@/components/admin/locations/TalukaAvailabilityList";
import { ResponsiveContainer } from "@/components/responsive/ResponsiveContainer";
import { useAdminGeoHierarchy } from "@/hooks/useAdminGeoHierarchy";

export default function AdminGeoLocations() {
  const { width } = useWindowDimensions();
  const stacked = width < 760;
  const {
    states,
    districts,
    talukas,
    selectedStateId,
    selectedDistrictId,
    loading,
    loadingDistricts,
    loadingTalukas,
    refreshing,
    savingTalukaIds,
    error,
    selectState,
    selectDistrict,
    toggleTaluka,
    setAllTalukasAccepting,
    refresh,
  } = useAdminGeoHierarchy();

  const selectedState = states.find((item) => item.id === selectedStateId);
  const selectedDistrict = districts.find((item) => item.id === selectedDistrictId);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#E91E63" />}
      >
        <ResponsiveContainer>
          <AdminPageHeader
            title="Locations"
            subtitle="Select a State and District, then turn Talukas on or off"
          />

          {loading ? <AdminLoadingState label="Loading locations…" /> : (
            <>
              <View className="bg-card border border-border rounded-2xl p-4 md:p-5">
                <View className={stacked ? "gap-3" : "flex-row gap-4"}>
                  <View className="flex-1">
                    <HierarchySelect
                      label="State"
                      value={selectedState?.name}
                      options={states}
                      selectedId={selectedStateId}
                      onSelect={selectState}
                    />
                  </View>
                  <View className="flex-1">
                    <HierarchySelect
                      label="District"
                      value={selectedDistrict?.name}
                      options={districts}
                      selectedId={selectedDistrictId}
                      onSelect={selectDistrict}
                      disabled={!selectedStateId || loadingDistricts}
                      loading={loadingDistricts}
                    />
                  </View>
                </View>
              </View>

              {error ? (
                <View className="mt-4">
                  <AdminEmptyState title="Location update failed" message={error} />
                </View>
              ) : null}

              <View className="mt-5">
                <TalukaAvailabilityList
                  districtName={selectedDistrict?.name}
                  talukas={talukas}
                  loading={loadingTalukas}
                  savingIds={savingTalukaIds}
                  onToggle={toggleTaluka}
                  onToggleAll={setAllTalukasAccepting}
                />
              </View>

              {!selectedStateId ? (
                <Text className="text-muted-foreground text-body mt-5">Select a State to continue.</Text>
              ) : !loadingDistricts && !districts.length ? (
                <Text className="text-muted-foreground text-body mt-5">No Districts are stored for this State yet.</Text>
              ) : null}
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
      <AdminFooter activeTab="profile" />
    </SafeAreaView>
  );
}
