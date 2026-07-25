import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";

const PINK = "#E91E63";

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
  const [draft, setDraft] = useState(value);

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
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? (dark ? "#39242D" : "#FFF0F6") : soft,
          borderColor: selected ? PINK : border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.optionText, { color: selected ? PINK : text }]}>{label}</Text>
      {selected ? <Check size={15} color={PINK} /> : null}
    </Pressable>
  );

  const sections = initialSection === "filters"
    ? ["sort", "price", "rating"] as const
    : [initialSection] as const;

  return (
    <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, Platform.OS !== "web" && styles.backdropMobile]} onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, Platform.OS !== "web" && styles.sheetMobile, { backgroundColor: surface, borderColor: border }]}
        >
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: text }]}>Refine vendors</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Sort and filter this category without changing your route.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close listing filters" onPress={onClose} style={styles.close}>
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
            <Pressable accessibilityRole="button" onPress={() => setDraft({ sort: "popular", maximumPrice: 0, minimumRating: 0 })} style={[styles.reset, { borderColor: border }]}>
              <Text style={[styles.resetText, { color: text }]}>Reset</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={styles.apply}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,16,23,.50)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 520, maxHeight: "82%", borderWidth: 1, borderRadius: 26, padding: 20 },
  sheetMobile: { maxWidth: "100%", maxHeight: "86%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  subtitle: { marginTop: 3, fontSize: 10.5, lineHeight: 15 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  content: { gap: 18, paddingTop: 8, paddingBottom: 4 },
  label: { marginBottom: 8, fontSize: 8.5, lineHeight: 12, letterSpacing: 1, fontWeight: "900" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 43, borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  optionText: { fontSize: 10.5, fontWeight: "700" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  reset: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resetText: { fontSize: 11, fontWeight: "800" },
  apply: { flex: 1.35, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  applyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
