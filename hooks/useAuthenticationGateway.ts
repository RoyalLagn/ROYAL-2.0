import { useCallback } from "react";
import { useRouter } from "expo-router";
import { usePublicAuth } from "@/context/PublicAuthContext";

export function useAuthenticationGateway() {
  const router = useRouter();
  const { isPublicAuthenticated } = usePublicAuth();

  return useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(isPublicAuthenticated ? "/(tabs)/profile" : "/DashboardCenter");
  }, [isPublicAuthenticated, router]);
}
