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
  AdminAuthError,
  logoutAdmin,
  verifyAdminSession,
  type AdminIdentity,
} from "@/services/adminAuth";
import { isRecoverySessionActive } from "@/services/authRecoverySession";

type AdminAuthContextValue = {
  identity: AdminIdentity | null;
  loading: boolean;
  isAdminAuthenticated: boolean;
  refreshAdmin: (session?: Session | null) => Promise<AdminIdentity | null>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const identityRef = useRef<AdminIdentity | null>(null);
  identityRef.current = identity;

  const refreshAdmin = useCallback(async (session?: Session | null) => {
    if (isRecoverySessionActive()) {
      setIdentity(null);
      setLoading(false);
      return null;
    }
    // Supabase's browser client silently refreshes the token (and re-fires
    // onAuthStateChange) whenever a backgrounded tab regains focus. That's
    // a background re-verification, not a fresh sign-in — an admin who is
    // already authenticated must keep seeing their dashboard while it
    // resolves, not the full-screen loader.
    if (!identityRef.current) setLoading(true);
    try {
      const verified = await verifyAdminSession(session, false);
      setIdentity(verified);
      return verified;
    } catch (error) {
      // Only a genuine authorization failure (no session, account not an
      // admin, or disabled) should sign the admin out. Every other
      // failure here is transient by construction: `getAdminProfile`'s
      // network request can be dropped or aborted when a backgrounded
      // browser tab regains focus and Supabase's client fires a silent
      // token-refresh event, or the request can simply time out. Treating
      // those as "not authenticated" was clearing an already-verified
      // session, which is what made switching tabs / stepping away look
      // like a logout. Keep the last known identity and let the next
      // refresh (or an explicit action) resolve it.
      if (error instanceof AdminAuthError) {
        setIdentity(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    restoreSupabaseSession()
      .then((restoredSession) => {
        if (!mounted) return;
        if (restoredSession) void refreshAdmin(restoredSession);
        else setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setIdentity(null);
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session) {
        setIdentity(null);
        setLoading(false);
        return;
      }
      setTimeout(() => {
        if (mounted) void refreshAdmin(session);
      }, 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshAdmin]);

  const signOut = useCallback(async () => {
    await logoutAdmin();
    setIdentity(null);
  }, []);

  const value = useMemo<AdminAuthContextValue>(() => ({
    identity,
    loading,
    isAdminAuthenticated: Boolean(identity),
    refreshAdmin,
    signOut,
  }), [identity, loading, refreshAdmin, signOut]);

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error("useAdminAuth must be used inside AdminAuthProvider.");
  return value;
}
