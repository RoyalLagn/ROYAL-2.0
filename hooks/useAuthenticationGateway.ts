import { useCallback } from "react";
import { useRouter } from "expo-router";

export function useAuthenticationGateway() {
  const router = useRouter();

  return useCallback(() => {
    router.dismissAll();
    router.replace("/DashboardCenter");
  }, [router]);
}
