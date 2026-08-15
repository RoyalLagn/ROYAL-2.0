import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Pressable from "@/components/InteropSafePressable";
import { Check, X } from "lucide-react-native";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import { typeScale, typeLeading } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;

export type ListingSort = "popular" | "rating" | "price";

export type ListingFilters = {
  sort: ListingSort;
  maximumPrice: number;
  minimumRating: number;
};

type PriceOption = { label: string; value: number };

type ListingFilterModalProps = {
  visible: boolean;
  dark: boolean;
  value: ListingFilters;
  priceOptions: PriceOption[];
  initialSection?: "sort" | "price" | "rating" | "filters";
  onClose: () => void;
  onApply: (value: ListingFilters) => void;
};

const SORT_OPTIONS: { label: string; value: ListingSort }[] = [
  { label: "Popular", value: "popular" },
  { label: "Highest rated", value: "rating" },
  { label: "Lowest price", value: "price" },
];

const RATING_OPTIONS = [
  { label: "Any rating", value: 0 },
  { label: "4.0+", value: 4 },
  { label: "4.5+", value: 4.5 },
];

export default function ListingFilterModal({
  visible,
  dark,
  value,
  priceOptions,
  initialSection = "filters",
  onClose,
  onApply,
}: ListingFilterModalProps) {
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState(value);
  const [focusedControl, setFocusedControl] = useState("");

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const surface = dark ? "#211E20" : "#FFFFFF";
  const soft = dark ? "#171516" : "#FFF9FB";
  const text = dark ? "#F8F2F5" : "#251B21";
  const muted = dark ? "#AAA0A5" : "#786B72";
  const border = dark ? "#44333B" : "#F0D4DF";

  const option = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocusedControl(label)}
      onBlur={() => setFocusedControl("")}
      style={({ hovered, pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? (dark ? "#39242D" : "#FFF0F6") : soft,
          borderColor: selected || hovered || focusedControl === label ? PINK : border,
        },
        (hovered || focusedControl === label) && styles.controlHovered,
        pressed && styles.controlPressed,
      ]}
    >
      <Text style={[styles.optionText, { color: selected ? PINK : text }]}>{label}</Text>
      {selected ? <Check size={15} color={PINK} /> : null}
    </Pressable>
  );

  const sections: readonly ("sort" | "price" | "rating")[] = initialSection === "filters"
    ? ["sort", "price", "rating"]
    : [initialSection];

  return (
    <AnimatedBottomSheet
      visible={visible}
      onRequestClose={onClose}
      variant={width < 600 ? "sheet" : "center"}
      sheetStyle={[styles.sheet, { backgroundColor: surface, borderColor: border }]}
    >
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: text }]}>Refine vendors</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Sort and filter this category without changing your route.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close listing filters" onPress={onClose} onFocus={() => setFocusedControl("close")} onBlur={() => setFocusedControl("")} style={({ hovered, pressed }) => [styles.close, (hovered || focusedControl === "close") && { backgroundColor: soft }, pressed && styles.controlPressed]}>
              <X size={20} color={text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {sections.includes("sort") ? (
              <View>
                <Text style={[styles.label, { color: muted }]}>SORT RESULTS</Text>
                <View style={styles.options}>
                  {SORT_OPTIONS.map((item) => option(item.label, draft.sort === item.value, () => setDraft((current) => ({ ...current, sort: item.value }))))}
                </View>
              </View>
            ) : null}
            {sections.includes("price") ? (
              <View>
                <Text style={[styles.label, { color: muted }]}>MAXIMUM STARTING PRICE</Text>
                <View style={styles.options}>
                  {priceOptions.map((item) => option(item.label, draft.maximumPrice === item.value, () => setDraft((current) => ({ ...current, maximumPrice: item.value }))))}
                </View>
              </View>
            ) : null}
            {sections.includes("rating") ? (
              <View>
                <Text style={[styles.label, { color: muted }]}>MINIMUM RATING</Text>
                <View style={styles.options}>
                  {RATING_OPTIONS.map((item) => option(item.label, draft.minimumRating === item.value, () => setDraft((current) => ({ ...current, minimumRating: item.value }))))}
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setDraft({ sort: "popular", maximumPrice: 0, minimumRating: 0 })} onFocus={() => setFocusedControl("reset")} onBlur={() => setFocusedControl("")} style={({ hovered, pressed }) => [styles.reset, { borderColor: hovered || focusedControl === "reset" ? PINK : border }, (hovered || focusedControl === "reset") && styles.controlHovered, pressed && styles.controlPressed]}>
              <Text style={[styles.resetText, { color: text }]}>Reset</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} onFocus={() => setFocusedControl("apply")} onBlur={() => setFocusedControl("")} style={({ hovered, pressed }) => [styles.apply, (hovered || focusedControl === "apply") && styles.applyHovered, pressed && styles.controlPressed]}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
    </AnimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  sheet: { width: "100%", maxWidth: 520, maxHeight: "88%", borderWidth: 1, borderRadius: 26, padding: 20 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  title: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700" },
  subtitle: { marginTop: 3, fontSize: typeScale.metadata, lineHeight: typeLeading.label },
  close: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  content: { gap: 18, paddingTop: 8, paddingBottom: 4 },
  label: { marginBottom: 8, fontSize: typeScale.caption, lineHeight: typeLeading.caption, letterSpacing: 1, fontWeight: "700" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 43, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  optionText: { fontSize: typeScale.metadata, fontWeight: "700" },
  controlHovered: { transform: [{ translateY: -1 }] },
  controlPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  reset: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resetText: { fontSize: typeScale.metadata, fontWeight: "700" },
  apply: { flex: 1.35, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  applyHovered: { backgroundColor: "#D91858", transform: [{ translateY: -1 }] },
  applyText: { color: "#FFFFFF", fontSize: typeScale.metadata, fontWeight: "700" },
});
