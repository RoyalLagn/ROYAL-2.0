import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Cloud, Save } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";
import { AdminFinanceService } from "@/services/adminFinanceService";
import type { FinanceMonthData } from "@/types/adminFinance";
import { FinanceButton, FinanceField, FinanceNotice, FinanceSection, formatMoney } from "./FinanceUI";

export function FinanceBudgets({ data, onChanged }: { data: FinanceMonthData; onChanged: () => Promise<void> }) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(data.budgetItems.map((item) => [item.category_id, String(item.amount)])));
  const [revenueTarget, setRevenueTarget] = useState(String(data.budget?.revenue_target ?? 0));
  const [usage, setUsage] = useState(() => ({ storage: String(data.cloudinaryUsage?.storage_percent ?? ""), bandwidth: String(data.cloudinaryUsage?.bandwidth_percent ?? ""), transformations: String(data.cloudinaryUsage?.transformations_percent ?? ""), estimated: String(data.cloudinaryUsage?.estimated_cost ?? 0), actual: String(data.cloudinaryUsage?.actual_cost ?? 0), notes: data.cloudinaryUsage?.notes ?? "" }));
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingUsage, setSavingUsage] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const closed = data.closure?.status === "closed";
  const categories = data.categories.filter((item) => item.direction === "expense");
  const grouped = useMemo(() => categories.reduce((result, item) => {
    const group = result.get(item.group_name) ?? [];
    group.push(item);
    result.set(item.group_name, group);
    return result;
  }, new Map<string, typeof categories>()), [categories]);
  const total = Object.values(amounts).reduce((sum, value) => sum + (Number(value) || 0), 0);

  const saveBudget = async () => {
    const target = Number(revenueTarget || 0);
    const items = categories.map((category) => ({ category_id: category.id, amount: Number(amounts[category.id] || 0) }));
    if (!Number.isFinite(target) || target < 0 || items.some((item) => !Number.isFinite(item.amount) || item.amount < 0)) return setMessage({ text: "Budget amounts and the revenue target must be zero or greater.", tone: "error" });
    setSavingBudget(true); setMessage(null);
    try { await AdminFinanceService.saveBudget(data.monthStart, target, items); setMessage({ text: "Monthly budget saved.", tone: "success" }); await onChanged(); }
    catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Unable to save the budget.", tone: "error" }); }
    finally { setSavingBudget(false); }
  };

  const saveUsage = async () => {
    const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
    const next = { storage: numberOrNull(usage.storage), bandwidth: numberOrNull(usage.bandwidth), transformations: numberOrNull(usage.transformations), estimated: Number(usage.estimated || 0), actual: Number(usage.actual || 0) };
    if ([next.storage, next.bandwidth, next.transformations].some((value) => value != null && (!Number.isFinite(value) || value < 0 || value > 100))) return setMessage({ text: "Cloudinary usage must be between 0 and 100 percent.", tone: "error" });
    if (![next.estimated, next.actual].every((value) => Number.isFinite(value) && value >= 0)) return setMessage({ text: "Cloudinary costs cannot be negative.", tone: "error" });
    setSavingUsage(true); setMessage(null);
    try { await AdminFinanceService.saveCloudinaryUsage({ id: data.cloudinaryUsage?.id, month_start: data.monthStart, storage_percent: next.storage, bandwidth_percent: next.bandwidth, transformations_percent: next.transformations, estimated_cost: next.estimated, actual_cost: next.actual, notes: usage.notes }); setMessage({ text: "Cloudinary cost record saved.", tone: "success" }); await onChanged(); }
    catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Unable to save Cloudinary usage.", tone: "error" }); }
    finally { setSavingUsage(false); }
  };

  return <View style={styles.stack}>
    {message ? <FinanceNotice tone={message.tone}>{message.text}</FinanceNotice> : null}
    {closed ? <FinanceNotice tone="success">This month is closed. Reopen it from Reports before changing the budget.</FinanceNotice> : null}
    <FinanceSection title="Monthly operating budget" description="Set spending limits by expense category and compare them with actual ledger records." action={<View style={styles.total}><Text style={styles.totalLabel}>Total budget</Text><Text style={styles.totalValue}>{formatMoney(total)}</Text></View>}>
      <FinanceField label="Planned revenue target" value={revenueTarget} onChangeText={setRevenueTarget} keyboardType="decimal-pad" editable={!closed} placeholder="0.00" />
      {Array.from(grouped.entries()).map(([group, items]) => <View key={group} style={styles.group}><Text style={styles.groupTitle}>{group}</Text><View style={styles.grid}>{items.map((category) => <FinanceField key={category.id} label={category.name} value={amounts[category.id] ?? ""} onChangeText={(value) => setAmounts((current) => ({ ...current, [category.id]: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0.00" />)}</View></View>)}
      <FinanceButton label={savingBudget ? "Saving budget…" : "Save monthly budget"} icon={Save} onPress={() => void saveBudget()} disabled={closed || savingBudget} />
    </FinanceSection>

    <FinanceSection title="Cloudinary usage" description="Record current usage and compare the estimate with the actual monthly cost." action={<View style={styles.cloudIcon}><Cloud size={19} color={adminPalette.brand} /></View>}>
      <View style={styles.grid}><FinanceField label="Storage %" value={usage.storage} onChangeText={(value) => setUsage((current) => ({ ...current, storage: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0–100" /><FinanceField label="Bandwidth %" value={usage.bandwidth} onChangeText={(value) => setUsage((current) => ({ ...current, bandwidth: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0–100" /><FinanceField label="Transformations %" value={usage.transformations} onChangeText={(value) => setUsage((current) => ({ ...current, transformations: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0–100" /></View>
      <View style={styles.grid}><FinanceField label="Estimated cost" value={usage.estimated} onChangeText={(value) => setUsage((current) => ({ ...current, estimated: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0.00" /><FinanceField label="Actual cost" value={usage.actual} onChangeText={(value) => setUsage((current) => ({ ...current, actual: value }))} keyboardType="decimal-pad" editable={!closed} placeholder="0.00" /></View>
      <FinanceField label="Notes" value={usage.notes} onChangeText={(value) => setUsage((current) => ({ ...current, notes: value }))} editable={!closed} multiline placeholder="Usage source, invoice month, or follow-up notes" />
      <FinanceButton label={savingUsage ? "Saving usage…" : "Save Cloudinary usage"} icon={Save} onPress={() => void saveUsage()} disabled={closed || savingUsage} />
    </FinanceSection>
  </View>;
}

const styles = StyleSheet.create({ stack: { gap: 14 }, total: { alignItems: "flex-end" }, totalLabel: { ...typeStyles.caption, color: adminPalette.textSecondary }, totalValue: { ...typeStyles.cardTitle, color: adminPalette.text, marginTop: 2 }, group: { gap: 8 }, groupTitle: { ...typeStyles.label, color: adminPalette.text, paddingTop: 4 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, cloudIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: adminPalette.brandSubtle, alignItems: "center", justifyContent: "center" } });
