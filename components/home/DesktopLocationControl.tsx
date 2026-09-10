import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { LocateFixed } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import Pressable from "@/components/InteropSafePressable";
import { useCustomerLocation } from "@/context/LocationContext";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale } from "@/constants/typography";
import {
  DeviceLocationError,
  getCurrentDeviceLocation,
  getDevicePermissionStatus,
  getLastDetectedLocationLabel,
  requestDeviceLocationPermission,
  requestDeviceLocationServices,
  reverseGeocodeLabel,
  shortLocationLabel,
  subscribeToLocationDisplayLabel,
} from "@/services/deviceLocation";

export default function DesktopLocationControl() {
  const { colorScheme } = useColorScheme();
  const colors = brandColors(colorScheme === "dark");
  const { location } = useCustomerLocation();
  const [deviceLocationLabel, setDeviceLocationLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    void getLastDetectedLocationLabel().then((label) => {
      if (active && label) setDeviceLocationLabel(label);
    });
    const unsubscribe = subscribeToLocationDisplayLabel((label) => {
      if (active) setDeviceLocationLabel(label);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const fetchCurrentLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      let permission = await getDevicePermissionStatus();
      if (permission !== "granted") permission = await requestDeviceLocationPermission();
      if (permission !== "granted") {
        Alert.alert("Location permission needed", "Allow location access to detect your current location.");
        return;
      }
      if (!(await requestDeviceLocationServices())) {
        Alert.alert("Turn on location", "Enable location services, then select your location again.");
        return;
      }
      const coordinates = await getCurrentDeviceLocation();
      const label = await reverseGeocodeLabel(coordinates);
      setDeviceLocationLabel(label ?? "Current location");
    } catch (error) {
      const message = error instanceof DeviceLocationError && error.reason === "timeout"
        ? "Location detection timed out. Please try again."
        : "We couldn't detect your current location. Check location services and try again.";
      Alert.alert("Location unavailable", message);
    } finally {
      setLocating(false);
    }
  }, [locating]);

  const displayLocation = shortLocationLabel(deviceLocationLabel || location);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={locating ? "Detecting current location" : `Use current location. ${displayLocation}`}
      accessibilityState={{ busy: locating, disabled: locating }}
      disabled={locating}
      onPress={() => void fetchCurrentLocation()}
      className="h-12 min-w-[126px] max-w-[150px] px-2.5 mr-3 rounded-xl flex-row items-center hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={({ pressed }) => pressed ? styles.pressed : undefined}
    >
      <View style={[styles.icon, { backgroundColor: colors.actionTint }]}> 
        {locating
          ? <ActivityIndicator size="small" color={colors.primaryStrong} />
          : <LocateFixed size={16} color={colors.primaryStrong} strokeWidth={2.1} />}
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Your location</Text>
        <Text style={[styles.value, { color: colors.primaryStrong }]} numberOfLines={1}>
          {locating ? "Locating…" : displayLocation}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: { flex: 1, minWidth: 0, marginLeft: 8, justifyContent: "center" },
  label: { fontFamily: fonts.sans.medium, fontSize: 10, lineHeight: 13 },
  value: { marginTop: 1, fontFamily: fonts.sans.bold, fontSize: typeScale.caption, lineHeight: 16 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.78 },
});
