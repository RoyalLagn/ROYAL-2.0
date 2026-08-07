import { useCallback, useEffect, useState } from "react";
import { CrmMarketingWorkspaceSessionService } from "@/services/crm/marketingWorkspaceSessionService";
import type { CrmMarketingWorkspaceSession, CrmMarketingWorkspaceStats } from "@/types/crm/marketingWorkspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "This workspace link could not be opened.";
}

export function useMarketingWorkspaceSession(token: string | null) {
  const [session, setSession] = useState<CrmMarketingWorkspaceSession | null>(null);
  const [progress, setProgress] = useState<CrmMarketingWorkspaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("This link is missing its access token.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Sequential, not Promise.all: progress() only makes sense (and only
      // succeeds) once authenticate() has confirmed the token — firing both
      // in parallel would waste a second doomed request on every invalid
      // link instead of just one.
      const sessionResult = await CrmMarketingWorkspaceSessionService.authenticate(token);
      setSession(sessionResult);
      setProgress(await CrmMarketingWorkspaceSessionService.progress(token));
    } catch (reason) {
      setSession(null);
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const refreshProgress = useCallback(async () => {
    if (!token) return;
    try {
      setProgress(await CrmMarketingWorkspaceSessionService.progress(token));
    } catch {
      // Best-effort — don't knock the team member out of their session.
    }
  }, [token]);

  return { session, progress, loading, error, refresh: load, refreshProgress };
}
