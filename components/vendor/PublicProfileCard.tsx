import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import {
  Copy,
  ExternalLink,
  QrCode,
  Settings,
  Share2,
  Sparkles,
} from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import {
  buildVendorPublicProfileUrl,
  getVendorProfileAnalytics,
  recordVendorProfileEvent,
  type VendorProfileAnalytics,
} from "@/services/vendorPublicProfile";
import { shareVendorProfile } from "@/services/vendorShare";
import { typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";

export default function PublicProfileCard({ vendor, totalEnquiries }: { vendor: any; totalEnquiries: number }) {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const compactStats = width <= 480;
  const router = useRouter();
  const qrRef = useRef<any>(null);
  const [copied, setCopied] = useState(false);
  const [analytics, setAnalytics] = useState<VendorProfileAnalytics | null>(null);
  const enabled = vendor?.public_profile_enabled !== false;
  const slug: string | undefined = vendor?.slug;
  const url = slug ? buildVendorPublicProfileUrl(slug) : "";
  const qrUrl = slug ? buildVendorPublicProfileUrl(slug, "qr") : "";

  useEffect(() => {
    if (!vendor?.id) return;
    let active = true;
    getVendorProfileAnalytics(vendor.id)
      .then((data) => { if (active) setAnalytics(data); })
      .catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [vendor?.id]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    void recordVendorProfileEvent(vendor.id, "copy_link").catch(() => {});
  }, [url, vendor?.id]);

  const handleShare = useCallback(async () => {
    if (!slug) return;
    await shareVendorProfile({
      vendorId: vendor.id,
      vendorName: vendor.business_name,
      slug,
    });
    void recordVendorProfileEvent(vendor.id, "link_share", "dashboard").catch(() => {});
  }, [vendor?.id, vendor?.business_name, slug]);

  const handleDownload = useCallback(async () => {
    if (!slug || !qrUrl) return;
    if (Platform.OS === "web") {
      const QRCodeLib = await import("qrcode");
      const dataUrl = await QRCodeLib.toDataURL(qrUrl, { width: 512, margin: 2 });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${slug}-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    const [ViewShot, Sharing] = await Promise.all([
      import("react-native-view-shot"),
      import("expo-sharing"),
    ]);
    if (!qrRef.current) return;
    const uri = await ViewShot.captureRef(qrRef, { format: "png", quality: 1 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  }, [qrUrl, slug]);

  if (!slug) {
    return (
      <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <QrCode size={22} color="#FFF" />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Public Profile</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Your public profile link and QR code are being prepared. Refresh in a moment.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, desktop && styles.cardDesktop, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <QrCode size={22} color="#FFF" />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Public Profile</Text>
          <Text style={[styles.url, { color: colors.pink }]} numberOfLines={1}>{url}</Text>
        </View>
      </View>

      <View style={[styles.qrRow, desktop && styles.qrRowDesktop]}>
        <View ref={qrRef} testID="public-profile-qr" collapsable={false} style={[styles.qrWrap, { borderColor: colors.border }]}>
          <QRCode value={qrUrl} size={104} backgroundColor="#FFFFFF" />
        </View>
        <View testID="public-profile-actions" style={[styles.actionsCol, desktop && styles.actionsColDesktop]}>
          <ActionButton desktop={desktop} label="Copy Link" icon={<Copy size={15} color={colors.pink} />} colors={colors} onPress={handleCopy} />
          <ActionButton desktop={desktop} label="Open Profile" icon={<ExternalLink size={15} color={colors.pink} />} colors={colors} onPress={() => router.push({ pathname: "/vendors/[slug]", params: { slug, src: "vendor_preview" } })} />
          <ActionButton desktop={desktop} label="Share" icon={<Share2 size={15} color={colors.pink} />} colors={colors} onPress={handleShare} />
          <ActionButton desktop={desktop} label="Download QR" icon={<QrCode size={15} color={colors.pink} />} colors={colors} onPress={handleDownload} />
        </View>
      </View>

      {copied ? <Text style={[styles.copiedText, { color: colors.success }]}>Link copied to clipboard.</Text> : null}

      {!enabled ? (
        <View style={[styles.settingsRow, { borderColor: colors.border }]}>
          <Settings size={15} color={colors.warning} />
          <Text style={[styles.settingsLabel, { color: colors.warning }]}>
            Your public profile is currently hidden by RoyalLagn admin.
          </Text>
        </View>
      ) : null}

      <View style={[styles.statsRow, { borderColor: colors.border }]}>
        <StatTile label={compactStats ? "Profile\nViews" : "Profile Views"} value={Number(vendor.profile_views ?? 0)} compact={compactStats} colors={colors} />
        <StatTile label={compactStats ? "Unique\nVisitors" : "Unique Visitors"} value={analytics?.view?.uniqueVisitors ?? 0} compact={compactStats} colors={colors} />
        <StatTile label={compactStats ? "QR\nScans" : "QR Scans"} value={analytics?.view?.bySource?.qr ?? 0} compact={compactStats} colors={colors} />
        <StatTile label="Shares" value={analytics?.link_share?.count ?? 0} compact={compactStats} colors={colors} />
        <StatTile label="Enquiries" value={totalEnquiries} compact={compactStats} colors={colors} />
      </View>

      <View style={styles.footerRow}>
        <Pressable
          onPress={() => router.push("/vendor-marketing-card")}
          accessibilityRole="button"
          accessibilityLabel="Open Marketing Card"
          style={({ pressed, hovered, focused }) => [
            styles.footerButton,
            styles.footerButtonWide,
            { backgroundColor: colors.pink },
            (hovered || focused) && styles.hoverLift,
            pressed && styles.pressed,
          ]}
        >
          <Sparkles size={14} color="#FFF" />
          <Text style={[styles.footerButtonText, { color: "#FFF" }]}>Marketing Card</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActionButton({ desktop, label, icon, colors, onPress }: { desktop: boolean; label: string; icon: React.ReactNode; colors: typeof vendorTheme.light; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered, focused }) => [
        styles.actionButton,
        desktop && styles.actionButtonDesktop,
        { backgroundColor: colors.surfaceSoft },
        (hovered || focused) && styles.hoverLift,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function StatTile({ label, value, compact, colors }: { label: string; value: number; compact: boolean; colors: typeof vendorTheme.light }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, compact && styles.statValueCompact, { color: colors.text }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.statLabel, compact && styles.statLabelCompact, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 18, shadowColor: "#7D3D58", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.055, shadowRadius: 22, elevation: 2 },
  cardDesktop: { paddingHorizontal: 24, paddingVertical: 22 },
  headerRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", shadowColor: "#ED1762", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 2 },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  hint: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 4 },
  url: { fontSize: typeScale.metadata, fontWeight: "700", marginTop: 3 },
  qrRow: { flexDirection: "row", gap: 16, marginTop: 18, alignItems: "center" },
  qrRowDesktop: { gap: 22, alignItems: "center" },
  qrWrap: { padding: 9, borderRadius: 16, borderWidth: 1, backgroundColor: "#FFFFFF", shadowColor: "#3A2630", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1 },
  actionsCol: { flex: 1, gap: 10 },
  actionsColDesktop: { flexDirection: "row", flexWrap: "wrap", alignContent: "center" },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 44, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10 },
  actionButtonDesktop: { width: "49%", minHeight: 46 },
  actionLabel: { fontSize: typeScale.metadata, fontWeight: "700" },
  copiedText: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 8 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  settingsLabel: { flex: 1, fontSize: typeScale.metadata, fontWeight: "700" },
  statsRow: { flexDirection: "row", marginTop: 18, paddingTop: 17, borderTopWidth: 1 },
  statTile: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 4 },
  statValue: { fontSize: typeScale.body, fontWeight: "700" },
  statValueCompact: { fontSize: 14 },
  statLabel: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 2, textAlign: "center" },
  statLabelCompact: { fontSize: 10, lineHeight: 12 },
  footerRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  footerButton: { flex: 1, minHeight: 44, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, shadowColor: "#ED1762", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 2 },
  footerButtonWide: { flex: 1 },
  footerButtonText: { fontSize: typeScale.metadata, fontWeight: "700" },
  hoverLift: { transform: [{ translateY: -2 }], shadowOpacity: 0.14 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
