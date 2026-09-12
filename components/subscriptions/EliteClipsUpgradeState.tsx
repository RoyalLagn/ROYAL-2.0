import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Clapperboard, Crown, Image as ImageIcon, LockKeyhole } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useSubscription } from "@/context/SubscriptionContext";
import { formatSubscriptionPrice } from "@/subscriptions/utils";
import { typeLeading, typeScale, typeStyles } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";

export function EliteClipsUpgradeState({ withHeader = false }: { withHeader?: boolean }) {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { access, plans } = useSubscription();
  const elite = plans.find((plan) => plan.slug.toLowerCase() === "elite");
  const monthly = elite?.billing_options.find((option) => option.billing_interval === "month");
  const price = Number(monthly?.discounted_price ?? monthly?.price ?? elite?.price ?? 999);
  const currentPlan = access?.plan_name || "your current plan";

  return <View style={[styles.root, { backgroundColor: colors.background }]}>
    {withHeader ? <VendorHeader /> : null}
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.lockMark, { backgroundColor: colors.surfaceSoft }]}>
        <LockKeyhole size={30} color={colors.pink} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Clips are exclusive to Elite</Text>
      <Text style={[styles.body, { color: colors.muted }]}>
        {currentPlan} does not include Clip uploads. Upgrade to Elite to show couples your best work in motion.
      </Text>

      <View style={[styles.benefits, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.benefitRow}><Clapperboard size={21} color={colors.pink} /><View style={styles.copy}><Text style={[styles.benefitTitle, { color: colors.text }]}>20 Clips</Text><Text style={[styles.benefitText, { color: colors.muted }]}>Build a focused video portfolio</Text></View></View>
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <View style={styles.benefitRow}><Crown size={21} color={colors.pink} /><View style={styles.copy}><Text style={[styles.benefitTitle, { color: colors.text }]}>Up to 40 MB per Clip</Text><Text style={[styles.benefitText, { color: colors.muted }]}>Optimised for reliable playback</Text></View></View>
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
        <View style={styles.benefitRow}><ImageIcon size={21} color={colors.pink} /><View style={styles.copy}><Text style={[styles.benefitTitle, { color: colors.text }]}>60 portfolio images</Text><Text style={[styles.benefitText, { color: colors.muted }]}>More room for your complete work</Text></View></View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Upgrade to Elite for ${formatSubscriptionPrice(price)} per month`}
        onPress={() => router.push({ pathname: "/VendorSubscription", params: { requiredFeature: "upload_clips", plan: "elite" } })}
        style={({ pressed }) => [styles.cta, { backgroundColor: colors.pink }, pressed && styles.pressed]}
      >
        <Crown size={19} color="#FFF" />
        <Text style={styles.ctaText}>Upgrade to Elite — {formatSubscriptionPrice(price)}/month</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Text style={[styles.backText, { color: colors.muted }]}>Go back</Text>
      </Pressable>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, width: "100%", maxWidth: 620, alignSelf: "center", alignItems: "center", justifyContent: "center", paddingHorizontal: 22, paddingVertical: 42 },
  lockMark: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  title: { ...typeStyles.editorialPageTitle, textAlign: "center" },
  body: { maxWidth: 520, marginTop: 10, fontSize: typeScale.body, lineHeight: typeLeading.body, textAlign: "center" },
  benefits: { width: "100%", marginTop: 26, borderWidth: 1, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 5 },
  benefitRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14 },
  copy: { flex: 1, minWidth: 0 },
  benefitTitle: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, fontWeight: "700" },
  benefitText: { marginTop: 2, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 35 },
  cta: { width: "100%", minHeight: 52, marginTop: 22, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  ctaText: { color: "#FFF", fontSize: typeScale.bodyCompact, fontWeight: "700", textAlign: "center" },
  back: { minHeight: 48, marginTop: 6, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: typeScale.bodyCompact, fontWeight: "600" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});
