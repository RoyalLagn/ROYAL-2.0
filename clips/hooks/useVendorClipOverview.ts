import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipDraftService, ClipManagementService, ClipUploadService } from "../services";
import type { ClipDraftRecord, ClipPlanLimits } from "../types";

export function useVendorClipOverview(vendorId?: string | null) {
  const [clips, setClips] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<ClipDraftRecord[]>([]);
  const [limits, setLimits] = useState<ClipPlanLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vendorId) {
      setClips([]);
      setDrafts([]);
      setLimits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [clipResult, savedDrafts, resolvedLimits] = await Promise.all([
        ClipManagementService.listVendor(vendorId),
        ClipDraftService.list(),
        ClipUploadService.resolveLimits(vendorId),
      ]);
      if (clipResult.error) throw clipResult.error;
      setClips(clipResult.data ?? []);
      setDrafts(savedDrafts.filter((draft) => draft.vendorId === vendorId));
      setLimits(resolvedLimits);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load Clips overview.");
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const overview = useMemo(() => {
    const active = clips.filter((clip) => !clip.deleted_at && clip.status !== "deleted");
    const byStatus = {
      approved: active.filter((clip) => clip.status === "approved"),
      pending: active.filter((clip) => clip.status === "pending"),
      draft: active.filter((clip) => clip.status === "draft"),
      hidden: active.filter((clip) => clip.status === "hidden"),
      rejected: active.filter((clip) => clip.status === "rejected"),
    };
    const mostViewed = [...active].sort((a, b) => Number(b.views_count) - Number(a.views_count))[0] ?? null;
    const newest = [...active].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
    // Rejected and hidden Clips aren't live and shouldn't hold an upload
    // slot -- only count Clips that are actually published or awaiting
    // review toward the plan limit.
    const slotsUsed = active.filter((clip) => clip.status !== "rejected" && clip.status !== "hidden").length;
    return {
      active,
      byStatus,
      total: active.length,
      approved: byStatus.approved.length,
      pending: byStatus.pending.length,
      draftCount: byStatus.draft.length + drafts.length,
      views: active.reduce((sum, clip) => sum + Number(clip.views_count || 0), 0),
      likes: active.reduce((sum, clip) => sum + Number(clip.likes_count || 0), 0),
      saves: active.reduce((sum, clip) => sum + Number(clip.saves_count || 0), 0),
      mostViewed,
      newest,
      maximumClips: limits?.maximumClips ?? null,
      limitReached: limits ? slotsUsed >= limits.maximumClips : false,
    };
  }, [clips, drafts, limits]);

  return { clips, drafts, limits, loading, error, overview, refresh };
}
