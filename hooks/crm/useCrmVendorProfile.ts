import { useCallback, useEffect, useState } from "react";
import { CrmVendorService } from "@/services/crm/vendorService";
import { CrmNoteService } from "@/services/crm/noteService";
import { CrmFollowupService, type CrmFollowupInput } from "@/services/crm/followupService";
import { CrmActivityService } from "@/services/crm/activityService";
import { CrmDocumentService, type CrmDocument } from "@/services/crm/documentService";
import type { CrmActivity, CrmNote } from "@/types/crm/activity";
import type { CrmFollowup } from "@/types/crm/followup";
import type { CrmVendorInput, CrmVendorListItem, CrmVendorStatus } from "@/types/crm/vendor";

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message?: unknown }).message || "Unable to load vendor.");
  }
  return "Unable to load vendor.";
}

export function useCrmVendorProfile(vendorId: string | null) {
  const [vendor, setVendor] = useState<CrmVendorListItem | null>(null);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [followups, setFollowups] = useState<CrmFollowup[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const [vendorResult, notesResult, followupsResult, activitiesResult, documentsResult] = await Promise.all([
        CrmVendorService.getRecord(vendorId),
        CrmNoteService.list(vendorId),
        CrmFollowupService.list(vendorId),
        CrmActivityService.list(vendorId),
        CrmDocumentService.list(vendorId),
      ]);
      setVendor(vendorResult);
      setNotes(notesResult);
      setFollowups(followupsResult);
      setActivities(activitiesResult);
      setDocuments(documentsResult);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = useCallback(async (status: CrmVendorStatus, note?: string) => {
    if (!vendorId) return;
    setSaving(true);
    try {
      await CrmVendorService.updateStatus(vendorId, status, note);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [vendorId, load]);

  const updateVendor = useCallback(async (input: Partial<CrmVendorInput>) => {
    if (!vendorId) return;
    setSaving(true);
    try {
      await CrmVendorService.update(vendorId, input);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [vendorId, load]);

  const addNote = useCallback(async (body: string) => {
    if (!vendorId || !body.trim()) return;
    setSaving(true);
    try {
      await CrmNoteService.create(vendorId, body);
      setNotes(await CrmNoteService.list(vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [vendorId]);

  const addFollowup = useCallback(async (input: CrmFollowupInput) => {
    if (!vendorId) return;
    setSaving(true);
    try {
      await CrmFollowupService.create(vendorId, input);
      setFollowups(await CrmFollowupService.list(vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setSaving(false);
    }
  }, [vendorId]);

  const completeFollowup = useCallback(async (id: string) => {
    if (!vendorId) return;
    setSaving(true);
    try {
      await CrmFollowupService.setStatus(id, "completed");
      setFollowups(await CrmFollowupService.list(vendorId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  }, [vendorId]);

  return {
    vendor, notes, followups, activities, documents,
    loading, saving, error, setError,
    changeStatus, updateVendor, addNote, addFollowup, completeFollowup,
    refresh: load,
  };
}
