import React from "react";
import { StyleSheet, View } from "react-native";
import { useColorScheme } from "nativewind";
import LocationSelector from "@/components/home/LocationSelector";

export default function DesktopLocationControl() {
  const { colorScheme } = useColorScheme();

  return (
    <View style={styles.container}>
      <LocationSelector dark={colorScheme === "dark"} compact homeHeader homeHeaderLabel="Your location" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 138, height: 48, marginRight: 12, justifyContent: "center" },
});
