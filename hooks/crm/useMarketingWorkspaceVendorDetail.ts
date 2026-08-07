import { useCallback, useEffect, useState } from "react";
import { CrmMarketingWorkspaceSessionService } from "@/services/crm/marketingWorkspaceSessionService";
import type { CrmMarketingWorkspaceProgressUpdate, CrmMarketingWorkspaceVendorDetail } from "@/types/crm/marketingWorkspace";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return "Unable to load this vendor.";
}

export function useMarketingWorkspaceVendorDetail(token: string | null, vendorId: string | null) {
  const [vendor, setVendor] = useState<CrmMarketingWorkspaceVendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !vendorId) return;
    setLoading(true);
    setError(null);
    try {
      setVendor(await CrmMarketingWorkspaceSessionService.getVendor(token, vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => { void load(); }, [load]);

  const updateProgress = useCallback(async (update: CrmMarketingWorkspaceProgressUpdate) => {
    if (!token || !vendorId) return;
    setSaving(true);
    try {
      await CrmMarketingWorkspaceSessionService.updateProgress(token, vendorId, update);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [token, vendorId, load]);

  const logActivity = useCallback((action: "call_started" | "whatsapp_opened") => {
    if (!token || !vendorId) return;
    void CrmMarketingWorkspaceSessionService.logActivity(token, vendorId, action).catch(() => {
      // Best-effort logging — don't block the actual call/WhatsApp action on it.
    });
  }, [token, vendorId]);

  return { vendor, loading, saving, error, setError, updateProgress, logActivity, refresh: load };
}
