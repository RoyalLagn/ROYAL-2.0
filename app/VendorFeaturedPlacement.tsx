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
      const [nextInventory, nextPlacements] = await Promise.all([getFeaturedInventory(pincode), getMyFeaturedPlacements(vendor.id)]);
      setInventory(nextInventory);
      setPlacements(nextPlacements);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Featured placement could not be loaded.");
    } finally { setLoading(false); }
  }, [pincode, vendor?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToFeaturedPlacements(() => void load()), [load]);
  const active = useMemo(() => placements.find((item) => item.pincode === pincode && item.status === "active" && new Date(item.ends_at ?? 0) > new Date()), [pincode, placements]);
  const remaining = inventory?.remaining ?? 0;

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

      {pincode ? <View style={[styles.inventory, desktop && styles.inventoryDesktop]}>
        <View style={[styles.areaPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.areaTop}><View style={[styles.pinIcon, { backgroundColor: colors.surfaceSoft }]}><MapPin size={20} color={colors.pink} /></View><View style={styles.flex}><Text style={[styles.areaLabel, { color: colors.muted }]}>YOUR FEATURED AREA</Text><Text style={[styles.areaValue, { color: colors.text }]}>PIN {pincode}</Text></View></View>
          {loading ? <ActivityIndicator color={colors.pink} style={styles.loader} /> : <>
            <View style={styles.slotHeader}><Text style={[styles.slotCount, { color: colors.text }]}>{remaining} {remaining === 1 ? "spot" : "spots"} remaining</Text><Text style={[styles.slotMeta, { color: colors.muted }]}>{inventory?.occupied ?? 0}/{FEATURED_PLACEMENT_CAPACITY} booked</Text></View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: FEATURED_PLACEMENT_CAPACITY, now: inventory?.occupied ?? 0 }} style={[styles.slotTrack, { backgroundColor: colors.border }]}>
              {Array.from({ length: FEATURED_PLACEMENT_CAPACITY }).map((_, index) => <View key={index} style={[styles.slot, { backgroundColor: index < (inventory?.occupied ?? 0) ? colors.pink : colors.surfaceSoft }]} />)}
            </View>
            {remaining === 0 && inventory?.nextAvailableAt ? <View style={styles.nextRow}><Clock3 size={15} color={colors.warning} /><Text style={[styles.nextText, { color: colors.warning }]}>Next spot expected {dateLabel(inventory.nextAvailableAt)}</Text></View> : null}
          </>}
        </View>

        <View style={[styles.checkoutPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {active ? <>
            <View style={[styles.activeBadge, { backgroundColor: `${colors.success}18` }]}><Check size={17} color={colors.success} /><Text style={[styles.activeBadgeText, { color: colors.success }]}>Featured placement active</Text></View>
            <Text style={[styles.activeTitle, { color: colors.text }]}>Customers in {pincode} can discover you first.</Text>
            <View style={styles.dateRow}><CalendarDays size={17} color={colors.muted} /><Text style={[styles.dateText, { color: colors.muted }]}>Active until {dateLabel(active.ends_at)}</Text></View>
          </> : <>
            <Text style={[styles.checkoutTitle, { color: colors.text }]}>Reserve your area</Text>
            {["Featured placement for customers in your PIN code", "Fair daily rotation among active featured vendors", "One clear payment—no change to your main subscription"].map((copy) => <View key={copy} style={styles.benefit}><Check size={16} color={colors.success} /><Text style={[styles.benefitText, { color: colors.text }]}>{copy}</Text></View>)}
            <View style={[styles.secureRow, { borderTopColor: colors.border }]}><ShieldCheck size={16} color={colors.muted} /><Text style={[styles.secureText, { color: colors.muted }]}>Secure checkout powered by Razorpay</Text></View>
            <Pressable disabled={loading || paying || remaining < 1 || Boolean(error)} accessibilityRole="button" accessibilityLabel={`Pay ₹${FEATURED_PLACEMENT_PRICE} and feature my business in ${pincode}`} onPress={() => void purchase()}
              style={({ pressed, hovered, focused }) => [styles.payButton, { backgroundColor: colors.pink }, (hovered || focused) && styles.lift, pressed && styles.pressed, (loading || paying || remaining < 1 || Boolean(error)) && styles.disabled]}>
              {paying ? <ActivityIndicator color="#FFF" /> : <Sparkles size={18} color="#FFF" />}<Text style={styles.payText}>{paying ? "Opening secure checkout…" : remaining < 1 ? "All spots booked" : `Pay ₹${FEATURED_PLACEMENT_PRICE} & get featured`}</Text>
            </Pressable>
          </>}
        </View>
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
  inventory: { gap: 16 }, inventoryDesktop: { flexDirection: "row", alignItems: "stretch" }, areaPanel: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 20 }, checkoutPanel: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 20 },
  areaTop: { flexDirection: "row", alignItems: "center", gap: 12 }, pinIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }, flex: { flex: 1, minWidth: 0 },
  areaLabel: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 0.8 }, areaValue: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 3 }, loader: { marginVertical: 28 },
  slotHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 28 }, slotCount: { fontSize: typeScale.cardTitle, fontWeight: "700" }, slotMeta: { fontSize: typeScale.caption, fontVariant: ["tabular-nums"] },
  slotTrack: { height: 10, borderRadius: 5, flexDirection: "row", overflow: "hidden", gap: 2, marginTop: 12 }, slot: { flex: 1, height: "100%" }, nextRow: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 15 }, nextText: { fontSize: typeScale.caption, fontWeight: "600" },
  checkoutTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginBottom: 15 }, benefit: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginBottom: 11 }, benefitText: { flex: 1, fontSize: typeScale.caption, lineHeight: 19 },
  secureRow: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 14, marginTop: 5 }, secureText: { fontSize: typeScale.caption },
  payButton: { minHeight: 52, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, shadowColor: "#7D3D58", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 3 }, payText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700" },
  activeBadge: { alignSelf: "flex-start", minHeight: 34, borderRadius: 17, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 }, activeBadgeText: { fontSize: typeScale.caption, fontWeight: "700" }, activeTitle: { fontSize: typeScale.cardTitle, lineHeight: 26, fontWeight: "700", marginTop: 18 }, dateRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 }, dateText: { fontSize: typeScale.caption },
  error: { borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 }, errorText: { flex: 1, fontSize: typeScale.caption }, retry: { fontSize: typeScale.caption, fontWeight: "700" }, terms: { fontSize: typeScale.caption, lineHeight: 18, textAlign: "center", marginTop: 18, paddingHorizontal: 12 },
  smallButton: { minHeight: 44, borderRadius: 13, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" }, smallButtonText: { fontSize: typeScale.caption, fontWeight: "700" },
  lift: { transform: [{ translateY: -1 }], shadowOpacity: 0.2 }, pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 }, disabled: { opacity: 0.45 },
});
