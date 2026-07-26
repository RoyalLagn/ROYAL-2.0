import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown, MapPin, X } from "lucide-react-native";
import { SUPPORTED_LOCATIONS, useCustomerLocation } from "@/context/LocationContext";
import CompactSearchBar from "@/components/listing/CompactSearchBar";

const PINK = "#E91E63";

type LocationSelectorProps = {
  dark: boolean;
  compact?: boolean;
  filterChip?: boolean;
};

export default function LocationSelector({ dark, compact = false, filterChip = false }: LocationSelectorProps) {
  const { location, setLocation } = useCustomerLocation();
  const city = location.split(",")[0];
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(location);

  useEffect(() => {
    if (visible) {
      setDraft(location);
      setQuery("");
    }
  }, [location, visible]);

  const suggestions = useMemo(
    () => SUPPORTED_LOCATIONS.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  const colors = {
    surface: dark ? "#211E20" : "#FFFFFF",
    background: dark ? "#151315" : "#FFFAFC",
    text: dark ? "#F8F2F5" : "#241D21",
    muted: dark ? "#AAA0A5" : "#746A70",
    border: dark ? "#3B3237" : "#F0D9E4",
  };

  const close = () => setVisible(false);
  const confirm = () => {
    setLocation(draft);
    close();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Change location, currently ${location}`}
        accessibilityState={{ expanded: visible }}
        onPress={() => setVisible(true)}
        style={({ pressed, hovered }) => [
          styles.trigger,
          { backgroundColor: colors.surface, borderColor: colors.border },
          compact && styles.triggerCompact,
          filterChip && [styles.triggerFilter, { backgroundColor: colors.surface, borderColor: colors.border }],
          hovered && Platform.OS === "web" && { backgroundColor: dark ? "#2A2428" : "#FFF1F6" },
          pressed && styles.pressed,
        ]}
      >
        <MapPin size={compact ? 13 : 14} color={PINK} />
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.triggerText, filterChip && styles.triggerFilterText, { color: colors.text }]}>
          {filterChip ? "Location" : city}
        </Text>
        <ChevronDown size={compact ? 11 : 12} color={colors.muted} />
      </Pressable>

      <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={close}>
        <Pressable style={[styles.backdrop, Platform.OS !== "web" && styles.backdropMobile]} onPress={close}>
          <Pressable
            accessibilityViewIsModal
            style={[
              styles.sheet,
              Platform.OS !== "web" && styles.sheetMobile,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.text }]}>Choose your location</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Nearby recommendations update after confirmation.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close location selector" onPress={close} style={styles.closeButton}>
                <X size={20} color={colors.text} />
              </Pressable>
            </View>

            <CompactSearchBar
              accessibilityLabel="Search city or area"
              value={query}
              onChangeText={setQuery}
              placeholder="Search city or area"
              dark={dark}
            />

            <Text style={[styles.groupLabel, { color: colors.muted }]}>SUGGESTED LOCATIONS</Text>
            <View style={styles.options}>
              {suggestions.map((item) => {
                const selected = draft === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Select ${item}`}
                    onPress={() => setDraft(item)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: selected ? (dark ? "#34222B" : "#FFF0F6") : colors.background,
                        borderColor: selected ? PINK : colors.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: colors.surface }]}><MapPin size={16} color={PINK} /></View>
                    <Text style={[styles.optionText, { color: colors.text }]}>{item}</Text>
                    {selected ? <Check size={18} color={PINK} /> : null}
                  </Pressable>
                );
              })}
              {!suggestions.length ? <Text style={[styles.emptyText, { color: colors.muted }]}>No supported location found.</Text> : null}
            </View>

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={close} style={[styles.cancel, { borderColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirm} style={styles.confirm}>
                <Text style={styles.confirmText}>Confirm location</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  trigger: { minWidth: 0, maxWidth: 190, flexShrink: 1, height: 36, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 0, flexDirection: "row", alignItems: "center", gap: 3 },
  triggerCompact: { maxWidth: 190, paddingHorizontal: 7, borderRadius: 13 },
  triggerFilter: { minHeight: 42, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 },
  triggerText: { flexShrink: 1, minWidth: 0, fontSize: 11, lineHeight: 14, fontWeight: "700", includeFontPadding: false },
  triggerFilterText: { fontSize: 11 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,14,21,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 480, borderWidth: 1, borderRadius: 24, padding: 20 },
  sheetMobile: { maxWidth: "100%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 8, fontWeight: "900", letterSpacing: 1.1, marginTop: 18, marginBottom: 9 },
  options: { gap: 8 },
  option: { minHeight: 54, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  optionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optionText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "700" },
  emptyText: { textAlign: "center", paddingVertical: 18, fontSize: 11 },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  cancel: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cancelText: { fontSize: 11, fontWeight: "800" },
  confirm: { flex: 1.4, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
