import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CircleAlert, Download, Sparkles } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { buildVendorPublicProfileUrl } from "@/services/vendorPublicProfile";
import { updateVendorPublicProfile } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import { portfolioMediaUrl, type VendorPortfolioMedia } from "@/services/vendorPortfolio";
import { getReviewSummary } from "@/services/reviews";
import {
  getVendorMarketingCardExtra,
  saveVendorMarketingCardExtra,
} from "@/services/marketingCardService";
import { getMarketingHighlights } from "@/components/vendor-marketing-card/MarketingHighlights";
import MarketingCardPreview, { type MarketingCardData } from "@/components/vendor-marketing-card/MarketingCardPreview";
import MarketingCardForm, {
  type MarketingCardFormErrors,
  type MarketingCardFormValues,
} from "@/components/vendor-marketing-card/MarketingCardForm";
import { HiddenExportCard, exportMarketingCardPdf } from "@/components/vendor-marketing-card/MarketingCardPdf";
import { typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9]{10,15}$/;

function categoryNameOf(vendor: any): string {
  const relation = vendor?.categories;
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.name?.trim() || "";
}

function resolveCoverImageUrl(data: { heroMedia: any[]; media: any[] }): string | null {
  const heroId = data.heroMedia?.[0]?.media_id;
  const heroRow = data.media?.find((item) => item.id === heroId);
  const fallbackRow = data.media?.find((item) => item.resource_type === "image" && item.upload_status === "completed");
  const media = (heroRow ?? fallbackRow) as VendorPortfolioMedia | undefined;
  return media ? portfolioMediaUrl(media, "hero") : null;
}

const EMPTY_VALUES: MarketingCardFormValues = {
  mobileNumber: "",
  whatsappNumber: "",
  email: "",
  instagram: "",
  website: "",
  tagline: "",
  experienceYears: "",
  happyClients: "",
};

export default function VendorMarketingCard() {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, refresh } = useVendorWorkspace();
  const desktop = width >= 900;
  // The card is a fixed 3:2 landscape canvas; width drives the whole render.
  const previewWidth = Math.min(desktop ? 660 : width - 32, 660);

  const [values, setValues] = useState<MarketingCardFormValues>(EMPTY_VALUES);
  const [hydrated, setHydrated] = useState(false);
  const [rating, setRating] = useState({ average: 0, count: 0 });
  const [saving, setSaving] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const exportRef = useRef<any>(null);

  const vendor = data.vendor;
  const slug: string | undefined = vendor?.slug;
  const approved = vendor?.management_status === "active" && vendor?.public_profile_enabled !== false && Boolean(slug);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Auto-load: prefill the reused fields from the vendor's existing profile
  // and the marketing-card-only fields from vendor_marketing_cards, once,
  // the first time the vendor's data arrives. After that the vendor's own
  // edits in the form below are the source of truth for this session.
  useEffect(() => {
    if (!vendor?.id || hydrated) return;
    let active = true;
    getVendorMarketingCardExtra(vendor.id)
      .then((extra) => {
        if (!active) return;
        setValues({
          mobileNumber: vendor.contact_phone ?? "",
          whatsappNumber: extra?.whatsappNumber ?? "",
          email: vendor.contact_email ?? "",
          instagram: vendor.instagram ?? "",
          website: vendor.website ?? "",
          tagline: extra?.businessTagline ?? "",
          experienceYears: vendor.experience != null ? String(vendor.experience) : "",
          happyClients: extra?.happyClients ?? "",
        });
        setHydrated(true);
      })
      .catch(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, [vendor, hydrated]);

  useEffect(() => {
    if (!vendor?.id || !approved) return;
    let active = true;
    getReviewSummary(vendor.id)
      .then((summary) => { if (active) setRating({ average: summary.average_rating, count: summary.review_count }); })
      .catch(() => {});
    return () => { active = false; };
  }, [vendor?.id, approved]);

  const setField = useCallback(<K extends keyof MarketingCardFormValues>(key: K, value: MarketingCardFormValues[K]) => {
    setDownloaded(false);
    setDownloadError("");
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const errors = useMemo<MarketingCardFormErrors>(() => {
    const next: MarketingCardFormErrors = {};
    if (!values.mobileNumber.trim()) next.mobileNumber = "Mobile number is required.";
    else if (!PHONE_PATTERN.test(values.mobileNumber.replace(/\D/g, ""))) next.mobileNumber = "Enter a valid mobile number.";
    if (!values.whatsappNumber.trim()) next.whatsappNumber = "WhatsApp number is required.";
    else if (!PHONE_PATTERN.test(values.whatsappNumber.replace(/\D/g, ""))) next.whatsappNumber = "Enter a valid WhatsApp number.";
    if (!values.email.trim()) next.email = "Email address is required.";
    else if (!EMAIL_PATTERN.test(values.email.trim())) next.email = "Enter a valid email address.";
    if (!values.instagram.trim()) next.instagram = "Instagram username is required.";
    if (values.website.trim() && !/^https?:\/\/.+\..+/i.test(values.website.trim())) next.website = "Enter a valid URL (https://...).";
    if (!values.tagline.trim()) next.tagline = "Business tagline is required.";
    if (!values.experienceYears.trim()) next.experienceYears = "Years of experience is required.";
    if (!values.happyClients.trim()) next.happyClients = "Happy clients is required.";
    return next;
  }, [values]);

  const isValid = Object.keys(errors).length === 0;

  const category = categoryNameOf(vendor);
  const highlights = useMemo(() => getMarketingHighlights(category), [category]);
  const coverImageUrl = useMemo(() => resolveCoverImageUrl(data), [data]);
  // Printed on the card and encoded in its QR: the vendor's existing
  // permanent public profile URL. Built from the permanent `slug` rather
  // than read from vendor_qr_codes.qr_url because that column hardcodes
  // https://royallagn.com (see 20260804180000_vendor_public_profiles.sql)
  // while buildVendorPublicProfileUrl honours EXPO_PUBLIC_WEB_APP_URL --
  // same permanent path, correct configured domain. No ?src= suffix: a
  // printed card must scan to exactly https://<domain>/vendors/<slug>.
  const profileUrl = slug ? buildVendorPublicProfileUrl(slug) : "";

  const cardData: MarketingCardData = {
    businessName: vendor?.business_name || "Your Business Name",
    category: category || "Wedding Vendor",
    logoUrl: vendor?.logo_url ?? null,
    coverImageUrl,
    city: vendor?.city ?? "",
    state: vendor?.state ?? "",
    profileUrl: profileUrl || "https://royallagn.com",
    rating: rating.average,
    reviewCount: rating.count,
    isVerified: Boolean(vendor?.is_verified),
    highlights,
    mobileNumber: values.mobileNumber,
    whatsappNumber: values.whatsappNumber,
    email: values.email,
    instagram: values.instagram,
    website: values.website,
    tagline: values.tagline || "Capturing Moments, Creating Memories",
    experienceYears: values.experienceYears || "0",
    happyClients: values.happyClients || "—",
  };

  const handleDownload = useCallback(async () => {
    if (!vendor?.id) return;
    if (!isValid) {
      setDownloadError("Please complete your Marketing Card information before downloading.");
      return;
    }
    setSaving(true);
    setDownloadError("");
    setDownloaded(false);
    try {
      await Promise.all([
        updateVendorPublicProfile({
          contact_phone: values.mobileNumber.trim(),
          contact_email: values.email.trim().toLowerCase(),
          instagram: values.instagram.trim(),
          website: values.website.trim() || null,
          experience: Number(values.experienceYears) || null,
        }),
        saveVendorMarketingCardExtra(vendor.id, {
          whatsappNumber: values.whatsappNumber,
          businessTagline: values.tagline,
          happyClients: values.happyClients,
        }),
      ]);
      invalidatePublicVendorCache();
      await exportMarketingCardPdf(exportRef, vendor.business_name || "vendor");
      setDownloaded(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to generate the marketing card.";
      setDownloadError(message);
      Alert.alert("Not downloaded", message);
    } finally {
      setSaving(false);
    }
  }, [isValid, values, vendor]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}>
        <VendorDashboardReveal>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Marketing Card</Text>
          <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
            One premium, print-ready RoyalLagn card for your business -- generated from your live profile.
          </Text>

          {error ? (
            <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CircleAlert size={18} color={colors.warning} />
              <Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text>
            </View>
          ) : null}

          {!loading && !approved ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.pink }]}>
                <Sparkles size={24} color="#FFF" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Marketing Card</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Your Marketing Card will become available after admin approval.
              </Text>
            </View>
          ) : null}

          {approved ? (
            <>
              <View style={styles.previewWrap}>
                <MarketingCardPreview data={cardData} width={previewWidth} />
              </View>
              <HiddenExportCard data={cardData} hostRef={exportRef} />

              <MarketingCardForm colors={colors} values={values} errors={errors} onChange={setField} />

              {downloadError ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <CircleAlert size={18} color={colors.warning} />
                  <Text style={[styles.noticeText, { color: colors.warning }]}>{downloadError}</Text>
                </View>
              ) : null}
              {downloaded ? (
                <Text style={[styles.downloadedText, { color: colors.success }]}>Marketing card downloaded.</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={handleDownload}
                style={({ pressed }) => [
                  styles.downloadButton,
                  { backgroundColor: colors.pink },
                  (pressed || saving) && styles.pressed,
                  !isValid && styles.downloadButtonDisabled,
                ]}
              >
                {saving ? <ActivityIndicator color="#FFF" /> : <Download size={18} color="#FFF" />}
                <Text style={styles.downloadButtonText}>{saving ? "Preparing your card…" : "Download Marketing Card (PDF)"}</Text>
              </Pressable>
            </>
          ) : null}
        </VendorDashboardReveal>
      </ScrollView>
      {loading && !vendor ? (
        <View style={styles.loading}><ActivityIndicator color={colors.pink} /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, width: "100%", alignSelf: "center" },
  desktopScroll: { maxWidth: 720, paddingHorizontal: 0, paddingTop: 24, paddingBottom: 56 },
  pageTitle: { fontSize: typeScale.metric, fontWeight: "700" },
  pageSubtitle: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, marginTop: 4, marginBottom: 16 },
  notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeText: { flex: 1, fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
  emptyCard: { borderWidth: 1, borderRadius: 26, padding: 32, alignItems: "center", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700", marginBottom: 8 },
  emptyText: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center" },
  previewWrap: { alignItems: "center", marginBottom: 18 },
  downloadedText: { fontSize: typeScale.metadata, fontWeight: "700", textAlign: "center", marginBottom: 10 },
  downloadButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 54, borderRadius: 18, marginTop: 4 },
  downloadButtonDisabled: { opacity: 0.55 },
  downloadButtonText: { color: "#FFF", fontSize: typeScale.body, fontWeight: "700" },
  pressed: { opacity: 0.88 },
  loading: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
});
