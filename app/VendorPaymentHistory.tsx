import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, CreditCard, ReceiptText } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { SubscriptionAccessService } from "@/subscriptions/services/SubscriptionAccessService";
import type { SubscriptionPayment } from "@/subscriptions/types";
import { formatSubscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";
import { typeStyles } from "@/constants/typography";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";

export default function VendorPaymentHistory() {
  const router = useRouter();
  const workspace = useVendorWorkspace();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspace.data.vendor?.id) return;
    setLoading(true); setError(null);
    try { setPayments(await SubscriptionAccessService.listPayments(workspace.data.vendor.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load payment history."); }
    finally { setLoading(false); }
  }, [workspace.data.vendor?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <View style={[styles.page, { backgroundColor: colors.background }]}><VendorHeader unread={workspace.data.notifications.filter((item) => !item.is_read).length} /><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} style={styles.back}><ChevronLeft size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Subscription</Text></Pressable>
    <Text style={[styles.eyebrow, { color: colors.pink }]}>BILLING</Text><Text style={[styles.title, { color: colors.text }]}>Payment history</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Server-verified Razorpay transactions for your Vendor account.</Text>
    {loading ? <ActivityIndicator color={colors.pink} style={{ marginTop: 30 }} /> : null}{error ? <Text style={{ color: colors.warning }}>{error}</Text> : null}
    {!loading && !payments.length ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><ReceiptText size={28} color={colors.pink} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No payments yet</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Completed and failed subscription payments will appear here.</Text></View> : null}
    <View style={styles.list}>{payments.map((payment) => <View key={payment.id} style={[styles.row, { backgroundColor: colors.surface }]}><View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}><CreditCard size={18} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.plan, { color: colors.text }]}>{payment.subscription_plans?.name || "Subscription payment"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{new Date(payment.created_at).toLocaleDateString("en-IN")} · {subscriptionStatusLabel(payment.payment_status as any)}</Text>{payment.failure_reason ? <Text style={[styles.failure, { color: colors.warning }]}>{payment.failure_reason}</Text> : null}</View><Text style={[styles.amount, { color: colors.text }]}>{formatSubscriptionPrice(payment.amount, payment.currency)}</Text></View>)}</View>
  </ScrollView></View>;
}
const styles = StyleSheet.create({ page: { flex: 1 }, content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 16, paddingBottom: 36 }, back: { flexDirection: "row", alignItems: "center", minHeight: 42, gap: 4 }, backText: { ...typeStyles.button }, eyebrow: { ...typeStyles.caption, letterSpacing: 1.1, marginTop: 8 }, title: { ...typeStyles.pageTitle, marginTop: 4 }, subtitle: { ...typeStyles.metadata, marginTop: 4, marginBottom: 18 }, empty: { padding: 28, borderRadius: 22, alignItems: "center" }, emptyTitle: { ...typeStyles.cardTitle, marginTop: 9 }, emptyText: { ...typeStyles.caption, textAlign: "center", marginTop: 4 }, list: { gap: 9 }, row: { borderRadius: 19, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 }, plan: { ...typeStyles.label }, meta: { ...typeStyles.caption, marginTop: 3 }, failure: { ...typeStyles.caption, marginTop: 3 }, amount: { ...typeStyles.label } });
