import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { CalendarClock, CircleDollarSign, Crown, Edit3, Gift, Plus, RefreshCw, Search, Settings2, Trash2, Users, X } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { SubscriptionAdminService, type AdminBillingOptionInput, type AdminPlanInput, type AdminPlanStatus, type AdminVendorSubscriptionRow } from "@/subscriptions/services/SubscriptionAdminService";
import { formatSubscriptionPrice, subscriptionStatusLabel } from "@/subscriptions/utils";
import { isSubscriptionSchemaMissing, subscriptionErrorMessage } from "@/subscriptions/error";
import { typeScale, typeLeading } from "@/constants/typography";
import { adminPalette } from "@/theme";
import { MembershipBadge } from "@/components/vendor/MembershipBadge";

type Tab = "plans" | "vendors" | "offers";
const pink = adminPalette.brand;
const emptyPlan: AdminPlanInput = { name: "", slug: "", description: "", price: 0, discounted_price: null, billing_interval: "custom", billing_interval_count: 1, duration_days: null, trial_enabled: false, trial_days: 0, grace_period_days: 0, is_active: true, is_featured: false, status: "active", is_permanent: false };

// Media limits (Maximum Clips / Maximum Images) live on subscription_plan_features
// (feature_key = 'upload_clips' | 'upload_gallery', column limit_value) — the same
// table and rows the "Limits & access" modal already reads/writes. This is the
// single source of truth; Edit Plan only ever changes limit_value, never the
// is_enabled flag Limits & access controls, so the two can never disagree.
const MEDIA_FEATURE_KEYS = { clips: "upload_clips", images: "upload_gallery" } as const;
// Matches the server's own fallback (private.vendor_clip_limit /
// private.vendor_photo_limit both coalesce to 10 when unconfigured) — used only
// to pre-fill a brand-new plan's Media Limits fields, never hard-coded per plan.
const DEFAULT_MEDIA_LIMIT = 10;

/**
 * Supabase/PostgREST errors (PostgrestError) are plain objects, not
 * `instanceof Error`, so `caught instanceof Error ? caught.message : fallback`
 * was silently discarding the real cause and always showing the generic
 * fallback text — including for RLS rejections, which look identical to a
 * network failure to the admin. This surfaces the actual message, and adds a
 * specific hint for the one RLS rejection every plan/pricing/feature write in
 * this file can hit: an authenticated session that lacks aal2 (e.g. one
 * created via the local EXPO_PUBLIC_ADMIN_MFA_DEV_BYPASS flag) satisfies
 * every other admin check but is still rejected by private.is_admin(),
 * which requires aal2 unconditionally.
 */
function describeAdminError(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) return caught.message;
  if (caught && typeof caught === "object") {
    const record = caught as { message?: unknown; code?: unknown };
    const message = typeof record.message === "string" ? record.message.trim() : "";
    if (message) {
      const isRlsRejection = record.code === "42501" || record.code === "PGRST116" || /row-level security|permission denied/i.test(message);
      return isRlsRejection
        ? "Administrator access required for this change. If you're signed in via the local development MFA bypass, that only skips the app's own screen — the database still requires a real Authenticator-verified (aal2) session for writes. Complete Authenticator verification once, then retry."
        : message;
    }
  }
  return fallback;
}

type PlanEditorExtras = {
  monthlyPrice: string;
  monthlyOptionId: string | null;
  yearlyDiscountPercent: number;
  maxClips: string;
  maxClipsEnabled: boolean;
  maxImages: string;
  maxImagesEnabled: boolean;
};
const newPlanExtras = (): PlanEditorExtras => ({
  monthlyPrice: "", monthlyOptionId: null, yearlyDiscountPercent: 0,
  maxClips: String(DEFAULT_MEDIA_LIMIT), maxClipsEnabled: true,
  maxImages: String(DEFAULT_MEDIA_LIMIT), maxImagesEnabled: true,
});
function planExtrasFrom(plan: any): PlanEditorExtras {
  const monthlyOption = (plan.subscription_plan_billing_options ?? []).find((option: any) => option.billing_interval === "month");
  const yearlyOption = (plan.subscription_plan_billing_options ?? []).find((option: any) => option.billing_interval === "year");
  const clipsFeature = (plan.subscription_plan_features ?? []).find((entry: any) => entry.subscription_feature_definitions?.feature_key === MEDIA_FEATURE_KEYS.clips);
  const imagesFeature = (plan.subscription_plan_features ?? []).find((entry: any) => entry.subscription_feature_definitions?.feature_key === MEDIA_FEATURE_KEYS.images);
  return {
    monthlyPrice: String(monthlyOption ? (monthlyOption.discounted_price ?? monthlyOption.price) : plan.price ?? 0),
    monthlyOptionId: monthlyOption?.id ?? null,
    yearlyDiscountPercent: Number(yearlyOption?.discount_percentage ?? 0),
    maxClips: String(clipsFeature?.limit_value ?? DEFAULT_MEDIA_LIMIT),
    maxClipsEnabled: clipsFeature ? Boolean(clipsFeature.is_enabled) : true,
    maxImages: String(imagesFeature?.limit_value ?? DEFAULT_MEDIA_LIMIT),
    maxImagesEnabled: imagesFeature ? Boolean(imagesFeature.is_enabled) : true,
  };
}
const emptyOffer = { name: "", code: "", description: "", discount_type: "percentage", discount_value: 0, start_date: "", end_date: "", is_global: true, is_active: true, applicable_plan_ids: [], applicable_vendor_ids: [], applicable_billing_intervals: [], uses_per_vendor: 1 };
const emptyBillingOption: AdminBillingOptionInput = { plan_id: "", billing_interval: "month", interval_count: 1, price: 0, discounted_price: null, discount_percentage: 0, trial_enabled: false, trial_days: 0, grace_period_days: 0, is_active: true, display_order: 0 };
const planStatuses: AdminPlanStatus[] = ["active", "coming_soon", "hidden", "archived"];
const planStatusLabel: Record<AdminPlanStatus, string> = { active: "Active", coming_soon: "Coming soon", hidden: "Hidden", archived: "Archived" };

function Field({ label, value, onChangeText, placeholder, numeric, multiline, editable = true }: any) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={String(value ?? "")} onChangeText={onChangeText} placeholder={placeholder} keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} editable={editable} style={[styles.input, multiline && styles.multiline, !editable && styles.inputDisabled]} /></View>;
}

export default function SubscriptionsAdmin() {
  const [tab, setTab] = useState<Tab>("plans");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<AdminVendorSubscriptionRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planEditor, setPlanEditor] = useState<AdminPlanInput | null>(null);
  const [planEditorExtras, setPlanEditorExtras] = useState<PlanEditorExtras | null>(null);
  const [featureIdByKey, setFeatureIdByKey] = useState<Record<string, string>>({});
  const [offerEditor, setOfferEditor] = useState<any | null>(null);
  const [vendorEditor, setVendorEditor] = useState<AdminVendorSubscriptionRow | null>(null);
  const [vendorAction, setVendorAction] = useState("grant_free");
  const [vendorDays, setVendorDays] = useState("30");
  const [vendorExpiry, setVendorExpiry] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const [vendorPlanId, setVendorPlanId] = useState("");
  const [featurePlan, setFeaturePlan] = useState<any | null>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [planFeatures, setPlanFeatures] = useState<any[]>([]);
  const [billingPlan, setBillingPlan] = useState<any | null>(null);
  const [billingOptions, setBillingOptions] = useState<any[]>([]);
  const [billingEditor, setBillingEditor] = useState<AdminBillingOptionInput | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const nextPlans = await SubscriptionAdminService.listPlans();
      const [nextMetrics, nextOffers, nextVendors, nextFeatures] = await Promise.all([
        SubscriptionAdminService.metrics(), SubscriptionAdminService.listOffers(), SubscriptionAdminService.listVendors(search, statusFilter), SubscriptionAdminService.listFeatures(),
      ]);
      setMetrics(nextMetrics ?? {}); setPlans(nextPlans); setOffers(nextOffers); setVendors(nextVendors);
      setFeatureIdByKey(Object.fromEntries((nextFeatures ?? []).map((feature: any) => [feature.feature_key, feature.id])));
    } catch (caught) {
      setError(isSubscriptionSchemaMissing(caught)
        ? "Subscription database setup is required. Apply the pending Supabase migrations, then retry."
        : subscriptionErrorMessage(caught, "Unable to load subscription management."));
    }
    finally { setLoading(false); }
  }, [search, statusFilter]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const closePlanEditor = () => { setPlanEditor(null); setPlanEditorExtras(null); };

  const savePlan = async () => {
    if (!planEditor || !planEditorExtras) return;
    if (!planEditor.name.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(planEditor.slug.trim())) return Alert.alert("Check plan", "Enter a name and a lowercase slug using letters, numbers and hyphens.");
    const interval = Number(planEditor.billing_interval_count), duration = Number(planEditor.duration_days), trial = Number(planEditor.trial_days), grace = Number(planEditor.grace_period_days);
    const monthlyPrice = Number(planEditorExtras.monthlyPrice);
    const maxClips = Number(planEditorExtras.maxClips);
    const maxImages = Number(planEditorExtras.maxImages);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) return Alert.alert("Check monthly price", "Monthly price must be zero or greater.");
    if (!Number.isInteger(interval) || interval < 1) return Alert.alert("Check duration", "Billing interval count must be a positive whole number.");
    if (planEditor.billing_interval === "custom" && (!Number.isInteger(duration) || duration < 1)) return Alert.alert("Check duration", "Custom plans require a positive duration in days.");
    if ((planEditor.trial_enabled && (!Number.isInteger(trial) || trial < 1)) || !Number.isInteger(grace) || grace < 0) return Alert.alert("Check access days", "Trial and grace days must be valid whole numbers.");
    if (!Number.isInteger(maxClips) || maxClips < 0) return Alert.alert("Check Maximum Clips", "Maximum Clips must be a whole number of zero or more.");
    if (!Number.isInteger(maxImages) || maxImages < 0) return Alert.alert("Check Maximum Images", "Maximum Images must be a whole number of zero or more.");
    setSaving(true);
    try {
      const savedPlan = await SubscriptionAdminService.savePlan({
        ...planEditor, price: monthlyPrice, discounted_price: null,
        billing_interval_count: interval, duration_days: planEditor.duration_days ? duration : null,
        trial_days: Number(planEditor.trial_days), grace_period_days: grace,
      });
      // Monthly price is the same subscription_plan_billing_options row the
      // plan card and "Prices" modal already read/write — this fixes Edit
      // Plan appearing not to save, since it previously wrote a different
      // column (subscription_plans.price) that nothing displays.
      await SubscriptionAdminService.saveBillingOption({
        id: planEditorExtras.monthlyOptionId ?? undefined,
        plan_id: savedPlan.id, billing_interval: "month",
        price: monthlyPrice, discounted_price: null, discount_percentage: 0, is_active: true,
      });
      // Same underlying rows and service call "Limits & access" uses — only
      // limit_value changes here, is_enabled is carried through unchanged so
      // Edit Plan can never silently re-enable/disable a feature.
      const clipsFeatureId = featureIdByKey[MEDIA_FEATURE_KEYS.clips];
      const imagesFeatureId = featureIdByKey[MEDIA_FEATURE_KEYS.images];
      if (clipsFeatureId) await SubscriptionAdminService.setPlanFeature(savedPlan.id, clipsFeatureId, planEditorExtras.maxClipsEnabled, maxClips);
      if (imagesFeatureId) await SubscriptionAdminService.setPlanFeature(savedPlan.id, imagesFeatureId, planEditorExtras.maxImagesEnabled, maxImages);
      closePlanEditor();
      await load();
      Alert.alert("Plan saved", `${savedPlan.name} has been updated.`);
    } catch (caught) {
      Alert.alert("Plan not saved", describeAdminError(caught, "Unable to save this plan. Check your connection and try again."));
    } finally { setSaving(false); }
  };
  const saveOffer = async () => {
    if (!offerEditor?.name.trim()) return Alert.alert("Offer name required", "Enter a clear offer name.");
    const discount = Number(offerEditor.discount_value);
    if (!Number.isFinite(discount) || discount < 0 || (offerEditor.discount_type === "percentage" && discount > 100)) return Alert.alert("Check discount", offerEditor.discount_type === "percentage" ? "Percentage must be between 0 and 100." : "Discount must be zero or greater.");
    const start = offerEditor.start_date ? Date.parse(offerEditor.start_date) : null;
    const end = offerEditor.end_date ? Date.parse(offerEditor.end_date) : null;
    if ((offerEditor.start_date && Number.isNaN(start)) || (offerEditor.end_date && Number.isNaN(end))) return Alert.alert("Check offer dates", "Enter valid ISO date and time values.");
    if (start !== null && end !== null && end <= start) return Alert.alert("Check offer dates", "Offer end must be after its start.");
    if (!Number.isInteger(Number(offerEditor.uses_per_vendor)) || Number(offerEditor.uses_per_vendor) < 1) return Alert.alert("Check usage limit", "Uses per vendor must be a positive whole number.");
    setSaving(true); try { await SubscriptionAdminService.saveOffer({ ...offerEditor, start_date: offerEditor.start_date || null, end_date: offerEditor.end_date || null }); setOfferEditor(null); await load(); }
    catch (caught) { Alert.alert("Offer not saved", describeAdminError(caught, "Unable to save this offer. Try again.")); } finally { setSaving(false); }
  };
  const openFeatures = async (plan: any) => {
    try { const [definitions, assigned] = await Promise.all([SubscriptionAdminService.listFeatures(), SubscriptionAdminService.listPlanFeatures(plan.id)]); setFeatures(definitions); setPlanFeatures(assigned); setFeaturePlan(plan); }
    catch (caught) { Alert.alert("Features unavailable", describeAdminError(caught, "Unable to load features. Try again.")); }
  };
  const toggleFeature = async (feature: any, enabled: boolean) => {
    if (!featurePlan) return;
    const assigned = planFeatures.find((entry) => entry.feature_id === feature.id);
    try { await SubscriptionAdminService.setPlanFeature(featurePlan.id, feature.id, enabled, assigned?.limit_value); setPlanFeatures(await SubscriptionAdminService.listPlanFeatures(featurePlan.id)); }
    catch (caught) { Alert.alert("Feature not updated", describeAdminError(caught, "Unable to update this feature. Try again.")); }
  };
  const openBilling = async (plan: any) => {
    try { setBillingOptions(await SubscriptionAdminService.listBillingOptions(plan.id)); setBillingPlan(plan); }
    catch (caught) { Alert.alert("Billing options unavailable", describeAdminError(caught, "Unable to load pricing. Try again.")); }
  };
  const saveBillingOption = async () => {
    if (!billingEditor) return;
    const price = Number(billingEditor.price);
    const yearlyDiscount = Number(billingEditor.discount_percentage ?? 0);
    if (billingEditor.billing_interval === "month" && (!Number.isFinite(price) || price < 0)) return Alert.alert("Check price", "Monthly price must be zero or greater.");
    if (billingEditor.billing_interval === "year" && (!Number.isFinite(yearlyDiscount) || yearlyDiscount < 0 || yearlyDiscount > 100)) return Alert.alert("Check Yearly discount", "Yearly discount must be between 0% and 100%.");
    setSaving(true);
    try {
      await SubscriptionAdminService.saveBillingOption({ ...billingEditor, price, discounted_price: null, discount_percentage: yearlyDiscount });
      setBillingEditor(null);
      setBillingOptions(await SubscriptionAdminService.listBillingOptions(billingEditor.plan_id));
    } catch (caught) { Alert.alert("Billing option not saved", describeAdminError(caught, "Unable to save this price. Try again.")); }
    finally { setSaving(false); }
  };
  const runVendorAction = async () => {
    if (!vendorEditor) return;
    const destructive = ["suspend", "cancel", "deactivate", "shorten"].includes(vendorAction);
    if (["grant_free", "grant_trial", "change_plan"].includes(vendorAction) && !vendorPlanId) return Alert.alert("Plan required", "Select a subscription plan before applying this action.");
    if (["grant_free", "grant_trial", "extend", "shorten"].includes(vendorAction) && (!Number.isInteger(Number(vendorDays)) || Number(vendorDays) < 1)) return Alert.alert("Days required", "Enter a positive whole number of days.");
    if (vendorAction === "set_expiry" && (!/^\d{4}-\d{2}-\d{2}$/.test(vendorExpiry) || Number.isNaN(Date.parse(`${vendorExpiry}T00:00:00Z`)))) return Alert.alert("Expiry date required", "Use a valid date in YYYY-MM-DD format.");
    if (destructive && !vendorNotes.trim()) return Alert.alert("Internal note required", "Record a reason for this access change.");
    const execute = async () => {
      setSaving(true); try {
        const payload: Record<string, unknown> = { admin_notes: vendorNotes || undefined, plan_id: vendorPlanId || undefined };
        if (["grant_free", "grant_trial", "extend", "shorten"].includes(vendorAction)) payload.days = Number(vendorDays || 0);
        if (vendorAction === "set_expiry") payload.expiry_date = vendorExpiry ? new Date(vendorExpiry).toISOString() : null;
        await SubscriptionAdminService.manageVendor(vendorEditor.vendor_id, vendorAction, payload); setVendorEditor(null); await load();
      } catch (caught) { Alert.alert("Action failed", describeAdminError(caught, "Unable to complete this action. Try again.")); } finally { setSaving(false); }
    };
    if (destructive) Alert.alert("Confirm subscription change", `This will ${vendorAction} access for ${vendorEditor.business_name}.`, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", style: "destructive", onPress: () => void execute() }]); else await execute();
  };

  const filteredStats = [
    { label: "All vendors", value: metrics.total_vendors ?? 0, icon: Users, tint: "#5B5FEF" },
    { label: "Active", value: metrics.active ?? 0, icon: Crown, tint: pink },
    { label: "Trial / launch", value: (metrics.trial ?? 0) + (metrics.launch_offer ?? 0), icon: Gift, tint: "#C77B00" },
    { label: "Verified revenue", value: formatSubscriptionPrice(Number(metrics.verified_revenue ?? 0)), icon: CircleDollarSign, tint: adminPalette.success },
  ];
  const planFeatureEnabled = (featureId: string) => Boolean(planFeatures.find((entry) => entry.feature_id === featureId)?.is_enabled);
  const openNewPlan = () => {
    setPlanEditor({
      ...emptyPlan,
      grace_period_days: 3,
    });
    setPlanEditorExtras(newPlanExtras());
  };
  const planQuota = (plan: any, key: "upload_clips" | "upload_gallery") => {
    const feature = (plan.subscription_plan_features ?? []).find(
      (entry: any) => entry.subscription_feature_definitions?.feature_key === key,
    );
    return feature?.is_enabled ? Number(feature.limit_value ?? 0) : 0;
  };
  const billingPrice = (plan: any, interval: "month" | "year") => {
    const option = (plan.subscription_plan_billing_options ?? []).find(
      (entry: any) => entry.billing_interval === interval && entry.is_active,
    );
    return option ? formatSubscriptionPrice(Number(option.discounted_price ?? option.price), option.currency) : null;
  };
  const isEditingFreePlan = planEditor?.slug.trim().toLowerCase() === "free";

  return <SafeAreaView style={styles.page} edges={["top", "left", "right"]}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <AdminPageHeader title="Subscriptions" subtitle="Configure plans, subscriber access and offers" action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh subscriptions" accessibilityState={{ busy: loading }} disabled={loading} onPress={() => void load()} style={styles.headerButton}><RefreshCw size={19} color={pink} /></Pressable>} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{(["plans", "vendors", "offers"] as Tab[]).map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item }} key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item === "vendors" ? "Subscribers" : item.charAt(0).toUpperCase() + item.slice(1)}</Text></Pressable>)}</ScrollView>
    {loading ? <ActivityIndicator color={pink} style={{ marginTop: 40 }} /> : null}{error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={load}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}

    {!loading && tab === "plans" ? <><View style={styles.stats}>{filteredStats.map(({ label, value, icon: Icon, tint }) => <View key={label} style={styles.stat}><View style={[styles.statIcon, { backgroundColor: `${tint}16` }]}><Icon size={20} color={tint} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View><View style={styles.sectionRow}><View><Text style={styles.sectionTitle}>Your plans</Text><Text style={styles.sectionHint}>Free, Premium and Elite. Monthly price drives the Yearly calculation.</Text></View><Pressable onPress={openNewPlan} style={styles.add}><Plus size={17} color="#FFF" /><Text style={styles.addText}>Add plan</Text></Pressable></View><View style={styles.list}>{plans.map((plan) => <View key={plan.id} style={styles.card}><View style={styles.cardTop}><MembershipBadge planName={plan.name} size={58} /><View style={styles.flex}><Text style={styles.cardTitle}>{plan.name}{plan.is_permanent ? " · Free forever" : ""}</Text><Text style={styles.cardSub}>{plan.description}</Text></View><Text style={[styles.statusBadge, plan.status === "active" && styles.statusActive]}>{planStatusLabel[plan.status as AdminPlanStatus] ?? plan.status}</Text></View>
      <View style={styles.planFacts}><Text style={styles.planFact}>{billingPrice(plan, "month") ?? "No monthly price"}<Text style={styles.period}> / month</Text></Text>{billingPrice(plan, "year") ? <Text style={styles.planFact}>{billingPrice(plan, "year")}<Text style={styles.period}> / year</Text></Text> : null}<Text style={styles.planFact}>{planQuota(plan, "upload_clips")} clips · {planQuota(plan, "upload_gallery")} photos</Text></View>
      <View style={styles.cardActions}><Pressable onPress={() => { setPlanEditor({ ...plan }); setPlanEditorExtras(planExtrasFrom(plan)); }} style={styles.primaryInline}><Edit3 size={15} color="#FFF" /><Text style={styles.primaryText}>Edit plan</Text></Pressable><Pressable onPress={() => void openBilling(plan)} style={styles.secondary}><CalendarClock size={15} color={pink} /><Text style={styles.secondaryText}>Prices</Text></Pressable><Pressable onPress={() => void openFeatures(plan)} style={styles.secondary}><Settings2 size={15} color={pink} /><Text style={styles.secondaryText}>Limits & access</Text></Pressable></View></View>)}</View></> : null}

    {!loading && tab === "vendors" ? <>
      <View style={styles.searchBox}><Search size={17} color="#8D8188" /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={load} placeholder="Search Vendor, owner, email or ID" style={styles.searchInput} /><Pressable onPress={load}><Text style={styles.retry}>Search</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["all","active","trial","launch_offer","grace_period","expired","suspended"].map((item) => <Pressable key={item} onPress={() => setStatusFilter(item)} style={[styles.filter, statusFilter === item && styles.filterActive]}><Text style={[styles.filterText, statusFilter === item && styles.filterTextActive]}>{subscriptionStatusLabel(item as any)}</Text></Pressable>)}</ScrollView>
      <View style={styles.list}>{vendors.map((vendor) => <Pressable key={vendor.vendor_id} onPress={() => { setVendorEditor(vendor); setVendorPlanId(vendor.plan_id || plans[0]?.id || ""); setVendorNotes(""); }} style={styles.vendorCard}>
        <View style={[styles.avatar, { backgroundColor: vendor.status === "active" ? "#E9F8F1" : "#FFF0F5" }]}><Text style={{ color: vendor.status === "active" ? adminPalette.success : pink, fontWeight: "700" }}>{vendor.business_name?.charAt(0)}</Text></View>
        <View style={styles.flex}><Text style={styles.cardTitle}>{vendor.business_name}</Text><Text style={styles.cardSub}>{vendor.plan_name || "No plan"} · {subscriptionStatusLabel(vendor.status as any)}</Text><Text style={styles.vendorMeta}>{vendor.expiry_date ? `Expires ${new Date(vendor.expiry_date).toLocaleDateString("en-IN")}` : "No expiry date"}</Text><Text style={styles.vendorMeta}>Clips {vendor.clip_active}/{vendor.clip_total} active · {vendor.clip_locked} locked  ·  Photos {vendor.photo_active}/{vendor.photo_total} active · {vendor.photo_locked} locked</Text></View>
        <Text style={styles.manage}>Manage</Text>
      </Pressable>)}</View>
    </> : null}

    {!loading && tab === "offers" ? <><View style={styles.sectionRow}><View><Text style={styles.sectionTitle}>Promotional offers</Text><Text style={styles.sectionHint}>Time-limited discounts for Monthly, Yearly, or both</Text></View><Pressable onPress={() => setOfferEditor({ ...emptyOffer })} style={styles.add}><Plus size={17} color="#FFF" /><Text style={styles.addText}>Offer</Text></Pressable></View><View style={styles.list}>{offers.map((offer) => <View key={offer.id} style={styles.card}><View style={styles.cardTop}><View style={[styles.statIcon, { backgroundColor: adminPalette.warningSubtle }]}><Gift size={19} color={adminPalette.warning} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{offer.name}</Text><Text style={styles.cardSub}>{offer.description || "No vendor message"}</Text><Text style={styles.cardSub}>{offer.discount_type === "percentage" ? `${Number(offer.discount_value)}% off` : `${offer.discount_type} discount`} · {(offer.applicable_billing_intervals || []).length ? offer.applicable_billing_intervals.map((value: string) => value === "year" ? "Yearly" : "Monthly").join(" + ") : "Monthly + Yearly"}</Text></View><Text style={{ color: offer.is_active ? adminPalette.success : "#8D8188", fontWeight: "700", fontSize: typeScale.caption }}>{offer.is_active ? "ACTIVE" : "OFF"}</Text></View><View style={styles.cardActions}><Pressable onPress={() => setOfferEditor({ ...offer })} style={styles.secondary}><Edit3 size={15} color={pink} /><Text style={styles.secondaryText}>Edit</Text></Pressable><Pressable onPress={() => Alert.alert("Remove offer?", "This offer will be archived.", [{ text: "Cancel", style: "cancel" }, { text: "Archive", style: "destructive", onPress: () => void SubscriptionAdminService.archiveOffer(offer.id).then(load) }])} style={styles.iconDanger}><Trash2 size={16} color={adminPalette.error} /></Pressable></View></View>)}</View></> : null}

    {!loading && !error && tab === "plans" && !plans.length ? <EmptySection title="No subscription plans" text="Create a plan to make it available to vendors." /> : null}
    {!loading && !error && tab === "vendors" && !vendors.length ? <EmptySection title="No matching vendors" text="Try another search or subscription status." /> : null}
    {!loading && !error && tab === "offers" && !offers.length ? <EmptySection title="No offers" text="Create an offer when a discount campaign is required." /> : null}
  </ScrollView><AdminFooter activeTab="subscriptions" />

  <Modal visible={Boolean(planEditor)} transparent animationType="slide" onRequestClose={closePlanEditor}>{planEditor && planEditorExtras ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={planEditor.id ? "Edit plan" : "Create plan"} close={closePlanEditor} /><ScrollView><Field label="Plan name" value={planEditor.name} onChangeText={(name: string) => setPlanEditor({ ...planEditor, name, slug: planEditor.id ? planEditor.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} /><Field label="Slug" value={planEditor.slug} editable={!isEditingFreePlan} onChangeText={(slug: string) => setPlanEditor({ ...planEditor, slug })} /><Field label="Description" value={planEditor.description} multiline onChangeText={(description: string) => setPlanEditor({ ...planEditor, description })} />
      <View style={styles.twoCols}>
        <Field label="Monthly Price (₹)" numeric value={planEditorExtras.monthlyPrice} onChangeText={(monthlyPrice: string) => setPlanEditorExtras({ ...planEditorExtras, monthlyPrice })} />
        <Field label="Yearly Price" editable={false} value={formatSubscriptionPrice(Math.max(0, (Number(planEditorExtras.monthlyPrice) || 0) * 12 * (1 - planEditorExtras.yearlyDiscountPercent / 100)))} onChangeText={() => {}} />
      </View>
      <Text style={styles.modalHint}>Yearly Price is calculated as Monthly × 12{planEditorExtras.yearlyDiscountPercent > 0 ? `, minus the ${planEditorExtras.yearlyDiscountPercent}% Yearly discount set in Prices.` : "; set a Yearly discount in Prices to lower it."}</Text>
      <Text style={styles.fieldLabel}>Media limits</Text>
      <View style={styles.twoCols}>
        <Field label="Maximum Clips" numeric value={planEditorExtras.maxClips} onChangeText={(maxClips: string) => setPlanEditorExtras({ ...planEditorExtras, maxClips })} />
        <Field label="Maximum Images" numeric value={planEditorExtras.maxImages} onChangeText={(maxImages: string) => setPlanEditorExtras({ ...planEditorExtras, maxImages })} />
      </View>
      <Field label="Display order (lower shows first)" numeric value={planEditor.display_order ?? 0} onChangeText={(display_order: string) => setPlanEditor({ ...planEditor, display_order: display_order as any })} /><Text style={styles.fieldLabel}>Billing duration</Text><View style={styles.filters}>{["day","month","year","custom"].map((item) => <Pressable key={item} onPress={() => setPlanEditor({ ...planEditor, billing_interval: item as any })} style={[styles.filter, planEditor.billing_interval === item && styles.filterActive]}><Text style={[styles.filterText, planEditor.billing_interval === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View><View style={styles.twoCols}><Field label="Interval count" numeric value={planEditor.billing_interval_count} onChangeText={(billing_interval_count: string) => setPlanEditor({ ...planEditor, billing_interval_count: billing_interval_count as any })} />{planEditor.billing_interval === "custom" ? <Field label="Duration days" numeric value={planEditor.duration_days ?? ""} onChangeText={(duration_days: string) => setPlanEditor({ ...planEditor, duration_days: duration_days as any })} /> : <Field label="Grace days" numeric value={planEditor.grace_period_days} onChangeText={(grace_period_days: string) => setPlanEditor({ ...planEditor, grace_period_days: grace_period_days as any })} />}</View><Toggle label="Free trial" value={Boolean(planEditor.trial_enabled)} onValueChange={(trial_enabled: boolean) => setPlanEditor({ ...planEditor, trial_enabled })} />{planEditor.trial_enabled ? <Field label="Trial days" numeric value={planEditor.trial_days} onChangeText={(trial_days: string) => setPlanEditor({ ...planEditor, trial_days: trial_days as any })} /> : null}<Toggle label="Featured plan" value={Boolean(planEditor.is_featured)} onValueChange={(is_featured: boolean) => setPlanEditor({ ...planEditor, is_featured })} /><Toggle label="Permanent (never expires, e.g. Free)" value={isEditingFreePlan || Boolean(planEditor.is_permanent)} disabled={isEditingFreePlan} onValueChange={(is_permanent: boolean) => setPlanEditor({ ...planEditor, is_permanent })} /><Text style={styles.fieldLabel}>Status</Text><View style={styles.filters}>{planStatuses.map((item) => { const disabled = isEditingFreePlan && item !== "active"; return <Pressable key={item} disabled={disabled} onPress={() => setPlanEditor({ ...planEditor, status: item })} style={[styles.filter, (isEditingFreePlan ? item === "active" : planEditor.status === item) && styles.filterActive, disabled && styles.controlDisabled]}><Text style={[styles.filterText, (isEditingFreePlan ? item === "active" : planEditor.status === item) && styles.filterTextActive]}>{planStatusLabel[item]}</Text></Pressable>; })}</View></ScrollView><Pressable disabled={saving} onPress={savePlan} style={styles.primary}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Save plan</Text>}</Pressable></View></View> : null}</Modal>

  <Modal visible={Boolean(offerEditor)} transparent animationType="slide" onRequestClose={() => setOfferEditor(null)}>{offerEditor ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={offerEditor.id ? "Edit offer" : "Create offer"} close={() => setOfferEditor(null)} /><ScrollView><Field label="Offer name" value={offerEditor.name} onChangeText={(name: string) => setOfferEditor({ ...offerEditor, name })} /><Field label="Code (optional)" value={offerEditor.code} onChangeText={(code: string) => setOfferEditor({ ...offerEditor, code })} /><Field label="Description" value={offerEditor.description} multiline onChangeText={(description: string) => setOfferEditor({ ...offerEditor, description })} /><Text style={styles.fieldLabel}>Discount type</Text><View style={styles.filters}>{["percentage","fixed","free"].map((item) => <Pressable key={item} onPress={() => setOfferEditor({ ...offerEditor, discount_type: item })} style={[styles.filter, offerEditor.discount_type === item && styles.filterActive]}><Text style={[styles.filterText, offerEditor.discount_type === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View><Field label="Discount value" numeric value={offerEditor.discount_value} onChangeText={(discount_value: string) => setOfferEditor({ ...offerEditor, discount_value })} /><Text style={styles.fieldLabel}>Applicable plans (none means all)</Text><View style={styles.filters}>{plans.map((plan) => { const selected = (offerEditor.applicable_plan_ids || []).includes(plan.id); return <Pressable key={plan.id} onPress={() => setOfferEditor({ ...offerEditor, applicable_plan_ids: selected ? offerEditor.applicable_plan_ids.filter((id: string) => id !== plan.id) : [...(offerEditor.applicable_plan_ids || []), plan.id] })} style={[styles.filter, selected && styles.filterActive]}><Text style={[styles.filterText, selected && styles.filterTextActive]}>{plan.name}</Text></Pressable>; })}</View><Text style={styles.fieldLabel}>Applicable billing (none means all)</Text><View style={styles.filters}>{["month","year"].map((item) => { const selected = (offerEditor.applicable_billing_intervals || []).includes(item); return <Pressable key={item} onPress={() => setOfferEditor({ ...offerEditor, applicable_billing_intervals: selected ? offerEditor.applicable_billing_intervals.filter((value: string) => value !== item) : [...(offerEditor.applicable_billing_intervals || []), item] })} style={[styles.filter, selected && styles.filterActive]}><Text style={[styles.filterText, selected && styles.filterTextActive]}>{item}ly</Text></Pressable>; })}</View><Field label="Starts (ISO date/time, optional)" value={offerEditor.start_date || ""} onChangeText={(start_date: string) => setOfferEditor({ ...offerEditor, start_date })} /><Field label="Ends (ISO date/time, optional)" value={offerEditor.end_date || ""} onChangeText={(end_date: string) => setOfferEditor({ ...offerEditor, end_date })} /><View style={styles.twoCols}><Field label="Maximum uses" numeric value={offerEditor.maximum_uses || ""} onChangeText={(maximum_uses: string) => setOfferEditor({ ...offerEditor, maximum_uses: maximum_uses ? Number(maximum_uses) : null })} /><Field label="Uses per Vendor" numeric value={offerEditor.uses_per_vendor || 1} onChangeText={(uses_per_vendor: string) => setOfferEditor({ ...offerEditor, uses_per_vendor: Number(uses_per_vendor || 1) })} /></View><Toggle label="Available to all eligible Vendors" value={Boolean(offerEditor.is_global)} onValueChange={(is_global: boolean) => setOfferEditor({ ...offerEditor, is_global })} />{!offerEditor.is_global ? <Field label="Selected Vendor IDs (comma separated)" value={(offerEditor.applicable_vendor_ids || []).join(", ")} onChangeText={(value: string) => setOfferEditor({ ...offerEditor, applicable_vendor_ids: value.split(",").map((id) => id.trim()).filter(Boolean) })} /> : null}<Toggle label="Active" value={Boolean(offerEditor.is_active)} onValueChange={(is_active: boolean) => setOfferEditor({ ...offerEditor, is_active })} /></ScrollView><Pressable disabled={saving} onPress={saveOffer} style={styles.primary}><Text style={styles.primaryText}>Save offer</Text></Pressable></View></View> : null}</Modal>

  <Modal visible={Boolean(vendorEditor)} transparent animationType="slide" onRequestClose={() => setVendorEditor(null)}>{vendorEditor ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={vendorEditor.business_name} close={() => setVendorEditor(null)} /><Text style={styles.modalHint}>{vendorEditor.plan_name || "No plan"} · {subscriptionStatusLabel(vendorEditor.status as any)}</Text><Text style={styles.fieldLabel}>Action</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{["grant_free","grant_trial","extend","shorten","set_expiry","change_plan","suspend","cancel","reactivate","deactivate"].map((item) => <Pressable key={item} onPress={() => setVendorAction(item)} style={[styles.filter, vendorAction === item && styles.filterActive]}><Text style={[styles.filterText, vendorAction === item && styles.filterTextActive]}>{item.replaceAll("_", " ")}</Text></Pressable>)}</ScrollView>{["grant_free","grant_trial","change_plan"].includes(vendorAction) ? <><Text style={styles.fieldLabel}>Plan</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{plans.map((plan) => <Pressable key={plan.id} onPress={() => setVendorPlanId(plan.id)} style={[styles.filter, vendorPlanId === plan.id && styles.filterActive]}><Text style={[styles.filterText, vendorPlanId === plan.id && styles.filterTextActive]}>{plan.name}</Text></Pressable>)}</ScrollView></> : null}{["grant_free","grant_trial","extend","shorten"].includes(vendorAction) ? <Field label="Days" numeric value={vendorDays} onChangeText={setVendorDays} /> : null}{vendorAction === "set_expiry" ? <Field label="New expiry (YYYY-MM-DD)" value={vendorExpiry} onChangeText={setVendorExpiry} /> : null}<Field label="Internal notes" value={vendorNotes} multiline onChangeText={setVendorNotes} /><Pressable disabled={saving} onPress={runVendorAction} style={styles.primary}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Apply action</Text>}</Pressable></View></View> : null}</Modal>

  <Modal visible={Boolean(featurePlan)} transparent animationType="slide" onRequestClose={() => setFeaturePlan(null)}>{featurePlan ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={`${featurePlan.name} features`} close={() => setFeaturePlan(null)} /><ScrollView>{features.map((feature) => { const assigned = planFeatures.find((entry) => entry.feature_id === feature.id); return <View key={feature.id} style={styles.toggle}><View style={styles.flex}><Text style={styles.toggleLabel}>{feature.name}</Text><Text style={styles.toggleHint}>{feature.description}</Text></View><TextInput defaultValue={assigned?.limit_value == null ? "" : String(assigned.limit_value)} placeholder="Limit" keyboardType="number-pad" style={styles.limitInput} onEndEditing={(event) => void SubscriptionAdminService.setPlanFeature(featurePlan.id, feature.id, Boolean(assigned?.is_enabled), event.nativeEvent.text ? Number(event.nativeEvent.text) : null).then(() => SubscriptionAdminService.listPlanFeatures(featurePlan.id)).then(setPlanFeatures)} /><Switch value={planFeatureEnabled(feature.id)} onValueChange={(value) => void toggleFeature(feature, value)} trackColor={{ true: "#F7A5C1" }} thumbColor={planFeatureEnabled(feature.id) ? pink : "#EEE"} /></View>; })}</ScrollView></View></View> : null}</Modal>

  <Modal visible={Boolean(billingPlan)} transparent animationType="slide" onRequestClose={() => setBillingPlan(null)}>{billingPlan ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={`${billingPlan.name} pricing`} close={() => setBillingPlan(null)} /><Text style={styles.modalHint}>Set the Monthly price once. Yearly always uses Monthly × 12, then applies the Yearly discount configured here.</Text><ScrollView>
    {billingOptions.map((option) => <View key={option.id} style={styles.card}><View style={styles.cardTop}><View style={styles.flex}><Text style={styles.cardTitle}>{option.billing_interval === "year" ? "Yearly" : "Monthly"}</Text><Text style={styles.cardSub}>{option.billing_interval === "year" ? `${formatSubscriptionPrice(Number(option.price))} base · ${Number(option.discount_percentage || 0)}% off · ${formatSubscriptionPrice(Number(option.discounted_price ?? option.price))} payable` : `${formatSubscriptionPrice(Number(option.price))} per month`}</Text></View><Switch value={option.is_active} onValueChange={(value) => void SubscriptionAdminService.setBillingOptionActive(option.id, value).then(() => SubscriptionAdminService.listBillingOptions(billingPlan.id)).then(setBillingOptions)} trackColor={{ true: "#F7A5C1" }} thumbColor={option.is_active ? pink : "#EEE"} /></View><Pressable onPress={() => setBillingEditor({ ...option })} style={styles.secondary}><Edit3 size={15} color={pink} /><Text style={styles.secondaryText}>Edit</Text></Pressable></View>)}
    {!billingOptions.some((option) => option.billing_interval === "month") ? <Pressable onPress={() => setBillingEditor({ ...emptyBillingOption, plan_id: billingPlan.id, billing_interval: "month" })} style={styles.add}><Plus size={17} color="#FFF" /><Text style={styles.addText}>Add Monthly</Text></Pressable> : null}
    {!billingOptions.some((option) => option.billing_interval === "year") ? <Pressable onPress={() => setBillingEditor({ ...emptyBillingOption, plan_id: billingPlan.id, billing_interval: "year" })} style={[styles.add, { marginTop: 8 }]}><Plus size={17} color="#FFF" /><Text style={styles.addText}>Add Yearly</Text></Pressable> : null}
  </ScrollView></View></View> : null}</Modal>

  <Modal visible={Boolean(billingEditor)} transparent animationType="slide" onRequestClose={() => setBillingEditor(null)}>{billingEditor ? <View style={styles.modalBackdrop}><View style={styles.modal}><ModalHeader title={billingEditor.billing_interval === "year" ? "Yearly pricing" : "Monthly pricing"} close={() => setBillingEditor(null)} /><ScrollView>
    {billingEditor.billing_interval === "month" ? <Field label="Monthly price (₹)" numeric value={billingEditor.price} onChangeText={(price: string) => setBillingEditor({ ...billingEditor, price: price as any })} /> : <><Field label="Yearly discount (%)" numeric value={billingEditor.discount_percentage ?? 0} onChangeText={(discount_percentage: string) => setBillingEditor({ ...billingEditor, discount_percentage: discount_percentage as any })} /><Text style={styles.modalHint}>The server recalculates Yearly as Monthly × 12, then applies this discount. Vendors and Razorpay receive the same validated amount.</Text></>}
    <Field label="Grace days" numeric value={billingEditor.grace_period_days} onChangeText={(grace_period_days: string) => setBillingEditor({ ...billingEditor, grace_period_days: grace_period_days as any })} />
    <Toggle label="Free trial" value={Boolean(billingEditor.trial_enabled)} onValueChange={(trial_enabled: boolean) => setBillingEditor({ ...billingEditor, trial_enabled })} />
    {billingEditor.trial_enabled ? <Field label="Trial days" numeric value={billingEditor.trial_days} onChangeText={(trial_days: string) => setBillingEditor({ ...billingEditor, trial_days: trial_days as any })} /> : null}
  </ScrollView><Pressable disabled={saving} onPress={saveBillingOption} style={styles.primary}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Save billing option</Text>}</Pressable></View></View> : null}</Modal>
  </SafeAreaView>;
}

function EmptySection({ title, text }: { title: string; text: string }) { return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text><Text style={styles.panelText}>{text}</Text></View>; }
function ModalHeader({ title, close }: { title: string; close: () => void }) { return <View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={close} style={styles.headerButton}><X size={20} color="#1D1720" /></Pressable></View>; }
function Toggle({ label, value, onValueChange, disabled = false }: any) { return <View style={[styles.toggle, disabled && styles.controlDisabled]}><Text style={styles.toggleLabel}>{label}</Text><Switch value={value} disabled={disabled} onValueChange={onValueChange} trackColor={{ true: "#F7A5C1" }} thumbColor={value ? pink : "#EEE"} /></View>; }
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: adminPalette.canvas }, header: { height: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "rgba(255,255,255,.96)", borderBottomWidth: 1, borderBottomColor: adminPalette.border }, headerButton: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" }, logo: { position: "absolute", left: "50%", width: 155, height: 42, marginLeft: -77.5 }, content: { width: "100%", maxWidth: 1600, alignSelf: "center", padding: 18, paddingBottom: 110 }, flex: { flex: 1, minWidth: 0 },
  tabs: { gap: 7, paddingVertical: 16 }, tab: { minHeight: 40, paddingHorizontal: 15, borderRadius: 12, backgroundColor: adminPalette.surfaceSubtle, alignItems: "center", justifyContent: "center" }, tabActive: { backgroundColor: pink }, tabText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "700" }, tabTextActive: { color: "#FFF" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, stat: { flexGrow: 1, minWidth: 145, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 12, padding: 14 }, statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }, statValue: { color: adminPalette.text, fontSize: typeScale.metric, fontWeight: "700", marginTop: 9 }, statLabel: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginTop: 2 }, panel: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 18, marginTop: 12 }, panelTitle: { color: adminPalette.text, fontSize: typeScale.body, fontWeight: "700" }, panelText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, lineHeight: typeLeading.metadata, marginTop: 5 }, primary: { minHeight: 46, borderRadius: 14, backgroundColor: pink, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", marginTop: 15 }, primaryText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, marginBottom: 12 }, sectionTitle: { color: adminPalette.text, fontSize: typeScale.cardTitle, fontWeight: "700" }, sectionHint: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginTop: 3 }, add: { height: 42, borderRadius: 12, paddingHorizontal: 14, backgroundColor: pink, flexDirection: "row", alignItems: "center", gap: 5 }, addText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" }, list: { gap: 10 }, card: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }, cardTop: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 10 }, cardTitle: { color: adminPalette.text, fontSize: typeScale.body, fontWeight: "700", textTransform: "capitalize" }, cardSub: { color: adminPalette.textSecondary, fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 }, price: { width: "100%", color: adminPalette.text, fontSize: typeScale.metric, fontWeight: "700", marginTop: 5 }, period: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "600" }, cardActions: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, secondary: { minHeight: 38, borderRadius: 12, paddingHorizontal: 12, backgroundColor: adminPalette.surfaceSubtle, flexDirection: "row", alignItems: "center", gap: 5 }, secondaryText: { color: pink, fontSize: typeScale.caption, fontWeight: "700" }, iconDanger: { width: 40, height: 38, borderRadius: 12, backgroundColor: adminPalette.errorSubtle, alignItems: "center", justifyContent: "center" },
  planFacts: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, planFact: { color: adminPalette.text, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: typeScale.caption, fontWeight: "700" }, statusBadge: { color: adminPalette.textSecondary, backgroundColor: adminPalette.surfaceSubtle, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, fontSize: typeScale.caption, fontWeight: "700", textTransform: "capitalize" }, statusActive: { color: adminPalette.success, backgroundColor: adminPalette.successSubtle }, primaryInline: { minHeight: 38, borderRadius: 13, paddingHorizontal: 13, backgroundColor: pink, flexDirection: "row", alignItems: "center", gap: 5 },
  searchBox: { minHeight: 48, borderRadius: 16, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 }, searchInput: { flex: 1, color: adminPalette.text, fontSize: typeScale.metadata, outlineStyle: "none" } as any, retry: { color: pink, fontSize: typeScale.caption, fontWeight: "700" }, filters: { flexDirection: "row", gap: 7, paddingVertical: 11 }, filter: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: adminPalette.surfaceSubtle }, filterActive: { backgroundColor: pink }, filterText: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "700", textTransform: "capitalize" }, filterTextActive: { color: "#FFF" }, controlDisabled: { opacity: 0.55 }, vendorCard: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 19, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, vendorMeta: { color: adminPalette.textMuted, fontSize: typeScale.caption, marginTop: 3 }, manage: { color: pink, fontSize: typeScale.caption, fontWeight: "700" },
  error: { borderRadius: 16, padding: 14, backgroundColor: adminPalette.errorSubtle, flexDirection: "row", justifyContent: "space-between" }, errorText: { color: adminPalette.error, fontSize: typeScale.caption }, modalBackdrop: { flex: 1, backgroundColor: "rgba(25,15,21,.45)", justifyContent: "flex-end", padding: 10 }, modal: { width: "100%", maxWidth: 620, maxHeight: "90%", alignSelf: "center", backgroundColor: "#FFF", borderRadius: 27, padding: 18 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, modalTitle: { color: adminPalette.text, fontSize: typeScale.sectionTitle, fontWeight: "700" }, modalHint: { color: adminPalette.textSecondary, fontSize: typeScale.caption, marginBottom: 12 }, field: { flex: 1, minWidth: 130, marginTop: 10 }, fieldLabel: { color: adminPalette.textSecondary, fontSize: typeScale.caption, fontWeight: "700", marginBottom: 6, marginTop: 8, textTransform: "capitalize" }, input: { minHeight: 45, borderRadius: 14, backgroundColor: adminPalette.surface, paddingHorizontal: 12, color: adminPalette.text, fontSize: typeScale.metadata, borderWidth: 1, borderColor: adminPalette.border, outlineStyle: "none" } as any, inputDisabled: { opacity: 0.7 }, multiline: { height: 78, textAlignVertical: "top", paddingTop: 11 }, twoCols: { flexDirection: "row", gap: 9 }, toggle: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: adminPalette.border }, toggleLabel: { color: adminPalette.text, fontSize: typeScale.metadata, fontWeight: "700" }, toggleHint: { color: adminPalette.textSecondary, fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 }, limitInput: { width: 58, minHeight: 36, borderRadius: 11, backgroundColor: adminPalette.surface, paddingHorizontal: 8, fontSize: typeScale.caption, outlineStyle: "none" } as any, settingEdit: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8 }, settingInput: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: adminPalette.surface, paddingHorizontal: 10, fontSize: typeScale.caption, outlineStyle: "none" } as any,
});
