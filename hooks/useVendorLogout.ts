import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useVendorSession } from "@/context/VendorSessionContext";
import { supabase } from "@/services/supabase";

export function useVendorLogout() {
  const router = useRouter();
  const { isPreviewMode, clearPreviewMode } = useVendorSession();

  return useCallback(async () => {
    if (isPreviewMode) {
      clearPreviewMode();
    } else {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }

    router.dismissAll();
    router.replace("/DashboardCenter");
  }, [clearPreviewMode, isPreviewMode, router]);
}
