import { useCallback } from "react";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useSubscription } from "@/context/SubscriptionContext";
import type { SubscriptionFeatureKey } from "@/subscriptions/types";

export function useSubscriptionAccess() {
  const subscription = useSubscription();
  const router = useRouter();

  const requireFeature = useCallback((feature: SubscriptionFeatureKey, action?: () => void) => {
    if (subscription.hasFeature(feature)) {
      action?.();
      return true;
    }
    Alert.alert(
      "Subscription required",
      "Choose or renew a RoyalLagn plan to use this Vendor feature.",
      [
        { text: "Not now", style: "cancel" },
        { text: "View plans", onPress: () => router.push({ pathname: "/VendorSubscription", params: { requiredFeature: feature } }) },
      ],
    );
    return false;
  }, [router, subscription]);

  return { ...subscription, requireFeature };
}
