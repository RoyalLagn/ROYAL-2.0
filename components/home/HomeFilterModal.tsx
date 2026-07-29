import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, SlidersHorizontal, X } from "lucide-react-native";
import { useCategories } from "@/context/CategoryContext";

const PINK = "#E91E63";

export type HomeFilters = {
  minimumRating: number;
  maximumBudget: number;
  category: string;
  availabilityOnly: boolean;
  nearbyOnly: boolean;
  sort: "recommended" | "rating" | "price";
};

export const DEFAULT_HOME_FILTERS: HomeFilters = {
  minimumRating: 0,
  maximumBudget: 0,
  category: "",
  availabilityOnly: false,
  nearbyOnly: false,
  sort: "recommended",
};

type Props = {
  visible: boolean;
  dark: boolean;
  value: HomeFilters;
  city: string;
  onClose: () => void;
  onApply: (filters: HomeFilters) => void;
};

const RATINGS = [
  { value: 0, label: "Any" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
];
const BUDGETS = [
  { value: 0, label: "Any budget" },
  { value: 25000, label: "Under ₹25k" },
  { value: 50000, label: "Under ₹50k" },
  { value: 100000, label: "Under ₹1L" },
];
const SORTS = [
  { value: "recommended" as const, label: "Recommended" },
  { value: "rating" as const, label: "Highest rated" },
  { value: "price" as const, label: "Lowest price" },
];

export default function HomeFilterModal({ visible, dark, value, city, onClose, onApply }: Props) {
  const [draft, setDraft] = useState(value);
  const { searchCategories } = useCategories();
  const categories = ["", ...searchCategories.map((category) => category.name)];

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const colors = {
    surface: dark ? "#211E20" : "#FFFFFF",
    background: dark ? "#151315" : "#FFFAFC",
    text: dark ? "#F8F2F5" : "#241D21",
    muted: dark ? "#AAA0A5" : "#746A70",
    border: dark ? "#3B3237" : "#F0D9E4",
  };

  const pill = (selected: boolean) => ({
    backgroundColor: selected ? (dark ? "#34222B" : "#FFF0F6") : colors.background,
    borderColor: selected ? PINK : colors.border,
  });

  return (
    <Modal visible={visible} transparent animationType={Platform.OS === "web" ? "fade" : "slide"} onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, Platform.OS !== "web" && styles.backdropMobile]} onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          style={[styles.panel, Platform.OS !== "web" && styles.panelMobile, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <View style={styles.headerIcon}><SlidersHorizontal size={18} color={PINK} /></View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.text }]}>Filter vendors</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Refine global results without leaving Home.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={onClose} style={styles.close}>
              <X size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.text }]}>Minimum rating</Text>
            <View style={styles.pills}>
              {RATINGS.map((item) => (
                <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: draft.minimumRating === item.value }} onPress={() => setDraft({ ...draft, minimumRating: item.value })} style={[styles.pill, pill(draft.minimumRating === item.value)]}>
                  <Text style={[styles.pillText, { color: draft.minimumRating === item.value ? PINK : colors.text }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Maximum budget</Text>
            <View style={styles.pills}>
              {BUDGETS.map((item) => (
                <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: draft.maximumBudget === item.value }} onPress={() => setDraft({ ...draft, maximumBudget: item.value })} style={[styles.pill, pill(draft.maximumBudget === item.value)]}>
                  <Text style={[styles.pillText, { color: draft.maximumBudget === item.value ? PINK : colors.text }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Category</Text>
            <View style={styles.pills}>
              {categories.map((category) => (
                <Pressable key={category || "all"} accessibilityRole="button" accessibilityState={{ selected: draft.category === category }} onPress={() => setDraft({ ...draft, category })} style={[styles.pill, pill(draft.category === category)]}>
                  <Text style={[styles.pillText, { color: draft.category === category ? PINK : colors.text }]}>{category || "All categories"}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Sort results</Text>
            <View style={styles.pills}>
              {SORTS.map((item) => (
                <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: draft.sort === item.value }} onPress={() => setDraft({ ...draft, sort: item.value })} style={[styles.pill, pill(draft.sort === item.value)]}>
                  <Text style={[styles.pillText, { color: draft.sort === item.value ? PINK : colors.text }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.availabilityOnly }}
              onPress={() => setDraft({ ...draft, availabilityOnly: !draft.availabilityOnly })}
              style={[styles.nearby, { backgroundColor: colors.background, borderColor: draft.availabilityOnly ? PINK : colors.border }]}
            >
              <View style={[styles.checkbox, { borderColor: draft.availabilityOnly ? PINK : colors.border }, draft.availabilityOnly && styles.checkboxActive]}>
                {draft.availabilityOnly ? <Check size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.nearbyTitle, { color: colors.text }]}>Available vendors only</Text>
                <Text style={[styles.nearbyDescription, { color: colors.muted }]}>Uses temporary UI availability until the backend exposes dates.</Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.nearbyOnly }}
              onPress={() => setDraft({ ...draft, nearbyOnly: !draft.nearbyOnly })}
              style={[styles.nearby, { backgroundColor: colors.background, borderColor: draft.nearbyOnly ? PINK : colors.border }]}
            >
              <View style={[styles.checkbox, { borderColor: draft.nearbyOnly ? PINK : colors.border }, draft.nearbyOnly && styles.checkboxActive]}>
                {draft.nearbyOnly ? <Check size={14} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.flex}>
                <Text style={[styles.nearbyTitle, { color: colors.text }]}>Near {city} only</Text>
                <Text style={[styles.nearbyDescription, { color: colors.muted }]}>Hide vendors outside your selected city.</Text>
              </View>
            </Pressable>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" onPress={() => setDraft(DEFAULT_HOME_FILTERS)} style={[styles.reset, { borderColor: colors.border }]}>
              <Text style={[styles.resetText, { color: colors.text }]}>Reset</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={styles.apply}>
              <Text style={styles.applyText}>Apply filters</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(27,14,21,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  panel: { width: "100%", maxWidth: 560, maxHeight: "90%", borderWidth: 1, borderRadius: 24, padding: 20 },
  panelMobile: { maxWidth: "100%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#FFF0F6", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, lineHeight: 24, fontWeight: "800" },
  subtitle: { fontSize: 10, marginTop: 2 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 12, fontWeight: "800", marginBottom: 9 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  pill: { minHeight: 40, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 10, fontWeight: "700" },
  nearby: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: PINK, borderColor: PINK },
  nearbyTitle: { fontSize: 11, fontWeight: "800" },
  nearbyDescription: { fontSize: 9, lineHeight: 13, marginTop: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, flexDirection: "row", gap: 9 },
  reset: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resetText: { fontSize: 11, fontWeight: "800" },
  apply: { flex: 1.4, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  applyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
