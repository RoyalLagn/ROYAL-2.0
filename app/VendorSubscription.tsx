import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Crown, Gift, Images, LockKeyhole, ReceiptText, Sparkles, Video } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { useSubscription } from "@/context/SubscriptionContext";
import { SubscriptionPaymentService } from "@/subscriptions/services/SubscriptionPaymentService";
import { SubscriptionAccessService } from "@/subscriptions/services/SubscriptionAccessService";
import { formatSubscriptionPrice, subscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";
import { isPurchasableSubscriptionStatus, isSubscriptionRenewalWindow, subscriptionAccessSourceLabel, subscriptionScheduledChangeCopy, subscriptionStateCopy } from "@/subscriptions/presentation";
import type { SubscriptionCheckoutPreview, SubscriptionPayment, SubscriptionPlanBillingOption } from "@/subscriptions/types";
import { isSubscriptionOfferEligible, subscriptionPriceBreakdown } from "@/subscriptions/pricing";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { MembershipBadge, membershipBadgeFor } from "@/components/vendor/MembershipBadge";
import Pressable from "@/components/InteropSafePressable";

const shortDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";


export default function VendorSubscription() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const workspace = useVendorWorkspace();
  const { access, plans, offers, settings, loading, error, refresh } = useSubscription();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">("month");
  const [cancelling, setCancelling] = useState(false);
  const [pricingPreviews, setPricingPreviews] = useState<Record<string, SubscriptionCheckoutPreview>>({});
  const [pricingQuoteError, setPricingQuoteError] = useState<string | null>(null);
  const [latestPayment, setLatestPayment] = useState<SubscriptionPayment | null>(null);
  const vendor = workspace.data.vendor;
  const unread = workspace.data.notifications.filter((item) => !item.is_read).length;

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    let cancelled = false;
    if (!vendor?.id) {
      setLatestPayment(null);
      return () => { cancelled = true; };
    }
    void SubscriptionAccessService.listPayments(vendor.id).then((payments) => {
      if (!cancelled) setLatestPayment(payments.find((payment) => payment.payment_status === "verified") ?? null);
    }).catch(() => { if (!cancelled) setLatestPayment(null); });
    return () => { cancelled = true; };
  }, [vendor?.id, access?.subscription_id]);
  const intervalOffers = useMemo(() => offers.filter((offer) =>
    (!offer.applicable_billing_intervals.length || offer.applicable_billing_intervals.includes(selectedInterval))
    && (!offer.start_date || new Date(offer.start_date) <= new Date())
    && (!offer.end_date || new Date(offer.end_date) > new Date()),
  ), [offers, selectedInterval]);
  useEffect(() => {
    if (!intervalOffers.some((offer) => offer.id === selectedOfferId)) {
      const best = [...intervalOffers].sort((a, b) => Number(b.discount_value) - Number(a.discount_value))[0];
      setSelectedOfferId(best?.id ?? null);
    }
  }, [intervalOffers, selectedOfferId]);

  const billingOptionFor = useCallback((plan: (typeof plans)[number]): SubscriptionPlanBillingOption | null => {
    if (!plan.billing_options.length) return null;
    if (plan.is_permanent) {
      return plan.billing_options.find((option) => option.billing_interval === "month") ?? plan.billing_options[0];
    }
    return plan.billing_options.find((option) => option.billing_interval === selectedInterval) ?? null;
  }, [selectedInterval]);

  const offerForPlan = useCallback((planId: string) => {
    const eligible = intervalOffers.filter((offer) => isSubscriptionOfferEligible(offer, planId, selectedInterval));
    return eligible.find((offer) => offer.id === selectedOfferId)
      ?? [...eligible].sort((a, b) => Number(b.discount_value) - Number(a.discount_value))[0]
      ?? null;
  }, [intervalOffers, selectedInterval, selectedOfferId]);

  useEffect(() => {
    let cancelled = false;
    if (!vendor?.id) {
      setPricingPreviews({});
      setPricingQuoteError(null);
      return () => { cancelled = true; };
    }
    setPricingQuoteError(null);
    // One plan's quote failing (e.g. a "coming_soon" plan the RPC won't
    // quote, or a plan the vendor isn't eligible to buy) must not blank out
    // every other plan's price -- each preview is isolated so a single
    // rejection only leaves that one card's CTA on "Calculating price…".
    void Promise.allSettled(plans.map(async (plan) => {
      // "coming_soon" plans are never purchasable, so the quote RPC always
      // rejects them by design -- don't even ask.
      if (plan.status !== "active") return null;
      const option = billingOptionFor(plan);
      if (!option) return null;
      const offer = offerForPlan(plan.id);
      const preview = await SubscriptionAccessService.previewCheckout(plan.id, option.id, offer?.id ?? null);
      return [`${plan.id}:${option.id}:${offer?.id ?? "none"}`, preview] as const;
    })).then((results) => {
      if (cancelled) return;
      const entries = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
      setPricingPreviews(Object.fromEntries(entries));
      const firstFailure = results.find((result) => result.status === "rejected");
      if (firstFailure?.status === "rejected") {
        const message = firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : typeof firstFailure.reason?.message === "string"
            ? firstFailure.reason.message
            : "Plan pricing could not be loaded.";
        console.warn("[subscription-quote]", message);
        setPricingQuoteError(message);
      }
    });
    return () => { cancelled = true; };
  }, [billingOptionFor, offerForPlan, plans, vendor?.id]);

  const subscribe = async (planId: string, billingOptionId: string | null, offerId: string | null, deferActivation = false, planName?: string) => {
    if (!vendor?.id) return Alert.alert("Vendor account required", "Sign in to your approved Vendor account to subscribe.");
    setSubmittingPlanId(planId);
    try {
      await SubscriptionPaymentService.subscribe({
        vendorId: vendor.id,
        planId,
        billingOptionId,
        offerId,
        vendorName: vendor.business_name,
        email: vendor.contact_email,
        phone: vendor.contact_phone,
        deferActivation,
        quoteId: pricingPreviews[`${planId}:${billingOptionId}:${offerId ?? "none"}`]?.quote_id,
      });
      await Promise.all([refresh(), workspace.refresh()]);
      Alert.alert(
        deferActivation ? "Plan change scheduled" : "Subscription active",
        deferActivation
          ? `Your payment is confirmed. You'll move to ${planName ?? "the selected plan"} when your current billing period ends.`
          : "Your RoyalLagn Vendor access is ready.",
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Payment could not be completed.";
      Alert.alert(/cancel/i.test(message) ? "Payment cancelled" : "Payment unsuccessful", message);
    } finally {
      setSubmittingPlanId(null);
    }
  };

  // Downgrades take effect at the end of the current billing period instead
  // of immediately: schedule_subscription_change records the intent without
  // touching current entitlements. Upgrades (and picking a first plan) go
  // through the immediate checkout flow above.
  const scheduleDowngrade = async (planId: string, billingOptionId: string | null, planName: string) => {
    if (!vendor?.id) return;
    setSubmittingPlanId(planId);
    try {
      await SubscriptionPaymentService.scheduleChange({ vendorId: vendor.id, planId, billingOptionId });
      await refresh();
      Alert.alert("Plan change scheduled", `You'll move to ${planName} at the end of your current billing period. Nothing changes today.`);
    } catch (caught) {
      Alert.alert("Unable to schedule this change", caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setSubmittingPlanId(null);
    }
  };

  const confirmDowngrade = (planId: string, billingOptionId: string | null, planName: string) => {
    Alert.alert(
      "Schedule plan downgrade?",
      `You'll move to ${planName} when your current billing period ends. Your current access stays unchanged until then.`,
      [
        { text: "Keep current plan", style: "cancel" },
        { text: "Schedule downgrade", onPress: () => void scheduleDowngrade(planId, billingOptionId, planName) },
      ],
    );
  };

  const choosePlan = (plan: (typeof plans)[number]) => {
    const billingOption = billingOptionFor(plan);
    if (!billingOption) return Alert.alert("Billing unavailable", `${selectedInterval === "year" ? "Yearly" : "Monthly"} billing is not enabled for ${plan.name}.`);
    const selectedOffer = offerForPlan(plan.id);
    const currentPlan = plans.find((candidate) => candidate.id === access?.plan_id);
    if (access?.has_access && currentPlan && access.plan_id !== plan.id) {
      if (plan.display_order < currentPlan.display_order || plan.price === 0) {
        return confirmDowngrade(plan.id, billingOption.id, plan.name);
      }
      if (access.billing_interval && access.billing_interval !== selectedInterval) {
        return subscribe(plan.id, billingOption.id, selectedOffer?.id ?? null, true, plan.name);
      }
    }
    return subscribe(plan.id, billingOption.id, selectedOffer?.id ?? null);
  };

  const cancelSubscription = () => {
    Alert.alert(
      "Cancel subscription?",
      "You'll keep full access until your current billing period ends, then move to the Free plan. Your Clips and photos are never deleted.",
      [{ text: "Keep plan", style: "cancel" }, {
        text: "Cancel subscription", style: "destructive", onPress: () => void (async () => {
          setCancelling(true);
          try {
            await SubscriptionPaymentService.cancel();
            await refresh();
            Alert.alert("Subscription cancelled", "You keep access until your current period ends.");
          } catch (caught) {
            Alert.alert("Unable to cancel", caught instanceof Error ? caught.message : "Please try again.");
          } finally {
            setCancelling(false);
          }
        })(),
      }],
    );
  };

  const activePlan = plans.find((plan) => plan.id === access?.plan_id);
  const activeMembershipBadge = membershipBadgeFor(access?.plan_name);
  const renewalWindow = isSubscriptionRenewalWindow(access, settings);
  const state = subscriptionStateCopy(access, settings);
  const scheduledChangeMessage = subscriptionScheduledChangeCopy(access);
  const displayedPlans = plans.filter((plan) => plan.status === "active" || plan.status === "coming_soon");
  const availableIntervals = (["month", "year"] as const).filter((interval) =>
    displayedPlans.some((plan) => plan.billing_options.some((option) => option.billing_interval === interval)),
  );
  const cardWidth = width >= 1020 ? "32%" : width >= 680 ? "48.5%" : "100%";
  const canPurchase = isPurchasableSubscriptionStatus(access?.status) && displayedPlans.some((plan) => plan.status === "active");
  const showAccountNotice = renewalWindow || Boolean(access && !access.has_access);
  const canCancel = access?.has_access
    && access.access_source === "paid_subscription"
    && ["active", "past_due", "grace_period"].includes(access.status ?? "");
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader unread={unread} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} style={styles.back}><ChevronLeft size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Vendor dashboard</Text></Pressable>
        <View style={styles.pageHeading}><View style={styles.flex}><Text style={[styles.title, { color: colors.text }]}>Choose your plan</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Compare RoyalLagn visibility, media and business tools. Prices and limits are managed centrally by RoyalLagn Admin.</Text></View></View>

        <View style={[styles.current, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.currentIcon, { backgroundColor: activeMembershipBadge ? "transparent" : access?.has_access ? colors.pink : colors.surfaceSoft }]}>{activeMembershipBadge ? <MembershipBadge planName={access?.plan_name} size={62} /> : <Crown size={23} color={access?.has_access ? "#FFF" : colors.pink} />}</View>
          <View style={styles.flex}>
            <Text style={[styles.currentLabel, { color: colors.muted }]}>CURRENT PLAN · {subscriptionAccessSourceLabel(access?.access_source).toUpperCase()}</Text>
            <Text style={[styles.currentTitle, { color: colors.text }]}>{access?.plan_name || "No active plan"}{access?.billing_interval ? ` · ${access.billing_interval === "year" ? "Yearly" : "Monthly"}` : ""}</Text>
            <Text style={[styles.currentStatus, { color: access?.has_access ? colors.success : colors.warning }]}>{subscriptionStatusLabel(access?.status)}</Text>
          </View>
          {access?.days_remaining != null ? <View style={[styles.daysBadge, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.daysNumber, { color: colors.pink }]}>{access.days_remaining}</Text><Text style={[styles.daysLabel, { color: colors.muted }]}>DAYS</Text></View> : null}
          <View style={styles.dateLine}>
            <CalendarDays size={15} color={colors.muted} />
            <Text style={[styles.dateValue, { color: colors.text }]}>Started {shortDate(access?.start_date)} · Ends {shortDate(access?.expiry_date)}</Text>
          </View>
          {latestPayment && access?.access_source === "paid_subscription" ? <View style={[styles.paymentFacts, { borderTopColor: colors.border }]}><View><Text style={[styles.factLabel, { color: colors.muted }]}>ORIGINAL PRICE</Text><Text style={[styles.factValue, { color: colors.text }]}>{formatSubscriptionPrice(latestPayment.original_amount, latestPayment.currency)}</Text></View><View><Text style={[styles.factLabel, { color: colors.muted }]}>DISCOUNTS</Text><Text style={[styles.factValue, { color: colors.success }]}>−{formatSubscriptionPrice(latestPayment.discount_amount, latestPayment.currency)}</Text></View><View><Text style={[styles.factLabel, { color: colors.muted }]}>TOTAL PAID</Text><Text style={[styles.factValue, { color: colors.pink }]}>{formatSubscriptionPrice(latestPayment.amount, latestPayment.currency)}</Text></View></View> : null}
          {showAccountNotice ? <View style={[styles.stateNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.stateMessage, { color: colors.text }]}>{state.message}</Text></View> : null}
          {scheduledChangeMessage ? <View style={[styles.stateNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.stateMessage, { color: colors.text }]}>{scheduledChangeMessage}</Text></View> : null}
          <View style={[styles.usagePanel, { borderTopColor: colors.border }]}>
            <View style={styles.usageRow}><Video size={16} color={colors.pink} /><Text style={[styles.usageLabel, { color: colors.text }]}>Clips</Text><Text style={[styles.usageValue, { color: colors.text }]}>{access?.clip_active ?? 0} active · {access?.clip_usage ?? 0} total / {access?.clip_limit ?? "—"}</Text></View>
            <View style={styles.usageRow}><Images size={16} color={colors.pink} /><Text style={[styles.usageLabel, { color: colors.text }]}>Photos</Text><Text style={[styles.usageValue, { color: colors.text }]}>{access?.photo_active ?? 0} active · {access?.photo_usage ?? 0} total / {access?.photo_limit ?? "—"}</Text></View>
            {(access?.clip_locked || access?.photo_locked) ? <View style={[styles.lockNotice, { backgroundColor: colors.surfaceSoft }]}><LockKeyhole size={15} color={colors.warning} /><Text style={[styles.lockText, { color: colors.text }]}>{access.clip_locked || 0} Clips and {access.photo_locked || 0} photos are locked by your current plan. Upgrade to unlock more; nothing has been deleted.</Text></View> : null}
          </View>
          <Pressable onPress={() => router.push("/VendorPaymentHistory")} style={[styles.historyLink, { backgroundColor: colors.surfaceSoft }]}><ReceiptText size={17} color={colors.pink} /><Text style={[styles.historyText, { color: colors.text }]}>Payment history</Text><ChevronRight size={17} color={colors.muted} /></Pressable>
          {canCancel ? <Pressable disabled={cancelling} onPress={cancelSubscription} style={[styles.historyLink, { backgroundColor: colors.surfaceSoft }]}>{cancelling ? <ActivityIndicator color={colors.pink} /> : <><Text style={[styles.historyText, { color: colors.warning }]}>Cancel subscription</Text><View style={{ flex: 1 }} /></>}</Pressable> : null}
        </View>

        <View style={[styles.pricingHeader, { backgroundColor: colors.surfaceSoft }]}><View><Text style={[styles.sectionTitle, { color: colors.text }]}>Available plans</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>{displayedPlans.length} tiers · one billing choice for every card</Text></View>{availableIntervals.length > 1 ? <View style={[styles.billingToggle, { backgroundColor: colors.surface }]}>{availableIntervals.map((interval) => { const selected = selectedInterval === interval; return <Pressable key={interval} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedInterval(interval)} style={[styles.billingOption, selected && { backgroundColor: colors.pink }]}><Text style={[styles.billingOptionText, { color: selected ? "#FFF" : colors.muted }]}>{interval === "year" ? "Yearly" : "Monthly"}</Text></Pressable>; })}</View> : null}</View>
        {loading ? <ActivityIndicator color={colors.pink} style={styles.loader} /> : null}
        {error ? <View style={[styles.errorBox, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.error, { color: colors.warning }]}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.retry, { color: colors.pink }]}>Try again</Text></Pressable></View> : null}
        {pricingQuoteError ? <View style={[styles.errorBox, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.error, { color: colors.warning }]}>Pricing unavailable: {pricingQuoteError}</Text><Pressable onPress={() => void refresh()}><Text style={[styles.retry, { color: colors.pink }]}>Retry</Text></Pressable></View> : null}
        {!loading && displayedPlans.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface }]}><Sparkles size={22} color={colors.pink} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No plans available</Text><Text style={[styles.emptyText, { color: colors.muted }]}>RoyalLagn Admin has not published a subscription tier yet.</Text></View> : null}
        {canPurchase && intervalOffers.length ? <View style={styles.offerSection}>{intervalOffers.map((offer) => { const selected = selectedOfferId === offer.id; return <Pressable key={offer.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedOfferId(offer.id)} style={[styles.offerBanner, { backgroundColor: selected ? `${colors.pink}12` : colors.surface, borderColor: selected ? colors.pink : colors.border }]}><View style={[styles.offerIcon, { backgroundColor: `${colors.pink}16` }]}><Gift size={19} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.offerTitle, { color: colors.text }]}>{offer.name}{offer.discount_type === "percentage" ? ` · ${offer.discount_value}% OFF` : ""}</Text><Text style={[styles.offerMessage, { color: colors.muted }]}>{offer.description || "Limited-time subscription saving."}</Text></View><Text style={[styles.offerApply, { color: colors.pink }]}>{selected ? "APPLIED" : "APPLY"}</Text></Pressable>; })}</View> : null}
        <View style={styles.plans}>
          {displayedPlans.map((plan) => {
            const billingOption = billingOptionFor(plan);
            const appliedOffer = billingOption ? offerForPlan(plan.id) : null;
            const localBreakdown = billingOption ? subscriptionPriceBreakdown(billingOption, appliedOffer) : null;
            const previewKey = billingOption ? `${plan.id}:${billingOption.id}:${appliedOffer?.id ?? "none"}` : "";
            const preview = previewKey ? pricingPreviews[previewKey] : null;
            const breakdown = preview ? {
              originalAmount: preview.original_amount,
              intervalDiscountPercentage: preview.interval_discount_percentage,
              intervalDiscountAmount: preview.interval_discount_amount,
              promotionalDiscountPercentage: preview.promotional_discount_percentage,
              promotionalDiscountAmount: preview.promotional_discount_amount,
              currentPlanCredit: preview.current_plan_credit,
              totalSavings: preview.total_savings,
              payableAmount: preview.payable_amount,
            } : localBreakdown ? { ...localBreakdown, currentPlanCredit: 0 } : null;
            const price = breakdown?.payableAmount ?? subscriptionPrice(plan, billingOption);
            const isCurrent = activePlan?.id === plan.id && access?.has_access;
            const busy = submittingPlanId === plan.id;
            const isDowngrade = !isCurrent && Boolean(activePlan) && plan.display_order < (activePlan?.display_order ?? 0);
            const isUpgrade = !isCurrent && Boolean(activePlan) && plan.display_order > (activePlan?.display_order ?? 0);
            const cadenceChange = !isCurrent && access?.has_access && access.billing_interval !== selectedInterval;
            const intervalUnavailable = !plan.is_permanent && plan.billing_options.length > 0 && !plan.billing_options.some((option) => option.billing_interval === selectedInterval);
            const accountBlocked = access?.status === "suspended" || access?.status === "deactivated";
            // "coming_soon" plans are never quotable (resolve_subscription_checkout
            // only resolves status = 'active'), so a preview request for one
            // always rejects by design -- check this before the "no preview
            // yet" branch below, or the card is stuck on "Calculating
            // price…" forever instead of showing "Coming Soon".
            const needsCheckout = !isCurrent && !isDowngrade && plan.status === "active";
            const buttonDisabled = Boolean(submittingPlanId) || isCurrent || plan.status === "coming_soon" || accountBlocked || intervalUnavailable || (needsCheckout && !preview);
            const cta = plan.status === "coming_soon"
              ? "Coming Soon"
              : needsCheckout && !preview
              ? "Calculating price…"
              : intervalUnavailable
              ? "Unavailable"
              : isCurrent
                ? "CURRENT PLAN"
                : plan.price === 0 && isDowngrade
                  ? "MOVE TO FREE AT RENEWAL"
                  : isDowngrade
                    ? "DOWNGRADE AT RENEWAL"
                    : cadenceChange
                      ? "SWITCH BILLING AT RENEWAL"
                      : isUpgrade
                        ? `UPGRADE TO ${plan.name.toUpperCase()}`
                        : `BUY ${plan.name.toUpperCase()}`;
            const badge = isCurrent
              ? { label: "CURRENT", tone: "success" as const }
              : plan.status === "coming_soon"
                ? { label: "COMING SOON", tone: "muted" as const }
                : plan.is_featured
                  ? { label: "POPULAR", tone: "pink" as const }
                  : null;
            const hasSavings = Boolean(breakdown && breakdown.totalSavings > 0.005);
            const billingSuffix = selectedInterval === "year" ? "year" : "month";
            return <View key={plan.id} style={[styles.planCard, { width: cardWidth, backgroundColor: colors.surface, borderColor: isCurrent ? colors.pink : plan.is_featured ? colors.pink : colors.border, borderWidth: isCurrent || plan.is_featured ? 2 : 1 }]}>
              {/* Name + status badge */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.planIdentity}>
                  <MembershipBadge planName={plan.name} size={72} />
                  <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                </View>
                {badge ? <View style={[styles.statusPill, { backgroundColor: badge.tone === "success" ? `${colors.success}1A` : badge.tone === "pink" ? `${colors.pink}1A` : colors.surfaceSoft }]}><View style={[styles.statusDot, { backgroundColor: badge.tone === "success" ? colors.success : badge.tone === "pink" ? colors.pink : colors.muted }]} /><Text style={[styles.badgeText, { color: badge.tone === "success" ? colors.success : badge.tone === "pink" ? colors.pink : colors.muted }]}>{badge.label}</Text></View> : null}
              </View>

              {/* Large price + billing text */}
              <View style={styles.priceBlock}>
                <View style={styles.priceRow}><Text style={[styles.price, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatSubscriptionPrice(price, plan.currency)}</Text></View>
                <Text style={[styles.duration, { color: colors.muted }]}>{plan.price === 0 ? "forever free" : `per ${billingSuffix}${selectedInterval === "year" ? ", billed annually" : ""}`}</Text>
              </View>

              {/* Original price + discount summary */}
              {hasSavings && breakdown ? <View style={[styles.discountBlock, { backgroundColor: colors.surfaceSoft }]}>
                <Text style={[styles.originalPrice, { color: colors.muted }]}>{formatSubscriptionPrice(breakdown.originalAmount, plan.currency)}</Text>
                {breakdown.intervalDiscountAmount > 0 ? <Text style={[styles.discountLine, { color: colors.success }]}>Yearly discount {breakdown.intervalDiscountPercentage}%: −{formatSubscriptionPrice(breakdown.intervalDiscountAmount, plan.currency)}</Text> : null}
                {breakdown.promotionalDiscountAmount > 0 ? <Text style={[styles.discountLine, { color: colors.success }]}>{appliedOffer?.name ?? "Promotional offer"}{breakdown.promotionalDiscountPercentage ? ` ${breakdown.promotionalDiscountPercentage}%` : ""}: −{formatSubscriptionPrice(breakdown.promotionalDiscountAmount, plan.currency)}</Text> : null}
                {breakdown.currentPlanCredit > 0 ? <Text style={[styles.discountLine, { color: colors.success }]}>Unused {activePlan?.name} credit: −{formatSubscriptionPrice(breakdown.currentPlanCredit, plan.currency)}</Text> : null}
                <Text style={[styles.finalLine, { color: colors.text }]}>Final payable: {formatSubscriptionPrice(price, plan.currency)} / {billingSuffix}</Text>
              </View> : null}

              {/* Description */}
              <Text style={[styles.planDescription, { color: colors.muted }]}>{plan.description}</Text>

              <View style={[styles.divider, { borderTopColor: colors.border }]} />

              {/* Feature checklist — flex:1 pushes the CTA to the card bottom */}
              <View style={styles.features}>{plan.features.filter((feature) => feature.is_enabled).map((feature) => <View key={feature.feature_key} style={styles.feature}><View style={[styles.featureIcon, { backgroundColor: `${colors.success}18` }]}><Check size={13} color={colors.success} /></View><Text style={[styles.featureText, { color: colors.text }]}>{feature.name}{feature.limit_value != null ? ` · ${feature.limit_value}` : ""}</Text></View>)}</View>

              {preview?.is_prorated_upgrade ? <View style={[styles.prorationNote, { borderColor: colors.border }]}><Text style={[styles.prorationTitle, { color: colors.text }]}>Pay only for remaining days</Text><Text style={[styles.prorationText, { color: colors.muted }]}>Your current plan credit is applied automatically. Your end date stays {shortDate(preview.proration_period_end)}—no extra days are added.</Text></View> : null}
              {intervalUnavailable ? <Text style={[styles.intervalUnavailable, { color: colors.warning }]}>{selectedInterval === "year" ? "Annual" : "Monthly"} billing is not available for this tier.</Text> : null}

              {/* Full-width CTA, pinned near the card bottom */}
              <Pressable disabled={buttonDisabled} onPress={() => choosePlan(plan)} style={({ pressed }) => [styles.subscribe, isCurrent ? { borderColor: colors.pink, backgroundColor: colors.surface } : { backgroundColor: buttonDisabled ? colors.surfaceSoft : colors.pink }, pressed && !buttonDisabled && styles.pressed, buttonDisabled && styles.disabled]}>{busy ? <ActivityIndicator color={isCurrent ? colors.pink : "#FFF"} /> : <Text style={[styles.subscribeText, isCurrent ? { color: colors.pink } : buttonDisabled && { color: colors.muted }]}>{cta}</Text>}</Pressable>
            </View>;
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 1180, alignSelf: "center", padding: 16, paddingTop: 18, paddingBottom: 52 }, flex: { flex: 1, minWidth: 0 },
  back: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", minHeight: 44, marginBottom: 8 }, backText: { fontSize: typeScale.metadata, fontWeight: "700" },
  pageHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 16, marginBottom: 20 }, title: { ...typeStyles.pageTitle }, subtitle: { ...typeStyles.bodyCompact, maxWidth: 680, marginTop: 5 },
  billingToggle: { borderRadius: 999, padding: 4, flexDirection: "row", alignItems: "center" }, billingOption: { minWidth: 92, minHeight: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, billingOptionText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  current: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 11 }, currentIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" }, currentLabel: { fontSize: typeScale.caption, letterSpacing: 0.8, fontWeight: "700" }, currentTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700", marginTop: 2 }, currentStatus: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 4, textTransform: "capitalize" },
  daysBadge: { width: 58, height: 55, borderRadius: 17, alignItems: "center", justifyContent: "center" }, daysNumber: { fontSize: typeScale.sectionTitle, fontWeight: "700" }, daysLabel: { fontSize: typeScale.caption, fontWeight: "700" }, dateLine: { width: "100%", minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 3 }, dateValue: { fontSize: typeScale.caption, fontWeight: "700" },
  paymentFacts: { width: "100%", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, flexDirection: "row", flexWrap: "wrap", gap: 22 }, factLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 0.5 }, factValue: { fontSize: typeScale.bodyCompact, fontWeight: "700", marginTop: 3 },
  historyLink: { width: "100%", minHeight: 45, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 3 }, historyText: { flex: 1, fontSize: typeScale.caption, fontWeight: "700" },
  stateNotice: { width: "100%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 2 }, stateMessage: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700" },
  usagePanel: { width: "100%", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 3, gap: 8 }, usageRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 8 }, usageLabel: { width: 52, fontSize: typeScale.caption, fontWeight: "700" }, usageValue: { flex: 1, textAlign: "right", fontSize: typeScale.caption, fontWeight: "600" }, lockNotice: { borderRadius: 12, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }, lockText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600" },
  pricingHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 28, marginBottom: 14, borderRadius: 18, padding: 12 }, sectionTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" }, sectionMeta: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 2 }, loader: { marginVertical: 25 }, errorBox: { borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }, error: { flex: 1, fontSize: typeScale.metadata }, retry: { fontSize: typeScale.caption, fontWeight: "700" }, empty: { alignItems: "center", borderRadius: 16, padding: 24 }, emptyTitle: { fontSize: typeScale.body, fontWeight: "700", marginTop: 8 }, emptyText: { fontSize: typeScale.caption, textAlign: "center", marginTop: 4 },
  offerSection: { gap: 8, marginBottom: 14 }, offerBanner: { minHeight: 68, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, offerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, offerTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" }, offerMessage: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 2 }, offerApply: { fontSize: typeScale.caption, fontWeight: "700" }, plans: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: 18 },
  // Tall, premium pricing card: generous rounding/padding, name+badge up
  // top, features given flex:1 so the CTA always sits near the card's
  // bottom edge regardless of how much content is above it.
  planCard: { minWidth: 0, minHeight: 560, borderRadius: 32, padding: 26, overflow: "hidden", flexDirection: "column" },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  planIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 },
  statusPill: { minHeight: 26, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 }, statusDot: { width: 6, height: 6, borderRadius: 3 }, badgeText: { ...typeStyles.caption, fontWeight: "800", letterSpacing: 0.6 },
  planName: { ...typeStyles.editorialCardTitle, flexShrink: 1 },
  priceBlock: { marginTop: 22 }, priceRow: { flexDirection: "row", alignItems: "baseline" }, price: { fontSize: 44, lineHeight: 50, fontWeight: "800", letterSpacing: -0.5 }, duration: { ...typeStyles.bodyCompact, marginTop: 4, fontWeight: "600" },
  discountBlock: { marginTop: 12, gap: 5, borderRadius: 12, padding: 10 }, originalPrice: { ...typeStyles.bodyCompact, textDecorationLine: "line-through" }, discountLine: { ...typeStyles.caption, fontWeight: "700" }, finalLine: { ...typeStyles.bodyCompact, fontWeight: "800", marginTop: 3 },
  planDescription: { ...typeStyles.bodyCompact, marginTop: 16, lineHeight: typeLeading.bodyCompact },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20, marginBottom: 18, borderStyle: "dashed" },
  prorationNote: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 14 }, prorationTitle: { fontSize: typeScale.caption, fontWeight: "700" }, prorationText: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
  features: { flex: 1, marginTop: 16, gap: 9 }, feature: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 9 }, featureIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" }, featureText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600" }, intervalUnavailable: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 12, fontWeight: "600" }, subscribe: { minHeight: 50, borderRadius: 999, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 12 }, subscribeText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700", textAlign: "center" }, pressed: { transform: [{ scale: 0.985 }], opacity: 0.9 }, disabled: { opacity: 0.58 },
});
