import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Check, Gift, Minus, Plus, Trash2, X } from "lucide-react-native";
import { validateVendorPackage, type VendorPackage, type VendorPackageInput, type VendorPackageItem, type VendorPackageItemType, type VendorPackagePriceType, type VendorPackageStatus } from "@/services/vendorPackages";
import { typeScale, typeLeading } from "@/constants/typography";

type Props = { visible: boolean; vendorId: string; item: VendorPackage | null; dark?: boolean; saving: boolean; onClose: () => void; onSave: (input: VendorPackageInput) => void };
type ItemDraft = { key: string; title: string; description: string; price: string };

const emptyRow = (): ItemDraft => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: "", description: "", price: "" });

export default function PackageEditorModal({ visible, vendorId, item, dark = false, saving, onClose, onSave }: Props) {
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceType, setPriceType] = useState<VendorPackagePriceType>("starting");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState("");
  const [events, setEvents] = useState("");
  const [delivery, setDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [status, setStatus] = useState<VendorPackageStatus>("draft");
  const [included, setIncluded] = useState<ItemDraft[]>([]);
  const [excluded, setExcluded] = useState<ItemDraft[]>([]);
  const [addOns, setAddOns] = useState<ItemDraft[]>([]);
  const [error, setError] = useState("");
  const colors = { surface: dark ? "#0E141F" : "#FFF", background: dark ? "#171D28" : "#FFF9FB", soft: dark ? "#28202A" : "#FFF0F5", text: dark ? "#FFF8FB" : "#21171C", muted: dark ? "#BEB2B8" : "#74676D", border: dark ? "#333946" : "#EFDFE5" };

  useEffect(() => {
    if (!visible) return;
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setPriceType(item?.price_type ?? "starting");
    setPrice(item?.price == null ? "" : String(item.price));
    setDiscount(item?.discounted_price == null ? "" : String(item.discounted_price));
    setCategory(item?.service_category ?? "");
    setDuration(item?.duration_label ?? "");
    setEvents(item?.events_covered == null ? "" : String(item.events_covered));
    setDelivery(item?.delivery_details ?? "");
    setTerms(item?.terms ?? "");
    setStatus(item?.status ?? "draft");
    setIncluded(toDrafts(item, "included"));
    setExcluded(toDrafts(item, "excluded"));
    setAddOns(toDrafts(item, "add_on"));
    setError("");
  }, [item, visible]);

  const input = useMemo<VendorPackageInput>(() => ({
    vendor_id: vendorId,
    title,
    description: description || null,
    price: priceType === "contact" || !price ? null : Number(price),
    discounted_price: priceType === "contact" || !discount ? null : Number(discount),
    price_type: priceType,
    service_category: category || null,
    duration_label: duration || null,
    events_covered: events ? Number(events) : null,
    delivery_details: delivery || null,
    terms: terms || null,
    status,
    items: [
      ...toItems(included, "included"),
      ...toItems(excluded, "excluded"),
      ...toItems(addOns, "add_on"),
    ],
  }), [addOns, category, delivery, description, discount, duration, events, excluded, included, price, priceType, status, terms, title, vendorId]);

  const submit = (nextStatus?: VendorPackageStatus) => {
    if (saving) return;
    const candidate = { ...input, status: nextStatus ?? status };
    const errors = validateVendorPackage(candidate);
    if (errors.length) return setError(errors[0]);
    setError("");
    onSave(candidate);
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={[styles.backdrop, width >= 820 && styles.centered]}><View style={[styles.sheet, width >= 820 && styles.desktop, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>{item ? "Edit package" : "Create package"}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Customer-facing information and package contents</Text></View><Pressable accessibilityLabel="Close package editor" onPress={onClose} style={[styles.close, { backgroundColor: colors.background }]}><X size={20} color={colors.text} /></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
        <Section title="Package basics" hint="Use a clear name and concise summary." colors={colors} />
        <Field label="Package name *" value={title} onChangeText={setTitle} placeholder="e.g. Signature Wedding Photography" colors={colors} maxLength={120} />
        <View style={styles.two}><Field label="Service category" value={category} onChangeText={setCategory} placeholder="Photography, decor…" colors={colors} /><Field label="Package status" colors={colors} custom={<ChoiceRow values={["draft", "active", "inactive"]} selected={status} onSelect={(value) => setStatus(value as VendorPackageStatus)} colors={colors} />} /></View>
        <Field label="Short description" value={description} onChangeText={setDescription} placeholder="Explain what makes this package useful" colors={colors} multiline maxLength={1200} />

        <Section title="Pricing" hint="Choose starting, fixed or contact pricing." colors={colors} />
        <ChoiceRow values={["starting", "fixed", "contact"]} selected={priceType} onSelect={(value) => setPriceType(value as VendorPackagePriceType)} colors={colors} />
        {priceType !== "contact" ? <View style={styles.two}><Field label={`${priceType === "starting" ? "Starting" : "Fixed"} price (₹) *`} value={price} onChangeText={(value: string) => setPrice(cleanNumber(value))} placeholder="25000" colors={colors} keyboardType="decimal-pad" /><Field label="Offer price (₹)" value={discount} onChangeText={(value: string) => setDiscount(cleanNumber(value))} placeholder="Optional" colors={colors} keyboardType="decimal-pad" /></View> : <Text style={[styles.info, { color: colors.muted, backgroundColor: colors.background }]}>Customers will see “Contact for price”.</Text>}

        <Section title="Coverage & delivery" hint="Set expectations before customers enquire." colors={colors} />
        <View style={styles.two}><Field label="Duration" value={duration} onChangeText={setDuration} placeholder="e.g. 10 hours / 2 days" colors={colors} /><Field label="Events covered" value={events} onChangeText={(value: string) => setEvents(value.replace(/\D/g, ""))} placeholder="e.g. 2" colors={colors} keyboardType="number-pad" /></View>
        <Field label="Delivery details" value={delivery} onChangeText={setDelivery} placeholder="Timeline, format and delivery method" colors={colors} multiline />

        <Section title="Package contents" hint="Add each item separately so customers can scan it quickly." colors={colors} />
        <Repeater title="Included services" type="included" rows={included} setRows={setIncluded} colors={colors} />
        <Repeater title="Not included" type="excluded" rows={excluded} setRows={setExcluded} colors={colors} />
        <Repeater title="Optional add-ons" type="add_on" rows={addOns} setRows={setAddOns} colors={colors} />

        <Section title="Terms" hint="Add important booking, travel or cancellation notes." colors={colors} />
        <Field label="Package terms" value={terms} onChangeText={setTerms} placeholder="Deposit, travel, overtime or cancellation terms" colors={colors} multiline />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable disabled={saving} onPress={() => submit("draft")} style={[styles.draft, { backgroundColor: colors.soft }, saving && styles.disabled]}><Text style={styles.draftText}>Save draft</Text></Pressable>
        <Pressable disabled={saving} onPress={() => submit()} style={[styles.save, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFF" /> : <><Check size={16} color="#FFF" /><Text style={styles.saveText}>{status === "active" ? "Save & publish" : "Save package"}</Text></>}</Pressable>
      </View>
    </View></View>
  </Modal>;
}

function toDrafts(item: VendorPackage | null, type: VendorPackageItemType): ItemDraft[] { return item?.items.filter((entry) => entry.item_type === type).map((entry) => ({ key: entry.id ?? emptyRow().key, title: entry.title, description: entry.description ?? "", price: entry.price == null ? "" : String(entry.price) })) ?? []; }
function toItems(rows: ItemDraft[], type: VendorPackageItemType): VendorPackageItem[] { return rows.filter((row) => row.title.trim()).map((row, index) => ({ item_type: type, title: row.title, description: row.description || null, price: type === "add_on" && row.price ? Number(row.price) : null, display_order: index })); }
function cleanNumber(value: string) { const parts = value.replace(/[^0-9.]/g, "").split("."); return parts.length > 1 ? `${parts.shift()}.${parts.join("")}` : parts[0]; }
function Section({ title, hint, colors }: any) { return <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.sectionHint, { color: colors.muted }]}>{hint}</Text></View>; }
function Field({ label, colors, custom, multiline, ...props }: any) { return <View style={styles.field}><Text style={[styles.label, { color: colors.text }]}>{label}</Text>{custom ?? <TextInput {...props} multiline={multiline} placeholderTextColor={colors.muted} style={[styles.input, multiline && styles.textarea, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />}</View>; }
function ChoiceRow({ values, selected, onSelect, colors }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: any }) { return <View style={styles.choices}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.choice, { backgroundColor: selected === value ? "#E91E63" : colors.background, borderColor: selected === value ? "#E91E63" : colors.border }]}><Text style={[styles.choiceText, { color: selected === value ? "#FFF" : colors.text }]}>{value.replace("_", " ")}</Text></Pressable>)}</View>; }
function Repeater({ title, type, rows, setRows, colors }: { title: string; type: VendorPackageItemType; rows: ItemDraft[]; setRows: React.Dispatch<React.SetStateAction<ItemDraft[]>>; colors: any }) {
  const Icon = type === "included" ? Check : type === "excluded" ? Minus : Gift;
  const update = (key: string, changes: Partial<ItemDraft>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...changes } : row));
  return <View style={styles.repeater}><View style={styles.repeaterTitle}><Icon size={16} color="#E91E63" /><Text style={[styles.repeaterText, { color: colors.text }]}>{title}</Text><Pressable onPress={() => setRows((current) => [...current, emptyRow()])} style={[styles.add, { backgroundColor: colors.soft }]}><Plus size={14} color="#E91E63" /><Text style={styles.addText}>Add</Text></Pressable></View>{rows.map((row, index) => <View key={row.key} style={[styles.itemRow, { backgroundColor: colors.background, borderColor: colors.border }]}><View style={styles.flex}><TextInput value={row.title} onChangeText={(title) => update(row.key, { title })} placeholder={`${title.slice(0, -1)} ${index + 1}`} placeholderTextColor={colors.muted} style={[styles.itemInput, { color: colors.text }]} /><TextInput value={row.description} onChangeText={(description) => update(row.key, { description })} placeholder="Optional detail" placeholderTextColor={colors.muted} style={[styles.itemDetail, { color: colors.muted }]} />{type === "add_on" ? <TextInput value={row.price} onChangeText={(price) => update(row.key, { price: cleanNumber(price) })} keyboardType="decimal-pad" placeholder="Optional price ₹" placeholderTextColor={colors.muted} style={[styles.itemDetail, { color: colors.text }]} /> : null}</View><Pressable accessibilityLabel={`Remove ${title} item`} onPress={() => setRows((current) => current.filter((entry) => entry.key !== row.key))} style={styles.remove}><Trash2 size={15} color="#C83B55" /></Pressable></View>)}</View>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,7,10,.58)" }, centered: { justifyContent: "center", alignItems: "center", padding: 22 }, sheet: { width: "100%", maxHeight: "96%", borderWidth: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" }, desktop: { maxWidth: 790, maxHeight: "92%", borderRadius: 28 }, header: { flexDirection: "row", alignItems: "center", padding: 18, borderBottomWidth: 1 }, flex: { flex: 1, minWidth: 0 }, title: { fontSize: typeScale.sectionTitle, fontWeight: "700" }, subtitle: { fontSize: typeScale.caption, marginTop: 3 }, close: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, form: { padding: 18, paddingBottom: 28 }, section: { marginTop: 20, marginBottom: 11 }, sectionTitle: { fontSize: typeScale.body, fontWeight: "700" }, sectionHint: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 3 }, two: { flexDirection: "row", flexWrap: "wrap", gap: 11 }, field: { flex: 1, minWidth: 210, marginBottom: 12 }, label: { fontSize: typeScale.caption, fontWeight: "700", marginBottom: 6 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: typeScale.bodyCompact }, textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, choice: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, choiceText: { fontSize: typeScale.caption, fontWeight: "700", textTransform: "capitalize" }, info: { padding: 13, borderRadius: 13, fontSize: typeScale.caption }, repeater: { marginBottom: 15 }, repeaterTitle: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 }, repeaterText: { flex: 1, fontSize: typeScale.metadata, fontWeight: "700" }, add: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, flexDirection: "row", gap: 5, alignItems: "center" }, addText: { color: "#D52F68", fontSize: typeScale.caption, fontWeight: "700" }, itemRow: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", marginBottom: 7 }, itemInput: { minHeight: 30, fontSize: typeScale.metadata, fontWeight: "700" }, itemDetail: { minHeight: 28, fontSize: typeScale.caption }, remove: { width: 38, height: 38, alignItems: "center", justifyContent: "center" }, error: { color: "#D33B55", fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 12 }, footer: { borderTopWidth: 1, flexDirection: "row", gap: 9, padding: 14 }, draft: { minHeight: 48, borderRadius: 14, paddingHorizontal: 17, alignItems: "center", justifyContent: "center" }, draftText: { color: "#D52F68", fontSize: typeScale.metadata, fontWeight: "700" }, save: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: "#E91E63", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, saveText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" }, disabled: { opacity: .55 },
});
