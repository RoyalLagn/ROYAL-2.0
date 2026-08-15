import React from "react";
import { ActivityIndicator, Switch, Text, View } from "react-native";
import type { GeoTaluka } from "@/locations/types";
import { adminPalette } from "@/theme";

export function TalukaAvailabilityList({
  districtName,
  talukas,
  loading,
  savingIds,
  onToggle,
  onToggleAll,
}: {
  districtName?: string;
  talukas: GeoTaluka[];
  loading: boolean;
  savingIds: ReadonlySet<string>;
  onToggle: (talukaId: string, active: boolean) => void;
  onToggleAll?: (active: boolean) => void;
}) {
  const activeCount = talukas.filter((item) => item.acceptingApplications).length;
  const allActive = talukas.length > 0 && activeCount === talukas.length;
  const bulkSaving = talukas.length > 0 && talukas.every((item) => savingIds.has(item.id));

  return (
    <View className="bg-card border border-border rounded-2xl overflow-hidden">
      <View className="px-4 md:px-5 py-4 border-b border-border flex-row items-center justify-between gap-4">
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-title font-inter-bold" numberOfLines={1}>
            {districtName ? `${districtName} Talukas` : "Talukas"}
          </Text>
          <Text className="text-muted-foreground text-body-compact mt-1">
            {districtName ? `${activeCount} of ${talukas.length} accepting applications` : "Select a District to view Talukas"}
          </Text>
        </View>
        {districtName && talukas.length > 0 && onToggleAll ? (
          bulkSaving ? <ActivityIndicator size="small" color={adminPalette.brand} /> : (
            <View className="items-end">
              <Switch
                accessibilityLabel={`${allActive ? "Stop accepting" : "Accept"} new vendor applications for all Talukas in ${districtName}`}
                value={allActive}
                onValueChange={onToggleAll}
                trackColor={{ false: "#CBD0D8", true: adminPalette.brand }}
                thumbColor={adminPalette.surface}
              />
              <Text className="text-muted-foreground text-caption mt-1">All</Text>
            </View>
          )
        ) : null}
      </View>

      {loading ? (
        <View className="min-h-32 items-center justify-center">
          <ActivityIndicator color={adminPalette.brand} />
          <Text className="text-muted-foreground text-body-compact mt-3">Loading Talukas…</Text>
        </View>
      ) : !districtName ? null : !talukas.length ? (
        <Text className="text-muted-foreground text-body px-4 md:px-5 py-6">No Talukas are stored for this District yet.</Text>
      ) : (
        <View>
          {talukas.map((taluka, index) => {
            const saving = savingIds.has(taluka.id);
            return (
              <View
                key={taluka.id}
                className={`min-h-16 px-4 md:px-5 flex-row items-center justify-between gap-4 ${index < talukas.length - 1 ? "border-b border-border" : ""}`}
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-body font-inter-semibold" numberOfLines={1}>{taluka.name}</Text>
                  <Text className={taluka.acceptingApplications ? "text-emerald-700 text-caption mt-1 font-inter-medium" : "text-muted-foreground text-caption mt-1 font-inter-medium"}>
                    {taluka.acceptingApplications ? "Accepting applications" : "Applications paused"}
                  </Text>
                </View>
                {saving ? <ActivityIndicator size="small" color={adminPalette.brand} /> : (
                  <Switch
                    accessibilityLabel={`${taluka.acceptingApplications ? "Stop accepting" : "Accept"} new vendor applications from ${taluka.name}`}
                    value={taluka.acceptingApplications}
                    onValueChange={(accepting) => onToggle(taluka.id, accepting)}
                    trackColor={{ false: "#CBD0D8", true: adminPalette.brand }}
                    thumbColor={adminPalette.surface}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
