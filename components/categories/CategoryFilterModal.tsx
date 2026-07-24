import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import type { CategoryCardItem } from "./CategoryCard";

const PINK = "#E91E63";

type CategoryFilterModalProps = {
  visible: boolean;
  dark: boolean;
  categories: CategoryCardItem[];
  selected: string | null;
  onClose: () => void;
  onApply: (category: string | null) => void;
};

export default function CategoryFilterModal({
  visible,
  dark,
  categories,
  selected,
  onClose,
  onApply,
}: CategoryFilterModalProps) {
  const [draft, setDraft] = useState<string | null>(selected);

  useEffect(() => {
    if (visible) setDraft(selected);
  }, [selected, visible]);

  const surface = dark ? "#211E20" : "#FFFFFF";
  const soft = dark ? "#171516" : "#FFF8FB";
  const text = dark ? "#F8F2F5" : "#211820";
  const muted = dark ? "#AAA0A5" : "#776B72";
  const border = dark ? "#44333B" : "#F0D4DF";

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
              <Text style={[styles.title, { color: text }]}>Filter categories</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Choose one category or show the complete collection.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close category filters" onPress={onClose} style={styles.close}>
              <X size={20} color={text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.optionsScroll} contentContainerStyle={styles.options}>
            {[{ id: null, name: "All Categories" }, ...categories].map((category) => {
              const id = category.id;
              const active = draft === id;
              return (
                <Pressable
                  key={id ?? "all"}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter by ${category.name}`}
                  onPress={() => setDraft(id)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor: active ? (dark ? "#38232C" : "#FFF0F6") : soft,
                      borderColor: active ? PINK : border,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text numberOfLines={1} style={[styles.optionText, { color: active ? PINK : text }]}>{category.name}</Text>
                  {active ? <Check size={17} color={PINK} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={[styles.reset, { borderColor: border }]}>
              <Text style={[styles.resetText, { color: text }]}>Reset</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onApply(draft)} style={styles.apply}>
              <Text style={styles.applyText}>Apply filter</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,16,23,.48)" },
  backdropMobile: { padding: 0, justifyContent: "flex-end" },
  sheet: { width: "100%", maxWidth: 520, maxHeight: "82%", borderWidth: 1, borderRadius: 26, padding: 20 },
  sheetMobile: { maxWidth: "100%", maxHeight: "86%", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: 28 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 15 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3 },
  subtitle: { marginTop: 3, fontSize: 10.5, lineHeight: 15 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  optionsScroll: { flexGrow: 0 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 4 },
  option: { minHeight: 44, maxWidth: "100%", borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
  optionText: { maxWidth: 220, fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
  actions: { flexDirection: "row", gap: 9, marginTop: 18 },
  reset: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  resetText: { fontSize: 11, fontWeight: "800" },
  apply: { flex: 1.35, minHeight: 48, borderRadius: 15, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  applyText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
