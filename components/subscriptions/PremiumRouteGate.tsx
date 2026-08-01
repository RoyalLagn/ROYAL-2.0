import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSubscription } from "@/context/SubscriptionContext";
import { useVendorSession } from "@/context/VendorSessionContext";
import type { SubscriptionFeatureKey } from "@/subscriptions/types";

export default function PremiumRouteGate({ feature, children }: React.PropsWithChildren<{ feature: SubscriptionFeatureKey }>) {
  const router = useRouter();
  const { isPreviewMode } = useVendorSession();
  const { loading, platformAvailable, hasFeature } = useSubscription();
  const allowed = isPreviewMode || !platformAvailable || hasFeature(feature);
  useEffect(() => {
    if (!loading && platformAvailable && !allowed) {
      router.replace({ pathname: "/VendorSubscription", params: { requiredFeature: feature } });
    }
  }, [allowed, feature, loading, platformAvailable, router]);
  if (loading && !platformAvailable) return <View style={styles.loading}><ActivityIndicator color="#E91E63" /></View>;
  if (!allowed) return <View style={styles.loading}><ActivityIndicator color="#E91E63" /></View>;
  return <>{children}</>;
}
const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF9FB" } });
