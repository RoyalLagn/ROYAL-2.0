import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { restoreSupabaseSession, supabase } from "@/services/supabase";
import {
  logSupabaseError,
  resolveVendorDestination,
  type VendorResolution,
} from "@/services/vendorAuth";
import { isRecoverySessionActive } from "@/services/authRecoverySession";
import { ClipQueueService } from "@/clips/services/ClipQueueService";

type VendorAuthContextValue = {
  resolution: VendorResolution | null;
  loading: boolean;
  /** True once the vendor workspace is linked -- the one state that should
   * see /vendor-dashboard. */
  isVendorAuthenticated: boolean;
  refresh: () => Promise<VendorResolution | null>;
  signOut: () => Promise<void>;
};

const VendorAuthContext = createContext<VendorAuthContextValue | null>(null);

/**
 * The single owner of resolveVendorDestination(). Every Vendor screen and
 * the Vendor route guard read from this context instead of calling the
 * resolver themselves -- that is what keeps claim_vendor_workspace() (only
 * invoked from inside the resolver, and only when a workspace genuinely
 * needs claiming) from being hit repeatedly across mounts, focuses and
 * unrelated re-renders.
 */
export function VendorAuthProvider({ children }: { children: React.ReactNode }) {
  const [resolution, setResolution] = useState<VendorResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const resolutionRef = useRef<VendorResolution | null>(null);
  resolutionRef.current = resolution;

  const refresh = useCallback(async (session?: Session | null) => {
    if (isRecoverySessionActive()) {
      setResolution(null);
      setLoading(false);
      return null;
    }
    // A background silent token refresh (tab regains focus, etc.) must not
    // flash the branded loader over an already-resolved vendor session.
    if (!resolutionRef.current) setLoading(true);
    try {
      const currentSession = session === undefined ? (await supabase.auth.getSession()).data.session : session;
      const next = await resolveVendorDestination(currentSession?.user ?? null);
      setResolution(next);
      return next;
    } catch (error) {
      logSupabaseError("VendorAuthContext.refresh", error);
      // A transient failure (network blip, dropped request) must not throw
      // away an already-known-good resolution -- only a real "not signed
      // in" / "not a vendor" result (resolved above, not thrown) does that.
      return resolutionRef.current;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    restoreSupabaseSession()
      .then((restoredSession) => {
        if (!mounted) return;
        void refresh(restoredSession);
      })
      .catch((error) => {
        if (!mounted) return;
        logSupabaseError("VendorAuthContext.init", error);
        setResolution(null);
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setResolution(null);
        setLoading(false);
        // Covers sign-outs this context didn't initiate itself (session
        // expiry, another tab signing out, OtpVerification's local
        // sign-out) so the Upload Queue is cleared no matter how the
        // session ended, not only through this context's own signOut().
        void ClipQueueService.setActiveVendor(null);
        return;
      }
      // Deferred like AdminAuthContext: avoids re-entrant Supabase client
      // calls from directly inside the onAuthStateChange callback.
      setTimeout(() => {
        if (mounted) void refresh(session);
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setResolution(null);
    // Belt-and-braces alongside useClipUploadQueue's own vendor-id effect:
    // clears the in-memory Upload Queue immediately even if a Clip upload
    // screen happens to stay mounted across the logout (e.g. a background
    // tab), so the next vendor to sign in on this device can never see it
    // flash before their own queue is hydrated.
    await ClipQueueService.setActiveVendor(null);
  }, []);

  const value = useMemo<VendorAuthContextValue>(() => ({
    resolution,
    loading,
    isVendorAuthenticated: resolution?.state === "approved_verified",
    refresh,
    signOut,
  }), [loading, refresh, resolution, signOut]);

  return <VendorAuthContext.Provider value={value}>{children}</VendorAuthContext.Provider>;
}

export function useVendorAuth() {
  const value = useContext(VendorAuthContext);
  if (!value) throw new Error("useVendorAuth must be used inside VendorAuthProvider.");
  return value;
}
