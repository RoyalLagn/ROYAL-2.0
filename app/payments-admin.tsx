import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { CircleCheck, CircleX, CreditCard, ReceiptText, RefreshCw, RotateCcw, Search } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { PaginationBar } from "@/components/admin/ui/PaginationBar";
import { SubscriptionAdminService } from "@/subscriptions/services/SubscriptionAdminService";
import { formatSubscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";

const pink = "#E91E63";
export default function PaymentsAdmin() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setPayments(await SubscriptionAdminService.listPayments()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load payments."); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const filtered = useMemo(() => payments.filter((payment) => {
    const matchesStatus = filter === "all" || payment.payment_status === filter;
    const haystack = `${payment.vendors?.business_name || ""} ${payment.razorpay_order_id || ""} ${payment.razorpay_payment_id || ""}`.toLowerCase();
    return matchesStatus && haystack.includes(search.trim().toLowerCase());
  }), [filter, payments, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const total = (statuses: string[]) => payments.filter((payment) => statuses.includes(payment.payment_status)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const stats = [
    { label: "Verified revenue", value: total(["verified"]), count: payments.filter((p) => p.payment_status === "verified").length, icon: CircleCheck, tint: "#11875D" },
    { label: "Failed", value: total(["failed"]), count: payments.filter((p) => p.payment_status === "failed").length, icon: CircleX, tint: "#D33B55" },
    { label: "Refunded", value: total(["refunded","partially_refunded"]), count: payments.filter((p) => ["refunded","partially_refunded"].includes(p.payment_status)).length, icon: RotateCcw, tint: "#B76A00" },
  ];
  return <SafeAreaView style={styles.page} edges={["top","left","right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AdminPageHeader title="Payments" subtitle="Verified Razorpay orders, captures, failures and refunds" action={<Pressable accessibilityLabel="Refresh payments" onPress={() => void load()} style={styles.headerButton}><RefreshCw size={19} color={pink} /></Pressable>} />
    <View style={styles.stats}>{stats.map(({ label, value, count, icon: Icon, tint }) => <View key={label} style={styles.stat}><View style={[styles.statIcon, { backgroundColor: `${tint}15` }]}><Icon size={20} color={tint} /></View><Text style={styles.statValue}>{formatSubscriptionPrice(value)}</Text><Text style={styles.statLabel}>{label} · {count}</Text></View>)}</View>
    <View style={styles.searchBox}><Search size={17} color="#887A81" /><TextInput value={search} onChangeText={(value) => { setSearch(value); setPage(1); }} placeholder="Vendor, order ID or payment ID" style={styles.input} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["all","verified","pending","captured","failed","refunded"].map((item) => <Pressable key={item} onPress={() => { setFilter(item); setPage(1); }} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{subscriptionStatusLabel(item as any)}</Text></Pressable>)}</ScrollView>
    {loading ? <ActivityIndicator color={pink} style={{ marginTop: 35 }} /> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={load}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}
    {!loading && filtered.length === 0 ? <View style={styles.empty}><ReceiptText size={28} color={pink} /><Text style={styles.emptyTitle}>No matching payments</Text><Text style={styles.emptyText}>Transactions will appear after a Vendor starts checkout.</Text></View> : null}
    <View style={styles.list}>{visible.map((payment) => { const successful = payment.payment_status === "verified"; const failed = payment.payment_status === "failed"; return <View key={payment.id} style={styles.payment}><View style={[styles.paymentIcon, { backgroundColor: successful ? "#E8F7F0" : failed ? "#FFF0F2" : "#FFF3D8" }]}>{successful ? <CircleCheck size={19} color="#11875D" /> : failed ? <CircleX size={19} color="#D33B55" /> : <CreditCard size={19} color="#B76A00" />}</View><View style={styles.flex}><Text style={styles.vendor}>{payment.vendors?.business_name || "Vendor"}</Text><Text style={styles.plan}>{payment.subscription_plans?.name || "Subscription plan"} · {subscriptionStatusLabel(payment.payment_status as any)}</Text><Text style={styles.ids} numberOfLines={1}>{payment.razorpay_payment_id || payment.razorpay_order_id || payment.id}</Text>{payment.failure_reason ? <Text style={styles.failure}>{payment.failure_reason}</Text> : null}</View><View style={styles.right}><Text style={styles.amount}>{formatSubscriptionPrice(Number(payment.amount), payment.currency)}</Text><Text style={styles.date}>{new Date(payment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text></View></View>; })}</View>
    {!loading && !error && filtered.length > 20 ? <PaginationBar page={currentPage} pages={pages} onPage={setPage} /> : null}
  </ScrollView><AdminFooter activeTab="payments" /></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: "#FFF9FB" }, header: { height: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#F4E6EC" }, headerButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, logo: { position: "absolute", left: "50%", width: 155, height: 42, marginLeft: -77.5 }, content: { width: "100%", maxWidth: 1100, alignSelf: "center", padding: 18, paddingBottom: 110 }, flex: { flex: 1, minWidth: 0 }, eyebrow: { color: pink, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 }, title: { color: "#1D1720", fontSize: 30, fontWeight: "900", letterSpacing: -.8, marginTop: 3 }, subtitle: { color: "#82747B", fontSize: 11, marginTop: 3 }, stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 }, stat: { flex: 1, minWidth: 170, backgroundColor: "#FFF", borderRadius: 21, padding: 15 }, statIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" }, statValue: { color: "#1D1720", fontSize: 20, fontWeight: "900", marginTop: 10 }, statLabel: { color: "#82747B", fontSize: 9, marginTop: 2 }, searchBox: { minHeight: 49, borderRadius: 16, backgroundColor: "#FFF", paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }, input: { flex: 1, color: "#1D1720", fontSize: 11, outlineStyle: "none" } as any, filters: { gap: 7, paddingVertical: 12 }, filter: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFF0F5" }, filterActive: { backgroundColor: pink }, filterText: { color: "#6D6067", fontSize: 9, fontWeight: "800" }, filterTextActive: { color: "#FFF" }, list: { gap: 9 }, payment: { borderRadius: 19, backgroundColor: "#FFF", padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }, paymentIcon: { width: 43, height: 43, borderRadius: 14, alignItems: "center", justifyContent: "center" }, vendor: { color: "#1D1720", fontSize: 12, fontWeight: "900" }, plan: { color: "#82747B", fontSize: 9, marginTop: 3 }, ids: { color: "#AAA0A5", fontSize: 8, marginTop: 3 }, failure: { color: "#D33B55", fontSize: 8, marginTop: 3 }, right: { alignItems: "flex-end", maxWidth: 150 }, amount: { color: "#1D1720", fontSize: 13, fontWeight: "900" }, date: { color: "#9A8E94", fontSize: 7, textAlign: "right", marginTop: 4 }, empty: { backgroundColor: "#FFF", borderRadius: 22, alignItems: "center", padding: 28 }, emptyTitle: { color: "#1D1720", fontSize: 14, fontWeight: "900", marginTop: 8 }, emptyText: { color: "#82747B", fontSize: 9, marginTop: 3 }, error: { backgroundColor: "#FFF0F2", borderRadius: 16, padding: 14, flexDirection: "row", justifyContent: "space-between" }, errorText: { color: "#D33B55", fontSize: 10 }, retry: { color: pink, fontSize: 10, fontWeight: "900" } });
