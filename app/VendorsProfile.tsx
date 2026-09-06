import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import PageLoader from "@/components/loading/PageLoader";
import { brandColors } from "@/constants/brandPalette";
import { getApprovedPublicVendorById } from "@/services/publicVendorListings";

/** Backward-compatible redirect for old ID-based vendor profile links. */
export default function LegacyVendorProfileRedirect() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const colors = brandColors(colorScheme === "dark");
  const params = useLocalSearchParams<{ vendorId?: string; src?: string }>();
  const vendorId = Array.isArray(params.vendorId) ? params.vendorId[0] : params.vendorId;
  const source = Array.isArray(params.src) ? params.src[0] : params.src;
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!vendorId) {
      setError("This vendor link is incomplete.");
      return () => { active = false; };
    }

    getApprovedPublicVendorById(vendorId)
      .then((vendor) => {
        if (!active) return;
        if (!vendor?.slug) {
          setError("This vendor profile is no longer available.");
          return;
        }
        router.replace({
          pathname: "/vendor/[slug]",
          params: { slug: vendor.slug, ...(source ? { src: source } : {}) },
        });
      })
      .catch(() => {
        if (active) setError("Unable to open this vendor profile. Please try again.");
      });

    return () => { active = false; };
  }, [router, source, vendorId]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {error ? (
        <View style={styles.message}>
          <Text accessibilityRole="alert" style={[styles.title, { color: colors.foreground }]}>{error}</Text>
        </View>
      ) : <PageLoader />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  message: { flex: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, lineHeight: 24, fontWeight: "600", textAlign: "center" },
});
