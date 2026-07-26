import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import {
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

  const refreshAdmin = useCallback(async (session?: Session | null) => {
    if (isRecoverySessionActive()) {
      setIdentity(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const verified = await verifyAdminSession(session, false);
      setIdentity(verified);
      return verified;
    } catch {
      setIdentity(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) void refreshAdmin(data.session);
      else setLoading(false);
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
