import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, ChevronRight, Crown, Gift, ReceiptText } from "lucide-react-native";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { subscriptionAccessSourceLabel, subscriptionDateCopy, subscriptionStateCopy } from "@/subscriptions/presentation";
import { typeScale } from "@/constants/typography";

export default function SubscriptionDashboardCard() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { access, loading, settings, refresh } = useSubscription();
  useFocusEffect(React.useCallback(() => { void refresh(); }, [refresh]));
  const active = Boolean(access?.has_access);
  const launch = access?.status === "launch_offer";
  const state = subscriptionStateCopy(access, settings);
  const date = subscriptionDateCopy(access);
  const title = access?.plan_name || state.title;

  return (
    <LinearGradient
      colors={colorScheme === "dark" ? ["#34222B", "#221C20"] : ["#FFF0F5", "#FFFFFF"]}
      style={[styles.card, { borderColor: colors.border, shadowColor: colors.shadow }]}
    >
      <View style={[styles.icon, { backgroundColor: launch ? "#FFF3D8" : colors.pink }]}>
        {launch ? <Gift size={22} color="#B76A00" /> : <Crown size={22} color="#FFF" />}
      </View>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: active ? colors.success : colors.pink }]}>
          {loading ? "CHECKING ACCESS" : subscriptionAccessSourceLabel(access?.access_source).toUpperCase()}
        </Text>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.metaRow}>
          <CalendarDays size={13} color={colors.muted} />
          <Text style={[styles.meta, { color: colors.muted }]}>{date.label}: {date.value}</Text>
          {access?.days_remaining != null && access.days_remaining > 0 ? <Text style={[styles.days, { color: colors.pink }]}>{access.days_remaining} days left</Text> : null}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.push("/VendorSubscription")}
            style={({ pressed }) => [styles.primary, { backgroundColor: colors.pink }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{state.actionLabel}</Text>
            <ChevronRight size={15} color="#FFF" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/VendorPaymentHistory")}
            style={({ pressed }) => [styles.history, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          >
            <ReceiptText size={16} color={colors.pink} />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 16, marginBottom: 16, flexDirection: "row", gap: 13, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 18, elevation: 2 },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 3 }, metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 7 },
  meta: { fontSize: typeScale.caption }, days: { fontSize: typeScale.caption, fontWeight: "700", marginLeft: 3 }, actions: { flexDirection: "row", gap: 8, marginTop: 11 },
  primary: { flex: 1, minHeight: 40, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  primaryText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" }, history: { width: 42, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
