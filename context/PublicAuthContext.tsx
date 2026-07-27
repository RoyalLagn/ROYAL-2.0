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
  ensurePublicProfile,
  type PublicProfile,
} from "@/services/publicAuth";
import { isRecoverySessionActive } from "@/services/authRecoverySession";

type PublicAuthContextValue = {
  session: Session | null;
  profile: PublicProfile | null;
  loading: boolean;
  isPublicAuthenticated: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const PublicAuthContext = createContext<PublicAuthContextValue | null>(null);

export function PublicAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPublicProfile = useCallback(async (nextSession: Session | null) => {
    if (nextSession && isRecoverySessionActive()) {
      setSession(null);
      setProfile(null);
      return;
    }
    setSession(nextSession);
    if (!nextSession?.user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,phone,profile_image,role,created_at,updated_at")
      .eq("id", nextSession.user.id)
      .maybeSingle();

    if (!error && !data && nextSession.user.user_metadata?.role === "public_user") {
      try {
        setProfile(await ensurePublicProfile(nextSession.user));
        return;
      } catch {
        setProfile(null);
        return;
      }
    }

    if (error || !data || data.role !== "public_user") {
      setProfile(null);
      return;
    }
    setProfile(data as PublicProfile);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await loadPublicProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void loadPublicProfile(nextSession).finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadPublicProfile]);

  useEffect(() => {
    const profileId = session?.user.id;
    if (!profileId) return;

    const channel = supabase
      .channel(`public-profile-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profileId}`,
        },
        (payload) => {
          const nextProfile = payload.new as PublicProfile;
          if (nextProfile.role === "public_user") setProfile(nextProfile);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  const refreshProfile = useCallback(async () => {
    const currentSession = session ?? (await supabase.auth.getSession()).data.session;
    if (!currentSession?.user) return;
    const nextProfile = await ensurePublicProfile(currentSession.user);
    setSession(currentSession);
    setProfile(nextProfile);
  }, [session]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<PublicAuthContextValue>(() => ({
    session,
    profile,
    loading,
    isPublicAuthenticated: Boolean(session && profile?.role === "public_user"),
    refreshProfile,
    signOut,
  }), [loading, profile, refreshProfile, session, signOut]);

  return <PublicAuthContext.Provider value={value}>{children}</PublicAuthContext.Provider>;
}

export function usePublicAuth() {
  const value = useContext(PublicAuthContext);
  if (!value) throw new Error("usePublicAuth must be used inside PublicAuthProvider.");
  return value;
}
