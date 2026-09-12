import React, { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from "react-native";
import { CirclePlus, Pencil, Trash2, X } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService, signedTransactionAmount } from "@/services/adminFinanceService";
import { adminErrorMessage } from "@/services/adminErrors";
import type { FinanceCategory, FinanceDirection, FinanceMonthData, FinanceTransaction } from "@/types/adminFinance";
import { FinanceButton, FinanceEmpty, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

type Draft = { id?: string; occurred_on: string; category_id: string; customCategoryName: string; amount: string; tax_amount: string; gateway_fee: string; payment_method: string; counterparty: string; reference_number: string; notes: string; is_recurring: boolean };

// Sentinel category_id for the "Other / Custom" chip — never sent to the
// database. On save it's resolved to a real finance_categories.id via
// AdminFinanceService.getOrCreateCategory (find-or-create, no migration).
const CUSTOM_CATEGORY_VALUE = "__custom__";

export function FinanceTransactions({ data, direction, onChanged }: { data: FinanceMonthData; direction: FinanceDirection; onChanged: () => Promise<void> }) {
  const phone = useWindowDimensions().width < 600;
  const [editor, setEditor] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categories = data.categories.filter((item) => item.direction === direction);
  // Only the original seeded categories appear as fixed chips — any
  // category created through "Other / Custom" (is_system: false) is
  // recognized below and re-opens as Other / Custom instead of becoming a
  // permanent chip, per spec.
  const pickableCategories = categories.filter((item) => item.is_system);
  const rows = useMemo(() => data.transactions.filter((item) => item.direction === direction), [data.transactions, direction]);
  const closed = data.closure?.status === "closed";
  const noun = direction === "revenue" ? "revenue" : "expense";

  const openNew = () => setEditor({ occurred_on: data.monthStart, category_id: pickableCategories[0]?.id ?? "", customCategoryName: "", amount: "", tax_amount: "0", gateway_fee: "0", payment_method: "Business bank account", counterparty: "", reference_number: "", notes: "", is_recurring: false });
  const openExisting = (item: FinanceTransaction) => {
    if (item.source !== "manual") return;
    const category = categories.find((c) => c.id === item.category_id);
    const isCustom = Boolean(category && !category.is_system);
    setEditor({
      id: item.id, occurred_on: item.occurred_on,
      category_id: isCustom ? CUSTOM_CATEGORY_VALUE : item.category_id,
      customCategoryName: isCustom ? category!.name : "",
      amount: String(item.amount), tax_amount: String(item.tax_amount), gateway_fee: String(item.gateway_fee),
      payment_method: item.payment_method ?? "", counterparty: item.counterparty ?? "", reference_number: item.reference_number ?? "",
      notes: item.notes ?? "", is_recurring: item.is_recurring,
    });
  };
  const save = async () => {
    if (!editor) return;
    const amount = Number(editor.amount), tax = Number(editor.tax_amount || 0), fee = Number(editor.gateway_fee || 0);
    if (!editor.category_id) return setError("Choose a category.");
    let customName = "";
    if (editor.category_id === CUSTOM_CATEGORY_VALUE) {
      customName = editor.customCategoryName.trim();
      if (!customName) return setError("Please enter a custom expense category.");
      if (customName.length < 2) return setError("Custom category must be at least 2 characters.");
      if (customName.length > 80) return setError("Custom category name must be 80 characters or fewer.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editor.occurred_on)) return setError("Use date format YYYY-MM-DD.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter an amount greater than zero.");
    if (![tax, fee].every((value) => Number.isFinite(value) && value >= 0)) return setError("Tax and gateway fee cannot be negative.");
    setSaving(true); setError(null);
    try {
      const categoryId = editor.category_id === CUSTOM_CATEGORY_VALUE
        ? await AdminFinanceService.getOrCreateCategory(direction, customName)
        : editor.category_id;
      await AdminFinanceService.saveTransaction({ ...editor, category_id: categoryId, direction, amount, tax_amount: tax, gateway_fee: fee });
      setEditor(null); await onChanged();
    } catch (cause) { setError(adminErrorMessage(cause, `Unable to save ${noun}.`)); }
    finally { setSaving(false); }
  };
  const remove = (item: FinanceTransaction) => Alert.alert(`Delete ${noun}?`, "This removes the manual ledger record. Verified payment records cannot be deleted here.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => void AdminFinanceService.deleteTransaction(item.id).then(onChanged).catch((cause) => Alert.alert("Unable to delete record", adminErrorMessage(cause, "Please try again."))) },
  ]);

  return <FinanceSection title={direction === "revenue" ? "Revenue ledger" : "Expense ledger"} description={direction === "revenue" ? "Verified subscription receipts and manually recorded revenue. Gateway fees are shown separately." : "Actual operating expenses grouped by the category selected when recorded."} action={<FinanceButton label={`Add ${noun}`} icon={CirclePlus} onPress={openNew} disabled={closed} />}>
    {closed ? <FinanceNotice tone="success">This month is closed. Reopen it from Reports before making authorized corrections.</FinanceNotice> : null}
    {!rows.length ? <FinanceEmpty title={`No ${noun} recorded`} message={`Add the first ${noun} record for this month.`} /> : <View style={styles.list}>
      {rows.map((item, index) => { const category = categoryName(item, categories); const editable = item.source === "manual" && !closed; return <View key={item.id} style={[styles.row, phone && styles.rowPhone, index > 0 && styles.rowBorder, item.status === "void" && styles.voidRow]}>
        <View style={styles.dateBlock}><Text style={styles.dateDay}>{new Date(`${item.occurred_on}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", timeZone: "UTC" })}</Text><Text style={styles.dateMonth}>{new Date(`${item.occurred_on}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</Text></View>
        <View style={styles.flex}><View style={styles.titleLine}><Text numberOfLines={1} style={styles.rowTitle}>{item.counterparty || category}</Text><Text style={[styles.source, item.source === "subscription_payment" && styles.sourceVerified]}>{item.source === "subscription_payment" ? "Verified payment" : item.source.replaceAll("_", " ")}</Text></View><Text style={styles.meta}>{category}{item.reference_number ? ` · ${item.reference_number}` : ""}</Text>{item.notes ? <Text numberOfLines={1} style={styles.notes}>{item.notes}</Text> : null}</View>
        <View style={[styles.amountBlock, phone && styles.amountBlockPhone]}><Text style={[styles.amount, { color: item.source === "refund" ? adminPalette.error : direction === "revenue" ? adminPalette.success : adminPalette.text }]}>{formatMoney(direction === "revenue" ? signedTransactionAmount(item) : item.amount)}</Text>{item.gateway_fee > 0 ? <Text style={styles.fee}>− {formatMoney(item.gateway_fee)} fee</Text> : null}{item.status === "void" ? <Text style={styles.voidText}>Void</Text> : null}</View>
        {editable ? <View style={[styles.actions, phone && styles.actionsPhone]}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${noun}`} onPress={() => openExisting(item)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Pencil size={16} color={adminPalette.brand} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${noun}`} onPress={() => remove(item)} style={({ pressed }) => [styles.iconButton, styles.deleteButton, pressed && styles.pressed]}><Trash2 size={16} color={adminPalette.error} /></Pressable></View> : null}
      </View>; })}
    </View>}

    <Modal visible={!!editor} transparent animationType="fade" onRequestClose={() => !saving && setEditor(null)}>
      <View style={styles.backdrop}><Pressable accessibilityLabel="Close editor" style={StyleSheet.absoluteFill} onPress={() => !saving && setEditor(null)} /><View accessibilityViewIsModal style={styles.modal}>
        <View style={styles.modalHeader}><View style={styles.flex}><Text style={styles.modalTitle}>{editor?.id ? `Edit ${noun}` : `Add ${noun}`}</Text><Text style={styles.modalHint}>Record the actual transaction amount. Do not enter forecasts here.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => !saving && setEditor(null)} style={styles.close}><X size={19} color={adminPalette.textSecondary} /></Pressable></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {error ? <FinanceNotice tone="error">{error}</FinanceNotice> : null}
          <View>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {pickableCategories.map((category) => <CategoryChip key={category.id} label={category.name} selected={editor?.category_id === category.id} onPress={() => setEditor((current) => current ? { ...current, category_id: category.id } : current)} />)}
              <CategoryChip label="Other / Custom" selected={editor?.category_id === CUSTOM_CATEGORY_VALUE} onPress={() => setEditor((current) => current ? { ...current, category_id: CUSTOM_CATEGORY_VALUE } : current)} />
            </ScrollView>
          </View>
          {editor?.category_id === CUSTOM_CATEGORY_VALUE ? (
            <FinanceField label="Custom category" value={editor?.customCategoryName ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, customCategoryName: value } : current)} placeholder="Enter expense category" />
          ) : null}
          <View style={styles.fields}><FinanceField label="Date" value={editor?.occurred_on ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, occurred_on: value } : current)} placeholder="YYYY-MM-DD" /><FinanceField label="Amount" value={editor?.amount ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, amount: value } : current)} keyboardType="decimal-pad" placeholder="0.00" /></View>
          <View style={styles.fields}><FinanceField label="Tax included" value={editor?.tax_amount ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, tax_amount: value } : current)} keyboardType="decimal-pad" placeholder="0.00" />{direction === "revenue" ? <FinanceField label="Gateway fee" value={editor?.gateway_fee ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, gateway_fee: value } : current)} keyboardType="decimal-pad" placeholder="0.00" /> : null}</View>
          <View style={styles.fields}><FinanceField label="Company or vendor" value={editor?.counterparty ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, counterparty: value } : current)} placeholder={direction === "expense" ? "Bunny, Meta, accountant…" : "Customer or source"} /><FinanceField label="Reference number" value={editor?.reference_number ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, reference_number: value } : current)} placeholder="Optional reference" /></View>
          <FinanceField label="Payment method" value={editor?.payment_method ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, payment_method: value } : current)} placeholder="Business bank account" />
          <FinanceField label="Notes" value={editor?.notes ?? ""} onChangeText={(value) => setEditor((current) => current ? { ...current, notes: value } : current)} placeholder="What was this transaction for?" multiline />
          <View style={styles.toggle}><View style={styles.flex}><Text style={styles.toggleTitle}>Recurring transaction</Text><Text style={styles.toggleHint}>Marks the record for review next month; it does not create future expenses automatically.</Text></View><Switch value={editor?.is_recurring ?? false} onValueChange={(value) => setEditor((current) => current ? { ...current, is_recurring: value } : current)} trackColor={{ false: adminPalette.border, true: "#F9A8D4" }} thumbColor={editor?.is_recurring ? adminPalette.brand : "#FFF"} /></View>
          <FinanceButton label={saving ? "Saving…" : `Save ${noun}`} onPress={() => void save()} disabled={saving} />
        </ScrollView>
      </View></View>
    </Modal>
  </FinanceSection>;
}

function categoryName(item: FinanceTransaction, categories: FinanceCategory[]) { return item.finance_categories?.name || categories.find((category) => category.id === item.category_id)?.name || "Uncategorized"; }
function CategoryChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 }, list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, row: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }, rowPhone: { flexWrap: "wrap", alignItems: "flex-start" }, rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: adminPalette.border }, voidRow: { opacity: 0.55 }, dateBlock: { width: 43, height: 49, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, dateDay: { ...typeStyles.cardTitle, color: adminPalette.text }, dateMonth: { ...typeStyles.caption, color: adminPalette.textSecondary, textTransform: "uppercase" }, titleLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }, rowTitle: { ...typeStyles.label, color: adminPalette.text, maxWidth: 300 }, source: { ...typeStyles.caption, color: adminPalette.textSecondary, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, textTransform: "capitalize" }, sourceVerified: { color: adminPalette.success, backgroundColor: adminPalette.successSubtle }, meta: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 3 }, notes: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 2 }, amountBlock: { minWidth: 116, alignItems: "flex-end" }, amountBlockPhone: { marginLeft: 55, minWidth: 0, alignItems: "flex-start" }, amount: { ...typeStyles.cardTitle }, fee: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 3 }, voidText: { ...typeStyles.label, color: adminPalette.error, marginTop: 3 }, actions: { flexDirection: "row", gap: 5 }, actionsPhone: { marginLeft: "auto" }, iconButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" }, deleteButton: { backgroundColor: adminPalette.errorSubtle }, pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,18,25,.42)", justifyContent: "center", padding: 14 }, modal: { width: "100%", maxWidth: 720, maxHeight: "92%", alignSelf: "center", backgroundColor: adminPalette.surface, borderRadius: 20, overflow: "hidden" }, modalHeader: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminPalette.border, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 }, modalTitle: { ...typeStyles.sectionTitle, color: adminPalette.text }, modalHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 }, close: { width: 48, height: 48, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, form: { padding: 18, gap: 14 }, label: { ...typeStyles.label, color: adminPalette.textSecondary, marginBottom: 6 }, chips: { gap: 7, paddingRight: 18 }, chip: { minHeight: 48, borderRadius: 12, paddingHorizontal: 13, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, chipSelected: { backgroundColor: adminPalette.brand }, chipText: { ...typeStyles.label, color: adminPalette.textSecondary }, chipTextSelected: { color: "#FFF" }, fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, toggle: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12 }, toggleTitle: { ...typeStyles.label, color: adminPalette.text }, toggleHint: { ...typeStyles.caption, color: adminPalette.textSecondary, marginTop: 2 },
});
