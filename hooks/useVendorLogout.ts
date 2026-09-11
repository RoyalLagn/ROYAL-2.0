import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useVendorSession } from "@/context/VendorSessionContext";
import { useVendorAuth } from "@/context/VendorAuthContext";

export function useVendorLogout() {
  const router = useRouter();
  const { isPreviewMode, clearPreviewMode } = useVendorSession();
  const { signOut } = useVendorAuth();

  return useCallback(async () => {
    if (isPreviewMode) {
      clearPreviewMode();
      router.replace("/VendorAuth");
      return;
    } else {
      // Goes through VendorAuthContext so the resolved vendor state (and
      // therefore every screen reading it) clears immediately, instead of
      // waiting on the async SIGNED_OUT auth event. Any open Realtime
      // channel (VendorAuthStatus, useVendorWorkspace) unsubscribes on its
      // own via its effect cleanup once its owning screen unmounts below.
      await signOut();
    }
    // VendorRouteGuard owns the post-sign-out redirect. Keeping navigation
    // in one place avoids two simultaneous REPLACE actions while the auth
    // state is unmounting the protected Vendor route.
  }, [clearPreviewMode, isPreviewMode, router, signOut]);
}
