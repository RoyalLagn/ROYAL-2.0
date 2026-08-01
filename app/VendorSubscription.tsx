import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Crown, ReceiptText, ShieldCheck, Sparkles } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useSubscription } from "@/context/SubscriptionContext";
import { SubscriptionPaymentService } from "@/subscriptions/services/SubscriptionPaymentService";
import { formatSubscriptionPrice, subscriptionDurationLabel, subscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";
import { isPurchasableSubscriptionStatus, isSubscriptionRenewalWindow, subscriptionAccessSourceLabel, subscriptionDateCopy, subscriptionPlanAction, subscriptionStateCopy, visibleSubscriptionPlans } from "@/subscriptions/presentation";

export default function VendorSubscription() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const workspace = useVendorWorkspace();
  const { access, plans, offers, settings, loading, error, refresh } = useSubscription();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const vendor = workspace.data.vendor;
  const unread = workspace.data.notifications.filter((item) => !item.is_read).length;

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    if (!selectedOfferId && offers.length === 1 && offers[0].is_global) setSelectedOfferId(offers[0].id);
  }, [offers, selectedOfferId]);

  const subscribe = async (planId: string) => {
    if (!vendor?.id) return Alert.alert("Vendor account required", "Sign in to your approved Vendor account to subscribe.");
    setSubmittingPlanId(planId);
    try {
      await SubscriptionPaymentService.subscribe({
        vendorId: vendor.id,
        planId,
        offerId: selectedOfferId,
        vendorName: vendor.business_name,
        email: vendor.contact_email,
        phone: vendor.contact_phone,
      });
      await Promise.all([refresh(), workspace.refresh()]);
      Alert.alert("Subscription active", "Your RoyalLagn Vendor access is ready.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Payment could not be completed.";
      Alert.alert(/cancel/i.test(message) ? "Payment cancelled" : "Payment unsuccessful", message);
    } finally {
      setSubmittingPlanId(null);
    }
  };

  const startTrial = async (planId: string) => {
    setSubmittingPlanId(planId);
    try {
      await SubscriptionPaymentService.startTrial(planId);
      await refresh();
      Alert.alert("Trial started", "Your free trial is now active.");
    } catch (caught) {
      Alert.alert("Trial unavailable", caught instanceof Error ? caught.message : "Unable to start this trial.");
    } finally {
      setSubmittingPlanId(null);
    }
  };

  const activePlan = plans.find((plan) => plan.id === access?.plan_id);
  const renewalWindow = isSubscriptionRenewalWindow(access, settings);
  const state = subscriptionStateCopy(access, settings);
  const accessDate = subscriptionDateCopy(access);
  const displayedPlans = visibleSubscriptionPlans(access, plans, settings);
  const canPurchase = isPurchasableSubscriptionStatus(access?.status) && displayedPlans.some((plan) => !subscriptionPlanAction(access, plan, settings).disabled);
  const showAccountNotice = renewalWindow || Boolean(access && !access.has_access);
  const showPlanSelection = isPurchasableSubscriptionStatus(access?.status) && (!access?.has_access || renewalWindow);
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={unread} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.back}><ChevronLeft size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Vendor dashboard</Text></Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Plan & billing</Text>

        <View style={[styles.current, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
          <View style={[styles.currentIcon, { backgroundColor: access?.has_access ? colors.pink : colors.surfaceSoft }]}><Crown size={23} color={access?.has_access ? "#FFF" : colors.pink} /></View>
          <View style={styles.flex}>
            <Text style={[styles.currentLabel, { color: colors.muted }]}>{subscriptionAccessSourceLabel(access?.access_source).toUpperCase()}</Text>
            <Text style={[styles.currentTitle, { color: colors.text }]}>{access?.plan_name || "No active plan"}</Text>
            <Text style={[styles.currentStatus, { color: access?.has_access ? colors.success : colors.warning }]}>{subscriptionStatusLabel(access?.status)}</Text>
          </View>
          {access?.days_remaining != null ? <View style={[styles.daysBadge, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.daysNumber, { color: colors.pink }]}>{access.days_remaining}</Text><Text style={[styles.daysLabel, { color: colors.muted }]}>DAYS</Text></View> : null}
          <View style={styles.dateLine}>
            <CalendarDays size={15} color={colors.muted} />
            <Text style={[styles.dateValue, { color: colors.text }]}>{accessDate.label}: {accessDate.value}</Text>
          </View>
          {showAccountNotice ? <View style={[styles.stateNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.stateMessage, { color: colors.text }]}>{state.message}</Text></View> : null}
          <Pressable onPress={() => router.push("/VendorPaymentHistory")} style={[styles.historyLink, { backgroundColor: colors.surfaceSoft }]}><ReceiptText size={17} color={colors.pink} /><Text style={[styles.historyText, { color: colors.text }]}>Payment history</Text><ChevronRight size={17} color={colors.muted} /></Pressable>
        </View>

        {showPlanSelection ? <>
          <View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Available plans</Text><ShieldCheck size={21} color={colors.success} /></View>
          {loading ? <ActivityIndicator color={colors.pink} style={styles.loader} /> : null}
          {error ? <Text style={[styles.error, { color: colors.warning }]}>{error}</Text> : null}
          {!loading && plans.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Sparkles size={22} color={colors.pink} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No plans available</Text></View> : null}
          {canPurchase && offers.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.offerChips}>{offers.map((offer) => <Pressable key={offer.id} onPress={() => setSelectedOfferId(selectedOfferId === offer.id ? null : offer.id)} style={[styles.offerChip, { backgroundColor: selectedOfferId === offer.id ? colors.pink : colors.surface }]}><Text style={{ color: selectedOfferId === offer.id ? "#FFF" : colors.text, fontWeight: "800", fontSize: 10 }}>{offer.name}</Text></Pressable>)}</ScrollView> : null}
          <View style={styles.plans}>
          {displayedPlans.map((plan) => {
            const price = subscriptionPrice(plan);
            const isCurrent = activePlan?.id === plan.id && access?.has_access;
            const busy = submittingPlanId === plan.id;
            const action = subscriptionPlanAction(access, plan, settings);
            const trialAvailable = !access?.has_access && plan.trial_enabled && settings.subscription_free_trial_enabled === true && !access?.subscription_id;
            return <View key={plan.id} style={[styles.planCard, { backgroundColor: colors.surface, borderColor: isCurrent ? colors.pink : colors.border, shadowColor: colors.shadow }]}>
              <View style={styles.planTop}><View style={styles.flex}><View style={styles.planBadgeRow}>{plan.is_featured ? <Text style={[styles.featured, { color: colors.pink }]}>RECOMMENDED</Text> : null}{isCurrent ? <Text style={[styles.activeBadge, { color: colors.success }]}>CURRENT PLAN</Text> : null}</View><Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text><Text style={[styles.planDescription, { color: colors.muted }]}>{plan.description}</Text></View><Clock3 size={18} color={colors.muted} /></View>
              <View style={styles.priceRow}><Text style={[styles.price, { color: colors.text }]}>{formatSubscriptionPrice(price, plan.currency)}</Text><Text style={[styles.duration, { color: colors.muted }]}> / {subscriptionDurationLabel(plan)}</Text></View>
              {plan.discounted_price != null ? <Text style={[styles.originalPrice, { color: colors.muted }]}>{formatSubscriptionPrice(plan.price, plan.currency)}</Text> : null}
              <View style={styles.features}>{plan.features.filter((feature) => feature.is_enabled).map((feature) => <View key={feature.feature_key} style={styles.feature}><View style={[styles.check, { backgroundColor: colors.surfaceSoft }]}><Check size={13} color={colors.success} /></View><Text style={[styles.featureText, { color: colors.text }]}>{feature.name}{feature.limit_value != null ? ` · ${feature.limit_value}` : ""}</Text></View>)}</View>
              <Pressable disabled={Boolean(submittingPlanId) || action.disabled} onPress={() => subscribe(plan.id)} style={({ pressed }) => [styles.subscribe, { backgroundColor: action.disabled ? colors.surfaceSoft : colors.pink }, pressed && !action.disabled && styles.pressed, (Boolean(submittingPlanId) || action.disabled) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.subscribeText, action.disabled && { color: colors.muted }]}>{action.label}</Text>}</Pressable>
              {trialAvailable ? <Pressable disabled={Boolean(submittingPlanId)} onPress={() => startTrial(plan.id)} style={[styles.trialButton, Boolean(submittingPlanId) && styles.disabled]}><Text style={[styles.trialText, { color: colors.pink }]}>Start {String(plan.trial_days || Number(settings.subscription_free_trial_days || 0))} day free trial</Text></Pressable> : null}
            </View>;
          })}
          </View>
        </> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 900, alignSelf: "center", padding: 16, paddingTop: 18, paddingBottom: 40 }, flex: { flex: 1, minWidth: 0 },
  back: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", minHeight: 40, marginBottom: 8 }, backText: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 31, fontWeight: "900", letterSpacing: -1, marginBottom: 18 },
  current: { borderRadius: 24, padding: 17, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 11, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 2 }, currentIcon: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center" }, currentLabel: { fontSize: 8, letterSpacing: 1.2, fontWeight: "900" }, currentTitle: { fontSize: 18, fontWeight: "900", marginTop: 2 }, currentStatus: { fontSize: 9, fontWeight: "800", marginTop: 4, textTransform: "capitalize" },
  daysBadge: { width: 58, height: 55, borderRadius: 17, alignItems: "center", justifyContent: "center" }, daysNumber: { fontSize: 20, fontWeight: "900" }, daysLabel: { fontSize: 7, fontWeight: "900" }, dateLine: { width: "100%", minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 }, dateValue: { fontSize: 10, fontWeight: "800" },
  historyLink: { width: "100%", minHeight: 45, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 3 }, historyText: { flex: 1, fontSize: 10, fontWeight: "800" },
  stateNotice: { width: "100%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 2 }, stateMessage: { fontSize: 9, lineHeight: 14, fontWeight: "700" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 }, sectionTitle: { fontSize: 18, fontWeight: "900" }, loader: { marginVertical: 25 }, error: { fontSize: 11, marginBottom: 12 }, empty: { alignItems: "center", borderRadius: 22, padding: 24 }, emptyTitle: { fontSize: 14, fontWeight: "900", marginTop: 8 }, emptyText: { fontSize: 10, textAlign: "center", marginTop: 4 },
  offerChips: { gap: 8, paddingBottom: 11 }, offerChip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }, plans: { gap: 12 }, planCard: { borderWidth: 1, borderRadius: 24, padding: 18, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.045, shadowRadius: 18, elevation: 2 }, planTop: { flexDirection: "row", gap: 10 }, planBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 5 }, featured: { fontSize: 8, fontWeight: "900", letterSpacing: 1 }, activeBadge: { fontSize: 8, fontWeight: "900", letterSpacing: 1 }, planName: { fontSize: 19, fontWeight: "900" }, planDescription: { fontSize: 10, lineHeight: 15, marginTop: 4 }, priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 15 }, price: { fontSize: 28, fontWeight: "900", letterSpacing: -0.7 }, duration: { fontSize: 10, fontWeight: "600" }, originalPrice: { fontSize: 10, textDecorationLine: "line-through", marginTop: 1 },
  features: { marginTop: 14, gap: 8 }, feature: { flexDirection: "row", alignItems: "center", gap: 8 }, check: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" }, featureText: { fontSize: 10, fontWeight: "600" }, subscribe: { minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 17 }, subscribeText: { color: "#FFF", fontSize: 12, fontWeight: "900" }, trialButton: { minHeight: 42, alignItems: "center", justifyContent: "center" }, trialText: { fontSize: 10, fontWeight: "800" }, pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 }, disabled: { opacity: 0.6 },
});
