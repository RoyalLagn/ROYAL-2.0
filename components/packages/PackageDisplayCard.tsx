import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarRange, Check, Clock3, Gift, Minus, PackageCheck, Sparkles } from "lucide-react-native";
import type { VendorPackage, VendorPackageItem } from "@/services/vendorPackages";

type Props = {
  item: VendorPackage;
  dark?: boolean;
  preview?: boolean;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onEnquire?: () => void;
};

const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function packagePriceLabel(item: Pick<VendorPackage, "price" | "discounted_price" | "price_type">) {
  if (item.price_type === "contact" || item.price == null) return "Contact for price";
  return `${item.price_type === "starting" ? "From " : ""}${money(item.discounted_price ?? item.price)}`;
}

export default function PackageDisplayCard({ item, dark = false, preview, onCall, onWhatsApp, onEnquire }: Props) {
  const palette = {
    surface: dark ? "#171D28" : "#FFFFFF",
    soft: dark ? "#28202A" : "#FFF1F6",
    text: dark ? "#FFF8FB" : "#21171C",
    muted: dark ? "#BEB2B8" : "#6E6268",
    border: dark ? "#333946" : "#F0E3E8",
  };
  const included = item.items.filter((entry) => entry.item_type === "included");
  const excluded = item.items.filter((entry) => entry.item_type === "excluded");
  const addOns = item.items.filter((entry) => entry.item_type === "add_on");

  return <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border, shadowColor: dark ? "#000" : "#9A4965" }]}>
    {item.image_url ? <Image source={{ uri: item.image_url }} resizeMode="cover" style={styles.cover} accessibilityLabel={`${item.title} package`} /> : null}
    <View style={styles.top}>
      <View style={styles.flex}>
        <View style={styles.eyebrowRow}>
          {item.service_category ? <Text style={styles.eyebrow}>{item.service_category.toUpperCase()}</Text> : null}
          {preview ? <Text style={styles.preview}>CUSTOMER PREVIEW</Text> : null}
        </View>
        <Text style={[styles.name, { color: palette.text }]}>{item.title}</Text>
        {item.description ? <Text style={[styles.description, { color: palette.muted }]}>{item.description}</Text> : null}
      </View>
      <View style={[styles.priceBox, { backgroundColor: palette.soft }]}>
        <Text style={[styles.price, { color: palette.text }]}>{packagePriceLabel(item)}</Text>
        {item.discounted_price != null && item.price != null ? <Text style={[styles.oldPrice, { color: palette.muted }]}>{money(item.price)}</Text> : null}
      </View>
    </View>

    {item.duration_label || item.events_covered ? <View style={styles.facts}>
      {item.duration_label ? <Fact icon={Clock3} text={item.duration_label} color={palette.muted} /> : null}
      {item.events_covered ? <Fact icon={CalendarRange} text={`${item.events_covered} ${item.events_covered === 1 ? "event" : "events"}`} color={palette.muted} /> : null}
    </View> : null}

    {included.length ? <ItemSection title="What's included" icon={PackageCheck} items={included} color="#168A5B" text={palette.text} muted={palette.muted} /> : null}
    {excluded.length ? <ItemSection title="Not included" icon={Minus} items={excluded} color="#B76A00" text={palette.text} muted={palette.muted} /> : null}
    {addOns.length ? <ItemSection title="Optional add-ons" icon={Gift} items={addOns} color="#D93D70" text={palette.text} muted={palette.muted} showPrice /> : null}

    {item.delivery_details ? <Detail icon={Sparkles} title="Delivery" value={item.delivery_details} text={palette.text} muted={palette.muted} /> : null}
    {item.terms ? <Detail icon={Check} title="Terms" value={item.terms} text={palette.text} muted={palette.muted} /> : null}

    {onCall || onWhatsApp || onEnquire ? <View style={[styles.actions, { borderTopColor: palette.border }]}>
      {onCall ? <Action label="Call" onPress={onCall} secondary dark={dark} /> : null}
      {onWhatsApp ? <Action label="WhatsApp" onPress={onWhatsApp} secondary dark={dark} /> : null}
      {onEnquire ? <Action label="Send enquiry" onPress={onEnquire} dark={dark} /> : null}
    </View> : null}
  </View>;
}

function Fact({ icon: Icon, text, color }: { icon: React.ElementType; text: string; color: string }) {
  return <View style={styles.fact}><Icon size={14} color="#D93D70" /><Text style={[styles.factText, { color }]}>{text}</Text></View>;
}
function ItemSection({ title, icon: Icon, items, color, text, muted, showPrice }: { title: string; icon: React.ElementType; items: VendorPackageItem[]; color: string; text: string; muted: string; showPrice?: boolean }) {
  return <View style={styles.section}><View style={styles.sectionTitleRow}><Icon size={16} color={color} /><Text style={[styles.sectionTitle, { color: text }]}>{title}</Text></View>{items.map((entry, index) => <View key={entry.id ?? `${entry.item_type}-${index}`} style={styles.itemRow}><View style={[styles.dot, { backgroundColor: color }]} /><View style={styles.flex}><Text style={[styles.itemText, { color: text }]}>{entry.title}</Text>{entry.description ? <Text style={[styles.itemDescription, { color: muted }]}>{entry.description}</Text> : null}</View>{showPrice && entry.price != null ? <Text style={[styles.addOnPrice, { color }]}>{money(entry.price)}</Text> : null}</View>)}</View>;
}
function Detail({ icon: Icon, title, value, text, muted }: { icon: React.ElementType; title: string; value: string; text: string; muted: string }) {
  return <View style={styles.detail}><Icon size={16} color="#D93D70" /><View style={styles.flex}><Text style={[styles.detailTitle, { color: text }]}>{title}</Text><Text style={[styles.detailText, { color: muted }]}>{value}</Text></View></View>;
}
function Action({ label, onPress, secondary, dark }: { label: string; onPress: () => void; secondary?: boolean; dark: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, secondary ? { backgroundColor: dark ? "#28202A" : "#FFF0F5" } : styles.actionPrimary, pressed && styles.pressed]}><Text style={[styles.actionText, { color: secondary ? (dark ? "#FF82AD" : "#C82D61") : "#FFF" }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 14, shadowOpacity: .065, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  cover: { width: "100%", height: 180, borderRadius: 18, marginBottom: 16 },
  top: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, flex: { flex: 1, minWidth: 0 }, eyebrowRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 5 }, eyebrow: { color: "#D93D70", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, preview: { color: "#A36D14", fontSize: 8, fontWeight: "900", letterSpacing: .8 }, name: { fontSize: 20, lineHeight: 25, fontWeight: "900", letterSpacing: -.4 }, description: { fontSize: 11, lineHeight: 17, marginTop: 6 },
  priceBox: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, alignItems: "flex-end", maxWidth: "42%" }, price: { fontSize: 14, fontWeight: "900" }, oldPrice: { fontSize: 10, textDecorationLine: "line-through", marginTop: 2 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }, fact: { flexDirection: "row", alignItems: "center", gap: 5 }, factText: { fontSize: 10, fontWeight: "700" },
  section: { marginTop: 17 }, sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 }, sectionTitle: { fontSize: 12, fontWeight: "800" }, itemRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 }, dot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 }, itemText: { fontSize: 11, lineHeight: 16, fontWeight: "600" }, itemDescription: { fontSize: 9, lineHeight: 14, marginTop: 1 }, addOnPrice: { fontSize: 10, fontWeight: "900", marginLeft: 8 },
  detail: { flexDirection: "row", gap: 9, marginTop: 16 }, detailTitle: { fontSize: 11, fontWeight: "800" }, detailText: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, borderTopWidth: 1, marginTop: 18, paddingTop: 14 }, action: { minHeight: 42, borderRadius: 13, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", flexGrow: 1 }, actionPrimary: { backgroundColor: "#E91E63" }, actionText: { fontSize: 11, fontWeight: "800" }, pressed: { opacity: .82, transform: [{ scale: .98 }] },
});
