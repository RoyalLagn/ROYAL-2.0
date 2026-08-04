import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import type { VendorFaq } from "@/services/publicVendorListings";

export default function FaqSection({ faqs, dark }: { faqs: VendorFaq[]; dark: boolean }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!faqs.length) return null;
  const text = dark ? "#F8F1F4" : "#261A20";
  const muted = dark ? "#B79AA5" : "#7A6670";
  const border = dark ? "#3D3036" : "#F0DDE5";
  return (
    <View>
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <View key={`${faq.question}-${index}`} style={[styles.item, { borderColor: border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpenIndex(open ? null : index)}
              style={styles.question}
            >
              <Text style={[styles.questionText, { color: text }]}>{faq.question}</Text>
              <ChevronDown size={16} color={muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
            </Pressable>
            {open ? <Text style={[styles.answerText, { color: muted }]}>{faq.answer}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  question: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  questionText: { flex: 1, fontSize: 13, fontWeight: "700" },
  answerText: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
