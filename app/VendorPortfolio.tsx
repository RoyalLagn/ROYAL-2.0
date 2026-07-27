import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StandaloneMobileTabBar } from "@/components/MobileTabBar";
import PortfolioAlbums from "@/components/vendor-profile/PortfolioAlbums";
import { getApprovedPublicVendorById, type PublicVendorListing } from "@/services/publicVendorListings";

export default function VendorPortfolio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const [vendor, setVendor] = useState<PublicVendorListing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!vendorId) {
      setLoading(false);
      return;
    }
    getApprovedPublicVendorById(vendorId)
      .then((result) => { if (active) setVendor(result); })
      .catch(() => { if (active) setVendor(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vendorId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (vendorId) router.replace({ pathname: "/VendorsProfile", params: { vendorId } });
    else router.replace("/Categories");
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: Math.min(width, 1080),
          alignSelf: "center",
          paddingTop: Math.max(insets.top, 12) + 8,
          paddingBottom: 98 + insets.bottom,
        }}
      >
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to vendor profile" onPress={goBack} style={styles.back}>
            <ChevronLeft size={23} color="#20161B" />
          </Pressable>
          <View style={styles.copy}>
            <Text style={styles.title}>Portfolio</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{vendor ? `${vendor.name} · ${vendor.portfolioAlbums.length} albums` : "Vendor albums"}</Text>
          </View>
        </View>
        {loading ? <ActivityIndicator color="#E91E63" style={styles.loader} /> : vendor?.portfolioAlbums.length ? (
          <PortfolioAlbums
            albums={vendor.portfolioAlbums}
            mode="all"
            showHeading={false}
            onOpenAlbum={(album) => router.push({
              pathname: "/VendorAlbum",
              params: { vendorId: vendor.id, albumId: album.id },
            })}
          />
        ) : (
          <View style={styles.empty}><Text style={styles.emptyTitle}>Portfolio coming soon</Text><Text style={styles.emptyText}>This vendor has not published any albums yet.</Text></View>
        )}
      </ScrollView>
      <StandaloneMobileTabBar activeRoute="Categories" />
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFF9FB" },
  header: { minHeight: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  back: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: "#F0DCE4", backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  title: { color: "#24181E", fontFamily: serif, fontSize: 24, lineHeight: 30, fontWeight: "700" },
  subtitle: { color: "#796A72", fontSize: 11, lineHeight: 15, marginTop: 1 },
  loader: { marginTop: 80 },
  empty: { margin: 16, minHeight: 190, borderWidth: 1, borderColor: "#F0DCE4", borderRadius: 20, backgroundColor: "#FFF", alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { color: "#24181E", fontFamily: serif, fontSize: 20, fontWeight: "700" },
  emptyText: { color: "#796A72", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 },
});
