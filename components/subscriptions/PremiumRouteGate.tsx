import React, { useEffect } from "react";
import { useRouter } from "expo-router";
import { useSubscription } from "@/context/SubscriptionContext";
import { useVendorSession } from "@/context/VendorSessionContext";
import type { SubscriptionFeatureKey } from "@/subscriptions/types";
import PageLoader from "@/components/loading/PageLoader";
import { EliteClipsUpgradeState } from "@/components/subscriptions/EliteClipsUpgradeState";

export default function PremiumRouteGate({ feature, children }: React.PropsWithChildren<{ feature: SubscriptionFeatureKey }>) {
  const router = useRouter();
  const { isPreviewMode } = useVendorSession();
  const { loading, platformAvailable, hasFeature } = useSubscription();
  const allowed = isPreviewMode || !platformAvailable || hasFeature(feature);
  useEffect(() => {
    if (!loading && platformAvailable && !allowed && feature !== "upload_clips") {
      router.replace({ pathname: "/VendorSubscription", params: { requiredFeature: feature } });
    }
  }, [allowed, feature, loading, platformAvailable, router]);
  if (loading && !platformAvailable) return <PageLoader />;
  if (!allowed) return feature === "upload_clips" ? <EliteClipsUpgradeState withHeader /> : <PageLoader />;
  return <>{children}</>;
}
