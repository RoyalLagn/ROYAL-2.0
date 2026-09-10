import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ChevronRight, Crown, Gift, ReceiptText, ShieldCheck, Sparkles } from "lucide-react-native";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { subscriptionAccessSourceLabel, subscriptionDateCopy, subscriptionStateCopy } from "@/subscriptions/presentation";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";
import { MembershipBadge, membershipBadgeFor } from "@/components/vendor/MembershipBadge";

export default function SubscriptionDashboardCard() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const compact = width < 620;
  const { access, loading, settings, refresh } = useSubscription();
  useFocusEffect(React.useCallback(() => { void refresh(); }, [refresh]));
  const active = Boolean(access?.has_access);
  const launch = access?.status === "launch_offer";
  const state = subscriptionStateCopy(access, settings);
  const date = subscriptionDateCopy(access);
  const title = access?.plan_name || state.title;
  const membershipBadge = membershipBadgeFor(access?.plan_name);
  const premium = Boolean(active && membershipBadge);
  const premiumGold = "#F2CC78";
  const premiumMuted = "#D8C9D0";

  return (
    <LinearGradient
      colors={premium
        ? ["#171018", "#321321", "#4A172B"]
        : colorScheme === "dark" ? ["#2B2226", "#211D20"] : ["#FFFFFF", "#FFF9FB"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessibilityLabel={premium ? `${title} RoyalLagn membership` : undefined}
      style={[
        styles.card,
        desktop && styles.cardDesktop,
        premium && styles.premiumCard,
        premium && compact && styles.premiumCardCompact,
        { borderColor: premium ? "#B98A3D" : colors.border, shadowColor: premium ? "#5C1831" : "#7D3D58" },
      ]}
    >
      {premium ? <><View pointerEvents="none" style={styles.premiumOrb} /><View pointerEvents="none" style={styles.premiumRing} /></> : null}
      <View style={[styles.icon, premium && styles.premiumBadgeFrame, premium && compact && styles.premiumBadgeFrameCompact, { backgroundColor: launch ? "#FFF3D8" : membershipBadge ? "transparent" : colors.pink }]}>
        {launch ? <Gift size={22} color="#B76A00" /> : membershipBadge ? (
          <MembershipBadge planName={access?.plan_name} size={premium ? compact ? 62 : 76 : 58} />
        ) : <Crown size={22} color="#FFF" />}
      </View>
      <View style={[styles.content, desktop && styles.contentDesktop]}>
        <View style={styles.copy}>
          <View style={styles.membershipStatusRow}>
            <View style={[styles.membershipStatus, premium && styles.premiumStatus, { backgroundColor: premium ? "rgba(242,204,120,0.12)" : "transparent", borderColor: premium ? "rgba(242,204,120,0.42)" : "transparent" }]}>
              {premium ? <Sparkles size={12} color={premiumGold} /> : null}
              <Text style={[styles.eyebrow, { color: premium ? premiumGold : active ? colors.success : colors.pink }]}>
                {loading ? "CHECKING ACCESS" : premium ? "ROYALLAGN MEMBERSHIP" : subscriptionAccessSourceLabel(access?.access_source).toUpperCase()}
              </Text>
            </View>
            {premium ? <View style={styles.premiumVerified}><ShieldCheck size={13} color={premiumGold} /><Text style={[styles.premiumVerifiedText, { color: premiumGold }]}>PAID PLAN</Text></View> : null}
          </View>
          <Text style={[styles.title, premium && styles.premiumTitle, { color: premium ? "#FFF9FC" : colors.text }]}>{title}</Text>
          {premium ? <View style={styles.accessLine}><Check size={14} color={premiumGold} /><Text style={[styles.accessLineText, { color: premiumMuted }]}>Full vendor access is active</Text></View> : null}
          <View style={styles.metaRow}>
            <CalendarDays size={14} color={premium ? premiumGold : colors.muted} />
            <Text style={[styles.meta, { color: premium ? premiumMuted : colors.muted }]}>{date.label}: {date.value}</Text>
            {access?.days_remaining != null && access.days_remaining > 0 ? <View style={[styles.daysBadge, premium && styles.premiumDaysBadge]}><Text style={[styles.days, { color: premium ? premiumGold : colors.pink }]}>{access.days_remaining} days left</Text></View> : null}
          </View>
        </View>
        <View style={[styles.actions, desktop && styles.actionsDesktop]}>
          <Pressable
            onPress={() => router.push("/VendorSubscription")}
            accessibilityRole="button"
            accessibilityLabel={state.actionLabel}
            style={({ pressed, hovered, focused }) => [
              styles.primary,
              { backgroundColor: premium ? premiumGold : colors.pink, shadowColor: premium ? "#000" : "#ED1762" },
              (hovered || focused) && styles.hoverLift,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryText, premium && styles.premiumPrimaryText]}>{state.actionLabel}</Text>
            <ChevronRight size={15} color={premium ? "#321321" : "#FFF"} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/VendorPaymentHistory")}
            accessibilityRole="button"
            accessibilityLabel="Open payment history"
            style={({ pressed, hovered, focused }) => [
              styles.history,
              { backgroundColor: premium ? "rgba(255,255,255,0.09)" : colors.surface, borderColor: premium ? "rgba(242,204,120,0.28)" : "transparent" },
              (hovered || focused) && styles.hoverLift,
              pressed && styles.pressed,
            ]}
          >
            <ReceiptText size={16} color={premium ? premiumGold : colors.pink} />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { position: "relative", overflow: "hidden", borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 18, flexDirection: "row", gap: 15, shadowColor: "#7D3D58", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  premiumCard: { minHeight: 190, borderWidth: 1.5, paddingVertical: 22, alignItems: "center", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.2, shadowRadius: 28, elevation: 5 },
  premiumCardCompact: { minHeight: 170, padding: 16, gap: 13 },
  cardDesktop: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 20 },
  premiumOrb: { position: "absolute", width: 240, height: 240, borderRadius: 120, right: -88, top: -142, backgroundColor: "rgba(233,30,99,0.13)" },
  premiumRing: { position: "absolute", width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: "rgba(242,204,120,0.13)", left: -72, bottom: -92 },
  icon: { width: 54, height: 54, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  premiumBadgeFrame: { width: 86, height: 96, alignSelf: "center", borderRadius: 22, backgroundColor: "rgba(255,255,255,0.055)", borderWidth: 1, borderColor: "rgba(242,204,120,0.19)" },
  premiumBadgeFrameCompact: { width: 66, height: 74, borderRadius: 18 },
  content: { flex: 1, minWidth: 0 },
  contentDesktop: { flexDirection: "row", alignItems: "center", gap: 20 },
  copy: { flex: 1, minWidth: 0 },
  membershipStatusRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
  membershipStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  premiumStatus: { minHeight: 27, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9 },
  premiumVerified: { flexDirection: "row", alignItems: "center", gap: 4 },
  premiumVerifiedText: { fontSize: 10, lineHeight: 13, fontWeight: "800", letterSpacing: 0.9 },
  eyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.2 },
  title: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 3 },
  premiumTitle: { fontFamily: fonts.serif.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, marginTop: 8 },
  accessLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  accessLineText: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 10 },
  meta: { fontSize: typeScale.caption }, days: { fontSize: typeScale.caption, fontWeight: "700", marginLeft: 3 }, actions: { flexDirection: "row", gap: 8, marginTop: 11 },
  daysBadge: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
  premiumDaysBadge: { backgroundColor: "rgba(242,204,120,0.1)" },
  primary: { flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, shadowColor: "#ED1762", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 2 },
  primaryText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" }, history: { width: 42, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  premiumPrimaryText: { color: "#321321" },
  actionsDesktop: { width: 320, marginTop: 0 },
  hoverLift: { transform: [{ translateY: -2 }], shadowOpacity: 0.18 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
