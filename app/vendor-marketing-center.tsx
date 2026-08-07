import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CircleAlert, Sparkles } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useAppTheme } from "@/components/ThemeProvider";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import WebsiteStatusCard from "@/components/vendor-marketing/WebsiteStatusCard";
import QuickActionsGrid from "@/components/vendor-marketing/QuickActionsGrid";
import QrCodeSection from "@/components/vendor-marketing/QrCodeSection";
import AnalyticsSummaryCard from "@/components/vendor-marketing/AnalyticsSummaryCard";
import MarketingTipsCard from "@/components/vendor-marketing/MarketingTipsCard";
import ProfileHealthCard from "@/components/vendor-marketing/ProfileHealthCard";
import {
  buildVendorPublicProfileUrl,
  getVendorProfileAnalytics,
  getVendorQrRecord,
  recordVendorProfileEvent,
  type VendorProfileAnalytics,
} from "@/services/vendorPublicProfile";
import { copyProfileLink, downloadQrCode, shareProfileLink, shareQrCode } from "@/components/vendor-marketing/shareActions";
import { typeScale, typeLeading } from "@/constants/typography";

export default function VendorMarketingCenter() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, loading, error, completion, refresh } = useVendorWorkspace();
  const desktop = width >= 900;
  const qrRef = useRef<any>(null);
  const [analytics, setAnalytics] = useState<VendorProfileAnalytics | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const vendor = data.vendor;
  const slug: string | undefined = vendor?.slug;
  const approved = vendor?.management_status === "active" && vendor?.public_profile_enabled !== false && Boolean(slug);
  const url = slug ? buildVendorPublicProfileUrl(slug) : "";
  const qrUrl = slug ? buildVendorPublicProfileUrl(slug, "qr") : "";

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  useEffect(() => {
    if (!vendor?.id || !approved) return;
    let active = true;
    getVendorProfileAnalytics(vendor.id)
      .then((result) => { if (active) setAnalytics(result); })
      .catch(() => { if (active) setAnalytics(null); });
    getVendorQrRecord(vendor.id)
      .then((record) => { if (active) setGeneratedAt(record?.generatedAt ?? null); })
      .catch(() => { if (active) setGeneratedAt(null); });
    return () => { active = false; };
  }, [vendor?.id, approved]);

  const handleOpenWebsite = useCallback(() => {
    if (!slug) return;
    void recordVendorProfileEvent(vendor.id, "website_click", "dashboard").catch(() => {});
    router.push({ pathname: "/vendors/[slug]", params: { slug } });
  }, [router, slug, vendor?.id]);

  const handleCopyLink = useCallback(() => {
    if (!vendor?.id || !url) return;
    void copyProfileLink(vendor.id, url);
  }, [vendor?.id, url]);

  const handleShareProfile = useCallback(() => {
    if (!vendor?.id || !slug) return;
    void shareProfileLink(vendor.id, vendor.business_name, slug, "marketing_center");
  }, [vendor?.id, vendor?.business_name, slug]);

  const handleDownloadQr = useCallback(() => {
    if (!slug || !qrUrl) return;
    void downloadQrCode(slug, qrUrl, qrRef);
  }, [slug, qrUrl]);

  const handleShareQr = useCallback(() => {
    if (!vendor?.id || !slug || !qrUrl) return;
    void shareQrCode(vendor.id, vendor.business_name, slug, qrUrl, qrRef);
  }, [vendor?.id, vendor?.business_name, slug, qrUrl]);

  const handleOpenMarketingCard = useCallback(() => {
    router.push("/vendor-marketing-card");
  }, [router]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, desktop && styles.desktopScroll]}
      >
        <VendorDashboardReveal>
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
              <Text style={[styles.emptyTitle, { color: colors.text }]}>My Business Website</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Your Business Website will become available after admin approval.
              </Text>
            </View>
          ) : null}

          {approved ? (
            <>
              <WebsiteStatusCard
                colors={colors}
                url={url}
                generatedAt={generatedAt}
                totalViews={analytics?.view?.count ?? 0}
                qrScans={analytics?.qr_scan?.count ?? 0}
              />
              <QuickActionsGrid
                colors={colors}
                onOpenWebsite={handleOpenWebsite}
                onCopyLink={handleCopyLink}
                onShareProfile={handleShareProfile}
                onDownloadQr={handleDownloadQr}
                onShareQr={handleShareQr}
                onMarketingCard={handleOpenMarketingCard}
              />
              <QrCodeSection
                colors={colors}
                qrUrl={qrUrl}
                qrRef={qrRef}
                onDownload={handleDownloadQr}
                onShare={handleShareQr}
              />
              <AnalyticsSummaryCard colors={colors} analytics={analytics} />
              <MarketingTipsCard colors={colors} />
              <ProfileHealthCard colors={colors} percent={completion.percent} items={completion.items} />
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
  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28, width: "100%", alignSelf: "center" },
  desktopScroll: { maxWidth: 720, paddingHorizontal: 0, paddingTop: 24, paddingBottom: 48 },
  notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  noticeText: { flex: 1, fontSize: typeScale.metadata, lineHeight: typeLeading.tab },
  emptyCard: { borderWidth: 1, borderRadius: 26, padding: 32, alignItems: "center", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: typeScale.editorialCardTitle, fontWeight: "700", marginBottom: 8 },
  emptyText: { fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, textAlign: "center" },
  loading: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
});
