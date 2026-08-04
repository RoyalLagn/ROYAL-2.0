import { useCallback, useEffect, useState } from "react";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import type { CrmWorkspaceProgress, CrmWorkspaceSession } from "@/types/crm/workspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "This workspace link could not be opened.");
  }
  return "This workspace link could not be opened.";
}

export function useWorkspaceSession(token: string | null) {
  const [session, setSession] = useState<CrmWorkspaceSession | null>(null);
  const [progress, setProgress] = useState<CrmWorkspaceProgress | null>(null);
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
      const [sessionResult, progressResult] = await Promise.all([
        CrmWorkspaceSessionService.authenticate(token),
        CrmWorkspaceSessionService.progress(token),
      ]);
      setSession(sessionResult);
      setProgress(progressResult);
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
      setProgress(await CrmWorkspaceSessionService.progress(token));
    } catch {
      // Progress is a secondary widget; a failed refresh shouldn't knock the
      // employee out of their session.
    }
  }, [token]);

  return { session, progress, loading, error, refresh: load, refreshProgress };
}
