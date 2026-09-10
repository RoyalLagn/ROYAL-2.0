import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CalendarDays, Check, ChevronLeft, Clock3, MapPin, ShieldCheck, Sparkles } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { buyFeaturedPlacement } from "@/services/featuredPlacementPayment";
import { FEATURED_PLACEMENT_CAPACITY, FEATURED_PLACEMENT_PRICE, getFeaturedInventory, getMyFeaturedPlacements, subscribeToFeaturedPlacements, type FeaturedInventory, type FeaturedPlacement } from "@/services/featuredVendorPlacements";
import { typeScale, typeLeading } from "@/constants/typography";

const dateLabel = (value?: string | null) => value
  ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";

const remainingDaysCount = (value?: string | null) => value
  ? Math.max(0, Math.min(30, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)))
  : null;

const remainingDaysLabel = (value?: string | null) => {
  const remainingDays = remainingDaysCount(value);
  return remainingDays === null ? "30-day placement" : `${remainingDays} of 30 days remaining`;
};

export default function VendorFeaturedPlacement() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const workspace = useVendorWorkspace();
  const vendor = workspace.data.vendor;
  const pincode = /^[1-9][0-9]{5}$/.test(vendor?.pincode ?? "") ? vendor.pincode : "";
  const [inventory, setInventory] = useState<FeaturedInventory | null>(null);
  const [placements, setPlacements] = useState<FeaturedPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vendor?.id || !pincode) { setLoading(false); return; }
    setError(null);
    try {
      const [nextInventory, nextPlacements] = await Promise.all([getFeaturedInventory(pincode, vendor.id), getMyFeaturedPlacements()]);
      setInventory(nextInventory);
      setPlacements(nextPlacements);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Featured placement could not be loaded.");
    } finally { setLoading(false); }
  }, [pincode, vendor?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToFeaturedPlacements(() => void load()), [load]);
  const active = useMemo(() => placements.find((item) => item.pincode === pincode && item.status === "active" && new Date(item.ends_at ?? 0) > new Date()), [pincode, placements]);
  const orderedSlots = useMemo(() => {
    const slots = inventory?.slots ?? [];
    const isOwnSlot = (slot: FeaturedInventory["slots"][number]) => slot.status === "mine" || slot.slotNumber === active?.slot_number;
    return [...slots].sort((left, right) => Number(isOwnSlot(right)) - Number(isOwnSlot(left)));
  }, [active, inventory?.slots]);
  const activeDaysRemaining = remainingDaysCount(active?.ends_at);
  const remaining = inventory?.remaining ?? 0;
  const slotCardBasis: "18.6%" | "31.5%" | "48%" = width >= 900 ? "18.6%" : width >= 620 ? "31.5%" : "48%";

  const purchase = async () => {
    if (!vendor?.id || !pincode || active || remaining < 1) return;
    setPaying(true);
    try {
      await buyFeaturedPlacement({ pincode, vendorName: vendor.business_name, email: vendor.contact_email, phone: vendor.contact_phone });
      await load();
      Alert.alert("You’re featured", `Your business is now promoted to customers in ${pincode} for 30 days.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Payment could not be completed.";
      Alert.alert(/cancel/i.test(message) ? "Payment cancelled" : "Payment unsuccessful", message);
      await load();
    } finally { setPaying(false); }
  };

  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <ChevronLeft size={18} color={colors.text} /><Text style={[styles.backText, { color: colors.text }]}>Vendor dashboard</Text>
      </Pressable>

      <View style={[styles.hero, desktop && styles.heroDesktop, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: colors.pink }]}><Sparkles size={26} color="#FFF" /></View>
        <View style={styles.heroCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Be the first choice nearby</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Appear in Featured near you for customers browsing your PIN code. Only 10 businesses can be featured in each area at a time.</Text>
        </View>
        <View style={styles.priceBlock}><Text style={[styles.price, { color: colors.text }]}>₹{FEATURED_PLACEMENT_PRICE}</Text><Text style={[styles.priceSuffix, { color: colors.muted }]}>for 30 days</Text></View>
      </View>

      {!pincode ? <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MapPin size={22} color={colors.pink} /><View style={styles.flex}><Text style={[styles.noticeTitle, { color: colors.text }]}>Add your business PIN code</Text><Text style={[styles.noticeText, { color: colors.muted }]}>Your verified business location decides where customers see your promotion.</Text></View>
        <Pressable onPress={() => router.push("/VendorEditLocation")} style={({ pressed }) => [styles.smallButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressed]}><Text style={[styles.smallButtonText, { color: colors.pink }]}>Add location</Text></Pressable>
      </View> : null}

      {pincode ? <View style={styles.inventory}>
        <View style={[styles.areaPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.areaTop}><View style={[styles.pinIcon, { backgroundColor: colors.surfaceSoft }]}><MapPin size={20} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.areaLabel, { color: colors.muted }]}>YOUR FEATURED AREA</Text><Text style={[styles.areaValue, { color: colors.text }]}>PIN {pincode}</Text></View></View>
        </View>

        {active ? <View accessibilityRole="summary" style={[styles.activeOverview, { backgroundColor: `${colors.success}0D`, borderColor: `${colors.success}66` }]}>
          <View style={styles.activeOverviewTop}>
            <View style={[styles.activeOverviewIcon, { backgroundColor: colors.success }]}><Sparkles size={22} color="#FFF" /></View>
            <View style={styles.flex}><Text style={[styles.activeOverviewTitle, { color: colors.text }]}>Your featured placement</Text><Text style={[styles.activeOverviewCopy, { color: colors.muted }]}>Your business is being promoted first to customers browsing PIN {pincode}.</Text></View>
            <View style={[styles.activeLiveBadge, { backgroundColor: `${colors.success}18` }]}><View style={[styles.liveDot, { backgroundColor: colors.success }]} /><Text style={[styles.activeLiveText, { color: colors.success }]}>Active now</Text></View>
          </View>
          <View style={[styles.activeStats, { borderTopColor: `${colors.success}2E` }]}>
            <View style={styles.activeStat}><Text style={[styles.activeStatLabel, { color: colors.muted }]}>Started</Text><Text style={[styles.activeStatValue, { color: colors.text }]}>{dateLabel(active.starts_at)}</Text></View>
            <View style={[styles.activeStat, styles.activeStatDivider, { borderLeftColor: `${colors.success}2E` }]}><Text style={[styles.activeStatLabel, { color: colors.muted }]}>Ends</Text><Text style={[styles.activeStatValue, { color: colors.text }]}>{dateLabel(active.ends_at)}</Text></View>
            <View style={[styles.activeStat, styles.activeStatDivider, { borderLeftColor: `${colors.success}2E` }]}><Text style={[styles.activeStatLabel, { color: colors.muted }]}>Time left</Text><Text style={[styles.activeDaysValue, { color: colors.success }]}>{activeDaysRemaining ?? "—"}</Text><Text style={[styles.activeDaysUnit, { color: colors.muted }]}>days remaining</Text></View>
          </View>
          {activeDaysRemaining !== null ? <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 30, now: activeDaysRemaining }} style={[styles.activeProgressTrack, { backgroundColor: `${colors.success}1F` }]}><View style={[styles.activeProgressFill, { backgroundColor: colors.success, width: `${activeDaysRemaining / 30 * 100}%` }]} /></View> : null}
        </View> : null}

        <View style={[styles.slotsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.slotHeader}>
            <View style={styles.flex}><Text style={[styles.slotTitle, { color: colors.text }]}>10 slots availability</Text><Text style={[styles.slotDescription, { color: colors.muted }]}>See which featured placements are open and when booked spots become available.</Text></View>
            <View style={[styles.bookedBadge, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.bookedBadgeText, { color: colors.pink }]}>{inventory?.occupied ?? 0}/{FEATURED_PLACEMENT_CAPACITY} booked</Text></View>
          </View>
          {loading ? <ActivityIndicator color={colors.pink} style={styles.loader} /> : <View style={styles.slotGrid}>
            {orderedSlots.map((slot) => {
              const isAvailable = slot.status === "available";
              const isMine = slot.status === "mine" || active?.slot_number === slot.slotNumber;
              const availableAt = isMine ? active?.ends_at ?? slot.availableAt : slot.availableAt;
              const accent = isMine ? colors.warning : isAvailable ? colors.success : colors.pink;
              const label = isAvailable ? "Available" : isMine ? "Your placement" : "Booked";
              const detail = isAvailable ? "Available now" : availableAt ? `${isMine ? "Active until" : "Available"} ${dateLabel(availableAt)}` : "Availability updating";
              const countdown = isAvailable ? null : remainingDaysLabel(availableAt);
              return <View key={slot.slotNumber} testID="featured-slot-card" accessibilityLabel={`${label}. ${detail}.${countdown ? ` ${countdown}.` : ""}`} style={[styles.slotCard, { width: slotCardBasis, borderColor: accent, backgroundColor: `${accent}09` }]}>
                <View style={[styles.slotStatus, { backgroundColor: accent }]}>{isAvailable ? <Check size={14} color="#FFF" /> : <Clock3 size={14} color="#FFF" />}<Text style={styles.slotStatusText}>{label}</Text></View>
                <View><View style={styles.slotDateRow}><CalendarDays size={17} color={accent} /><Text style={[styles.slotDate, { color: colors.text }]}>{detail}</Text></View>{countdown ? <Text style={[styles.slotCountdown, { color: accent }]}>{countdown}</Text> : null}</View>
              </View>;
            })}
          </View>}
          {!loading && remaining === 0 && inventory?.nextAvailableAt ? <View style={[styles.nextRow, { backgroundColor: `${colors.warning}12` }]}><Clock3 size={15} color={colors.warning} /><Text style={[styles.nextText, { color: colors.warning }]}>Next opening expected {dateLabel(inventory.nextAvailableAt)}</Text></View> : null}
        </View>

        {!active ? <View style={[styles.checkoutPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <>
            <Text style={[styles.checkoutTitle, { color: colors.text }]}>Reserve your area</Text>
            {["Featured placement for customers in your PIN code", "Fair daily rotation among active featured vendors", "One clear payment—no change to your main subscription"].map((copy) => <View key={copy} style={styles.benefit}><Check size={16} color={colors.success} /><Text style={[styles.benefitText, { color: colors.text }]}>{copy}</Text></View>)}
            <View style={[styles.secureRow, { borderTopColor: colors.border }]}><ShieldCheck size={16} color={colors.muted} /><Text style={[styles.secureText, { color: colors.muted }]}>Secure checkout powered by Razorpay</Text></View>
            <Pressable disabled={loading || paying || remaining < 1 || Boolean(error)} accessibilityRole="button" accessibilityLabel={`Pay ₹${FEATURED_PLACEMENT_PRICE} and feature my business in ${pincode}`} onPress={() => void purchase()}
              style={({ pressed, hovered, focused }) => [styles.payButton, { backgroundColor: colors.pink }, (hovered || focused) && styles.lift, pressed && styles.pressed, (loading || paying || remaining < 1 || Boolean(error)) && styles.disabled]}>
              {paying ? <ActivityIndicator color="#FFF" /> : <Sparkles size={18} color="#FFF" />}<Text style={styles.payText}>{paying ? "Opening secure checkout…" : remaining < 1 ? "All spots booked" : `Pay ₹${FEATURED_PLACEMENT_PRICE} & get featured`}</Text>
            </Pressable>
          </>
        </View> : null}
      </View> : null}

      {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: `${colors.destructive}12` }]}><Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text><Pressable onPress={() => void load()}><Text style={[styles.retry, { color: colors.pink }]}>Try again</Text></Pressable></View> : null}
      <Text style={[styles.terms, { color: colors.muted }]}>Placement begins after verified payment and runs for 30 days. Your business must remain active, verified, public, and available in this PIN code.</Text>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 1080, alignSelf: "center", padding: 16, paddingTop: 18, paddingBottom: 40 },
  back: { minHeight: 44, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 14 }, backText: { fontSize: typeScale.caption, fontWeight: "700" },
  hero: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16, marginBottom: 16 }, heroDesktop: { minHeight: 170, flexDirection: "row", alignItems: "center", padding: 28 },
  heroIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: typeScale.metric, lineHeight: typeLeading.metric, fontWeight: "700", letterSpacing: -0.5 }, subtitle: { fontSize: typeScale.body, lineHeight: 24, marginTop: 8, maxWidth: 630 },
  priceBlock: { minWidth: 128 }, price: { fontSize: 34, lineHeight: 40, fontWeight: "800", fontVariant: ["tabular-nums"] }, priceSuffix: { fontSize: typeScale.caption, marginTop: 2 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, noticeTitle: { fontSize: typeScale.body, fontWeight: "700" }, noticeText: { fontSize: typeScale.caption, marginTop: 4 },
  inventory: { gap: 16 }, areaPanel: { borderWidth: 1, borderRadius: 16, padding: 20 }, slotsPanel: { borderWidth: 1, borderRadius: 16, padding: 20 }, checkoutPanel: { borderWidth: 1, borderRadius: 16, padding: 20 },
  areaTop: { flexDirection: "row", alignItems: "center", gap: 12 }, pinIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 },
  areaLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 0.8 }, areaValue: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 3 }, loader: { marginVertical: 28 },
  activeOverview: { borderWidth: 1, borderRadius: 16, padding: 20 }, activeOverviewTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, activeOverviewIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }, activeOverviewTitle: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700" }, activeOverviewCopy: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 3, maxWidth: 600 },
  activeLiveBadge: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, activeLiveText: { fontSize: typeScale.caption, fontWeight: "700" },
  activeStats: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", marginTop: 18, paddingTop: 16 }, activeStat: { flex: 1, minWidth: 0, paddingHorizontal: 12 }, activeStatDivider: { borderLeftWidth: StyleSheet.hairlineWidth }, activeStatLabel: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600", marginBottom: 5 }, activeStatValue: { fontSize: typeScale.body, lineHeight: typeLeading.body, fontWeight: "700", fontVariant: ["tabular-nums"] }, activeDaysValue: { fontSize: typeScale.metric, lineHeight: typeLeading.metric, fontWeight: "800", fontVariant: ["tabular-nums"] }, activeDaysUnit: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: -1 },
  activeProgressTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 16 }, activeProgressFill: { height: "100%", borderRadius: 3 },
  slotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }, slotTitle: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700" }, slotDescription: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 3, maxWidth: 620 },
  bookedBadge: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, bookedBadgeText: { fontSize: typeScale.caption, fontWeight: "700", fontVariant: ["tabular-nums"] },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 }, slotCard: { minHeight: 118, minWidth: 142, flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 14, justifyContent: "space-between", gap: 18 },
  slotStatus: { alignSelf: "flex-start", minHeight: 30, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 }, slotStatusText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  slotDateRow: { flexDirection: "row", alignItems: "center", gap: 7 }, slotDate: { flex: 1, fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, fontWeight: "600" },
  slotCountdown: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700", marginTop: 7, marginLeft: 24, fontVariant: ["tabular-nums"] },
  nextRow: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", gap: 7, alignItems: "center", marginTop: 14 }, nextText: { fontSize: typeScale.caption, fontWeight: "600" },
  checkoutTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginBottom: 15 }, benefit: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 11 }, benefitText: { flex: 1, fontSize: typeScale.caption, lineHeight: 19 },
  secureRow: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 14, marginTop: 5 }, secureText: { fontSize: typeScale.caption },
  payButton: { minHeight: 52, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, shadowColor: "#7D3D58", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 3 }, payText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  error: { borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }, errorText: { flex: 1, fontSize: typeScale.caption }, retry: { fontSize: typeScale.caption, fontWeight: "700" }, terms: { fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", marginTop: 18, paddingHorizontal: 12 },
  smallButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, smallButtonText: { fontSize: typeScale.caption, fontWeight: "700" },
  lift: { transform: [{ translateY: -1 }], shadowOpacity: 0.2 }, pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 }, disabled: { opacity: 0.45 },
});
