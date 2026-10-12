import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CircleAlert, Sparkles } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { VENDOR_TAB_BASE_HEIGHT } from "@/components/vendor/VendorBottomNav";
import { MotionStagger } from "@/utils/motion";
import WebsiteStatusCard from "@/components/vendor-marketing/WebsiteStatusCard";
import QuickActionsGrid from "@/components/vendor-marketing/QuickActionsGrid";
import QrCodeSection from "@/components/vendor-marketing/QrCodeSection";
import AnalyticsSummaryCard from "@/components/vendor-marketing/AnalyticsSummaryCard";
import MarketingTipsCard from "@/components/vendor-marketing/MarketingTipsCard";
import {
  buildVendorPublicProfileUrl,
  getVendorProfileAnalytics,
  getVendorQrRecord,
  recordVendorProfileEvent,
  subscribeVendorProfileAnalytics,
  type VendorProfileAnalytics,
} from "@/services/vendorPublicProfile";
import { copyProfileLink, downloadQrCode, shareProfileLink, shareQrCode } from "@/components/vendor-marketing/shareActions";
import { typeScale, typeLeading } from "@/constants/typography";
import { useAppFeedback } from "@/context/AppFeedbackContext";

export default function VendorMarketingCenter() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess, showError } = useAppFeedback();
  const { data, loading, error, refresh } = useVendorWorkspace();
  const desktop = width >= 900;
  const pageGap = desktop ? 20 : 16;
  const qrRef = useRef<any>(null);
  const [analytics, setAnalytics] = useState<VendorProfileAnalytics | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const vendor = data.vendor;
  const slug: string | undefined = vendor?.slug;
  const available = vendor?.public_profile_enabled !== false && Boolean(slug);
  const url = slug ? buildVendorPublicProfileUrl(slug) : "";
  const qrUrl = slug ? buildVendorPublicProfileUrl(slug, "qr") : "";

  const loadAnalytics = useCallback(() => {
    if (!vendor?.id || !available) return;
    getVendorProfileAnalytics(vendor.id)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [available, vendor?.id]);

  useFocusEffect(useCallback(() => {
    refresh();
    loadAnalytics();
  }, [loadAnalytics, refresh]));

  useEffect(() => {
    if (!vendor?.id || !available) return;
    return subscribeVendorProfileAnalytics(vendor.id, () => {
      loadAnalytics();
      void refresh();
    });
  }, [available, loadAnalytics, refresh, vendor?.id]);

  useEffect(() => {
    if (!vendor?.id || !available) return;
    let active = true;
    getVendorQrRecord(vendor.id)
      .then((record) => { if (active) setGeneratedAt(record?.generatedAt ?? null); })
      .catch(() => { if (active) setGeneratedAt(null); });
    return () => { active = false; };
  }, [vendor?.id, available]);

  const handleOpenWebsite = useCallback(() => {
    if (!slug) return;
    void recordVendorProfileEvent(vendor.id, "website_click", "dashboard").catch(() => {});
    router.push({ pathname: "/vendors/[slug]", params: { slug, src: "vendor_preview" } });
  }, [router, slug, vendor?.id]);

  const handleCopyLink = useCallback(() => {
    if (!vendor?.id || !url) return;
    void copyProfileLink(vendor.id, url)
      .then(() => {
        showSuccess("Profile link copied");
        loadAnalytics();
      })
      .catch(() => showError("Profile link could not be copied"));
  }, [loadAnalytics, showError, showSuccess, vendor?.id, url]);

  const handleShareProfile = useCallback(() => {
    if (!vendor?.id || !slug) return;
    void shareProfileLink(vendor.id, vendor.business_name, slug, "marketing_center")
      .then((result) => {
        if (result === "dismissed" || result === "skipped") return;
        showSuccess(result === "copied" ? "Profile link copied" : "Profile shared");
        loadAnalytics();
      })
      .catch(() => showError("Profile could not be shared"));
  }, [loadAnalytics, showError, showSuccess, slug, vendor?.business_name, vendor?.id]);

  const handleDownloadQr = useCallback(() => {
    if (!slug || !qrUrl) return;
    void downloadQrCode(slug, qrUrl, qrRef)
      .then(() => showSuccess("QR code downloaded"))
      .catch(() => showError("QR code could not be downloaded"));
  }, [qrUrl, showError, showSuccess, slug]);

  const handleShareQr = useCallback(() => {
    if (!vendor?.id || !slug || !qrUrl) return;
    void shareQrCode(vendor.id, vendor.business_name, slug, qrUrl, qrRef)
      .then((result) => {
        if (result === "dismissed") return;
        showSuccess(result === "copied" ? "Profile link copied" : "QR code ready to share");
        loadAnalytics();
      })
      .catch(() => showError("QR code could not be shared"));
  }, [loadAnalytics, qrUrl, showError, showSuccess, slug, vendor?.business_name, vendor?.id]);

  const handleOpenMarketingCard = useCallback(() => {
    router.push("/vendor-marketing-card");
  }, [router]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader />
      <ScrollView
        style={styles.scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: desktop ? 24 : 16, paddingTop: desktop ? 20 : 12, gap: pageGap, paddingBottom: desktop ? 32 : 28 + VENDOR_TAB_BASE_HEIGHT },
          desktop && styles.desktopScroll,
        ]}
      >
        {error ? (
          <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CircleAlert size={18} color={colors.warning} />
            <Text style={[styles.noticeText, { color: colors.muted }]}>{error}</Text>
          </View>
        ) : null}

        {!loading && !available ? (
          <VendorDashboardReveal>
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.pink }]}>
                <Sparkles size={24} color="#FFF" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>My Business Website</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Your Business Website is being prepared. Refresh in a moment.
              </Text>
            </View>
          </VendorDashboardReveal>
        ) : null}

        {available ? (
          <>
            <Text style={[styles.pageTitle, { color: colors.text }]}>Marketing Tools</Text>
            <VendorDashboardReveal style={styles.block}>
              <View style={desktop ? styles.row : styles.stack}>
                <View style={styles.col}>
                  <WebsiteStatusCard
                    colors={colors}
                    url={url}
                    onOpen={handleOpenWebsite}
                    generatedAt={generatedAt}
                    totalViews={Number(vendor.profile_views ?? 0)}
                    qrScans={analytics?.view?.bySource?.qr ?? 0}
                  />
                </View>
                <View style={styles.col}>
                  <QuickActionsGrid
                    colors={colors}
                    onOpenWebsite={handleOpenWebsite}
                    onCopyLink={handleCopyLink}
                    onShareProfile={handleShareProfile}
                    onDownloadQr={handleDownloadQr}
                    onShareQr={handleShareQr}
                    onMarketingCard={handleOpenMarketingCard}
                  />
                </View>
              </View>
            </VendorDashboardReveal>
            <VendorDashboardReveal delay={MotionStagger.item} style={styles.block}>
              <View style={desktop ? styles.row : styles.stack}>
                <View style={desktop ? styles.qrCol : styles.col}>
                  <QrCodeSection
                    colors={colors}
                    qrUrl={qrUrl}
                    qrRef={qrRef}
                    onDownload={handleDownloadQr}
                    onShare={handleShareQr}
                  />
                </View>
                <View style={styles.col}>
                  <AnalyticsSummaryCard
                    colors={colors}
                    analytics={analytics}
                    profileViews={Number(vendor.profile_views ?? 0)}
                    totalEnquiries={data.stats.totalEnquiries}
                    whatsappEnquiries={data.stats.whatsappEnquiries}
                    callEnquiries={data.stats.callEnquiries}
                  />
                </View>
              </View>
            </VendorDashboardReveal>
            <VendorDashboardReveal delay={MotionStagger.item * 2} style={styles.block}>
              <MarketingTipsCard colors={colors} />
            </VendorDashboardReveal>
          </>
        ) : null}
      </ScrollView>
      {loading && !vendor ? (
        <View style={styles.loading}><ActivityIndicator color={colors.pink} /></View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroller: { flex: 1, minWidth: 0 },
  scroll: { width: "100%", alignSelf: "center", minWidth: 0 },
  pageTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700" },
  block: { width: "100%", minWidth: 0 },
  row: { flexDirection: "row", alignItems: "stretch", gap: 20, width: "100%", minWidth: 0 },
  stack: { width: "100%", minWidth: 0, gap: 16 },
  col: { flex: 1, minWidth: 0 },
  qrCol: { width: 280, maxWidth: "100%", minWidth: 0 },
  desktopScroll: { maxWidth: 1400, width: "100%" },
  notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeText: { flex: 1, fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
  emptyCard: { borderWidth: 1, borderRadius: 26, padding: 32, alignItems: "center", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700", marginBottom: 8 },
  emptyText: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center" },
  loading: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
});
