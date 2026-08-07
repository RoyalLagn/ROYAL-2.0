import React from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { MapPin } from "lucide-react-native";
import { typeScale } from "@/constants/typography";

const PINK = "#E91E63";

export default function GetDirectionsButton({
  address,
  city,
  state,
}: {
  address?: string;
  city?: string;
  state?: string;
}) {
  const query = [address, city, state].filter(Boolean).join(", ").trim();
  if (!query) return null;
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Get directions"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={() => void Linking.openURL(url)}
    >
      <MapPin size={16} color={PINK} />
      <Text style={styles.text}>Get Directions</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PINK,
  },
  pressed: { opacity: 0.75 },
  text: { color: PINK, fontSize: typeScale.body, fontWeight: "700" },
});
