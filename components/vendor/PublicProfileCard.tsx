import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import {
  Copy,
  ExternalLink,
  QrCode,
  Settings,
  Share2,
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

export default function PublicProfileCard({ vendor }: { vendor: any }) {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const router = useRouter();
  const qrRef = useRef<any>(null);
  const [copied, setCopied] = useState(false);
  const [comingSoonNote, setComingSoonNote] = useState("");
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

  const showComingSoon = useCallback((feature: string) => {
    setComingSoonNote(`${feature} is coming in a future update.`);
    setTimeout(() => setComingSoonNote(""), 2500);
  }, []);

  if (!slug) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <QrCode size={22} color="#FFF" />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Public Profile</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Your public profile link and QR code will appear here once your business is approved.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: colors.pink }]}>
          <QrCode size={22} color="#FFF" />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>Public Profile</Text>
          <Text style={[styles.url, { color: colors.pink }]} numberOfLines={1}>{url}</Text>
        </View>
      </View>

      <View style={styles.qrRow}>
        <View ref={qrRef} collapsable={false} style={[styles.qrWrap, { borderColor: colors.border }]}>
          <QRCode value={qrUrl} size={104} backgroundColor="#FFFFFF" />
        </View>
        <View style={styles.actionsCol}>
          <ActionButton label="Copy Link" icon={<Copy size={15} color={colors.pink} />} colors={colors} onPress={handleCopy} />
          <ActionButton label="Open Profile" icon={<ExternalLink size={15} color={colors.pink} />} colors={colors} onPress={() => router.push({ pathname: "/vendors/[slug]", params: { slug } })} />
          <ActionButton label="Share" icon={<Share2 size={15} color={colors.pink} />} colors={colors} onPress={handleShare} />
          <ActionButton label="Download QR" icon={<QrCode size={15} color={colors.pink} />} colors={colors} onPress={handleDownload} />
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
        <StatTile label="Views" value={analytics?.view?.count ?? 0} colors={colors} />
        <StatTile label="Visitors" value={analytics?.view?.uniqueVisitors ?? 0} colors={colors} />
        <StatTile label="QR Scans" value={analytics?.view?.bySource?.qr ?? 0} colors={colors} />
        <StatTile label="Shares" value={analytics?.link_share?.count ?? 0} colors={colors} />
        <StatTile label="Enquiries" value={analytics?.enquiry?.count ?? 0} colors={colors} />
      </View>

      <View style={styles.footerRow}>
        <Pressable onPress={() => showComingSoon("Profile settings")} style={({ pressed }) => [styles.footerButton, styles.footerButtonWide, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressed]}>
          <Text style={[styles.footerButtonText, { color: colors.text }]}>Profile Settings</Text>
        </Pressable>
      </View>
      {comingSoonNote ? <Text style={[styles.analyticsNote, { color: colors.muted }]}>{comingSoonNote}</Text> : null}
    </View>
  );
}

function ActionButton({ label, icon, colors, onPress }: { label: string; icon: React.ReactNode; colors: typeof vendorTheme.light; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressed]}
    >
      {icon}
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function StatTile({ label, value, colors }: { label: string; value: number; colors: typeof vendorTheme.light }) {
  return (
    <View style={styles.statTile}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 16, marginBottom: 16, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 18, elevation: 2 },
  headerRow: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  icon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, fontWeight: "900" },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  url: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  qrRow: { flexDirection: "row", gap: 14, marginTop: 14, alignItems: "flex-start" },
  qrWrap: { padding: 8, borderRadius: 14, borderWidth: 1, backgroundColor: "#FFFFFF" },
  actionsCol: { flex: 1, gap: 8 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  actionLabel: { fontSize: 11, fontWeight: "700" },
  copiedText: { fontSize: 10, fontWeight: "700", marginTop: 8 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  settingsLabel: { flex: 1, fontSize: 11, fontWeight: "700" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  statTile: { minWidth: 62, alignItems: "center" },
  statValue: { fontSize: 15, fontWeight: "900" },
  statLabel: { fontSize: 9, fontWeight: "700", marginTop: 2 },
  footerRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  footerButton: { flex: 1, minHeight: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  footerButtonWide: { flex: 1 },
  footerButtonText: { fontSize: 11, fontWeight: "700" },
  analyticsNote: { fontSize: 9, marginTop: 8 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
