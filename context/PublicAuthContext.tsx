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
import { Platform } from "react-native";
import { restoreSupabaseSession, supabase } from "@/services/supabase";
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
let publicProfileChannelSequence = 0;

export function PublicAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<PublicProfile | null>(null);
  const profileRequestSequence = useRef(0);
  sessionRef.current = session;
  profileRef.current = profile;

  const loadPublicProfile = useCallback(async (nextSession: Session | null) => {
    const requestSequence = ++profileRequestSequence.current;
    setLoading(true);
    try {
    if (nextSession && isRecoverySessionActive()) {
      sessionRef.current = null;
      profileRef.current = null;
      setSession(null);
      setProfile(null);
      return;
    }
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (!nextSession?.user) {
      profileRef.current = null;
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,phone,profile_image,role,created_at,updated_at")
      .eq("id", nextSession.user.id)
      .maybeSingle();

    // INITIAL_SESSION and TOKEN_REFRESHED can overlap during app/tab resume.
    // Never let an older profile request overwrite the newer auth state.
    if (requestSequence !== profileRequestSequence.current) return;

    if (!error && !data && nextSession.user.user_metadata?.role === "public_user") {
      try {
        const ensuredProfile = await ensurePublicProfile(nextSession.user);
        if (requestSequence !== profileRequestSequence.current) return;
        profileRef.current = ensuredProfile;
        setProfile(ensuredProfile);
        return;
      } catch {
        // A temporary network failure during session refresh is not logout.
        // Keep the last profile when it belongs to this same user.
        if (profileRef.current?.id !== nextSession.user.id) {
          profileRef.current = null;
          setProfile(null);
        }
        return;
      }
    }

    if (error) {
      // Backgrounding can abort this request while the stored Supabase
      // session remains valid. Preserve the last verified identity.
      if (profileRef.current?.id !== nextSession.user.id) {
        profileRef.current = null;
        setProfile(null);
      }
      return;
    }

    if (!data || data.role !== "public_user") {
      profileRef.current = null;
      setProfile(null);
      return;
    }
    const nextProfile = data as PublicProfile;
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    } finally {
      if (requestSequence === profileRequestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    restoreSupabaseSession()
      .then(async (restoredSession) => {
        if (!active) return;
        await loadPublicProfile(restoredSession);
      })
      .catch(() => {
        if (!active) return;
        // INITIAL_SESSION may already have restored the user while this
        // independent storage read was interrupted. Do not undo it.
        if (!sessionRef.current) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !nextSession) {
        profileRequestSequence.current += 1;
        sessionRef.current = null;
        profileRef.current = null;
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      // Supabase warns against making further client calls directly inside
      // this callback. Defer profile loading to avoid a re-entrant refresh
      // race when a browser tab or native app returns to the foreground.
      setTimeout(() => {
        if (!active) return;
        void loadPublicProfile(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadPublicProfile]);

  useEffect(() => {
    const profileId = session?.user.id;
    if (!profileId) return;

    publicProfileChannelSequence += 1;
    const channel = supabase
      .channel(`public-profile-${profileId}-${publicProfileChannelSequence}`)
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
          if (nextProfile.role === "public_user") {
            profileRef.current = nextProfile;
            setProfile(nextProfile);
          }
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
    sessionRef.current = currentSession;
    profileRef.current = nextProfile;
    setSession(currentSession);
    setProfile(nextProfile);
  }, [session]);

  const signOut = useCallback(async () => {
    if (Platform.OS !== "web") {
      try {
        const { PushTokenService } = await import("@/services/pushTokens");
        await PushTokenService.unregisterCurrentDevice();
      } catch {
        // Token cleanup is best-effort and must not block logout.
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    profileRequestSequence.current += 1;
    sessionRef.current = null;
    profileRef.current = null;
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
