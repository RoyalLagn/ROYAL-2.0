import { useCallback, useEffect, useState } from "react";
import { CrmWorkspaceSessionService } from "@/services/crm/workspaceSessionService";
import type { CrmWorkspaceFollowup, CrmWorkspaceVendorInput } from "@/types/crm/workspace";
import type { CrmVendorRecord, CrmVendorStatus } from "@/types/crm/vendor";
import type { CrmNote } from "@/types/crm/activity";
import type { CrmFollowupType } from "@/types/crm/followup";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load this vendor.");
  }
  return "Unable to load this vendor.";
}

export function useWorkspaceVendorDetail(token: string | null, vendorId: string | null) {
  const [vendor, setVendor] = useState<CrmVendorRecord | null>(null);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [followups, setFollowups] = useState<CrmWorkspaceFollowup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const [vendorResult, notesResult, followupsResult] = await Promise.all([
        CrmWorkspaceSessionService.getVendor(token, vendorId),
        CrmWorkspaceSessionService.listNotes(token, vendorId),
        CrmWorkspaceSessionService.listFollowups(token, "all", vendorId),
      ]);
      setVendor(vendorResult);
      setNotes(notesResult);
      setFollowups(followupsResult);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [token, vendorId]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = useCallback(async (status: CrmVendorStatus) => {
    if (!token || !vendorId) return;
    setSaving(true);
    try {
      await CrmWorkspaceSessionService.updateVendorStatus(token, vendorId, status);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [token, vendorId, load]);

  const updateVendor = useCallback(async (changes: Partial<CrmWorkspaceVendorInput>) => {
    if (!token || !vendorId) return;
    setSaving(true);
    try {
      await CrmWorkspaceSessionService.updateVendor(token, vendorId, changes);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [token, vendorId, load]);

  const addNote = useCallback(async (body: string) => {
    if (!token || !vendorId || !body.trim()) return;
    setSaving(true);
    try {
      await CrmWorkspaceSessionService.addNote(token, vendorId, body);
      setNotes(await CrmWorkspaceSessionService.listNotes(token, vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [token, vendorId]);

  const addFollowup = useCallback(async (input: {
    type: CrmFollowupType; scheduledDate: string; scheduledTime?: string | null;
    priority?: "low" | "medium" | "high"; notes?: string | null;
  }) => {
    if (!token || !vendorId) return;
    setSaving(true);
    try {
      await CrmWorkspaceSessionService.addFollowup(token, vendorId, input);
      setFollowups(await CrmWorkspaceSessionService.listFollowups(token, "all", vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [token, vendorId]);

  const completeFollowup = useCallback(async (followupId: string) => {
    if (!token || !vendorId) return;
    setSaving(true);
    try {
      await CrmWorkspaceSessionService.setFollowupStatus(token, followupId, "completed");
      setFollowups(await CrmWorkspaceSessionService.listFollowups(token, "all", vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [token, vendorId]);

  const logActivity = useCallback((action: "call_started" | "whatsapp_opened") => {
    if (!token || !vendorId) return;
    void CrmWorkspaceSessionService.logActivity(token, vendorId, action).catch(() => {
      // Best-effort logging — don't block the actual call/WhatsApp action on it.
    });
  }, [token, vendorId]);

  return {
    vendor, notes, followups, loading, saving, error, setError,
    changeStatus, updateVendor, addNote, addFollowup, completeFollowup, logActivity,
    refresh: load,
  };
}
