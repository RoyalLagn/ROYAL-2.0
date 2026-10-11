import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";
import { TeamAuthService } from "@/services/teamAuth";
import type { TeamMembership } from "@/types/team";

type TeamAuthContextType = {
  user: User | null;
  membership: TeamMembership | null;
  loading: boolean;
  refresh: () => Promise<void>;
  isTeamMember: boolean;
  canVerifyPayments: boolean;
  canHandleFinance: boolean;
  canVerifyVendors: boolean;
  isMarketing: boolean;
  isManager: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const TeamAuthContext = createContext<TeamAuthContextType>({
  user: null,
  membership: null,
  loading: true,
  refresh: async () => {},
  isTeamMember: false,
  canVerifyPayments: false,
  canHandleFinance: false,
  canVerifyVendors: false,
  isMarketing: false,
  isManager: false,
  isAdmin: false,
  signIn: async () => ({ success: false, error: "Not initialized" }),
  signOut: async () => {},
});

export function TeamAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<TeamMembership | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
      if (!currentUser) {
        setMembership(null);
      } else {
        const data = await TeamAuthService.getCurrentTeamMembership();
        setMembership(data);
      }
    } catch (err) {
      console.error("TeamAuthProvider.refresh error:", err);
      setUser(null);
      setMembership(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        return { success: false, error: error.message };
      }
      await refresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to sign in" };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setUser(null);
    setMembership(null);
  };

  const isTeamMember = Boolean(membership && membership.isActive);
  const canVerifyPayments = TeamAuthService.canVerifyPayments(membership);
  const canHandleFinance = TeamAuthService.canHandleFinance(membership);
  const canVerifyVendors = TeamAuthService.canVerifyVendors(membership);
  const isMarketing = TeamAuthService.isMarketingTeammate(membership);
  const isManager = TeamAuthService.isTeamManager(membership);
  const isAdmin = TeamAuthService.isAdminOwner(membership);

  return (
    <TeamAuthContext.Provider
      value={{
        user,
        membership,
        loading,
        refresh,
        isTeamMember,
        canVerifyPayments,
        canHandleFinance,
        canVerifyVendors,
        isMarketing,
        isManager,
        isAdmin,
        signIn,
        signOut,
      }}
    >
      {children}
    </TeamAuthContext.Provider>
  );
}

export function useTeamAuth() {
  return useContext(TeamAuthContext);
}
