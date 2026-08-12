import { supabase } from "@/services/supabase";
import type { ClipVisibility } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipLogger } from "../utils/logger";
import { withClipRetry } from "../utils/retry";
import { ClipCacheService } from "./ClipCacheService";
import { ClipCloudinaryService } from "./ClipCloudinaryService";
import { uploadClipThumbnail } from "./ClipCloudinaryNativeAdapter";

export interface UpdateVendorClipInput {
  title: string;
  caption?: string;
  categoryId: string;
  visibility: ClipVisibility;
  /** Pass the Clip's current status so an edit to an already-approved Clip
   *  can be sent back for re-moderation instead of staying live unreviewed. */
  currentStatus?: string;
}

export const ClipManagementService = {
  listVendor(vendorId: string) {
    return supabase.from("clips").select("*").eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });
  },
  async update(clipId: string, input: UpdateVendorClipInput) {
    const result = await supabase.from("clips").update({
      title: input.title.trim(),
      caption: input.caption?.trim() || null,
      category_id: input.categoryId,
      visibility: input.visibility,
      ...(input.currentStatus === "approved" ? { status: "pending" } : null),
    }).eq("id", clipId).select("*").single();
    if (!result.error) {
      ClipCacheService.invalidate("details", clipId);
      ClipCacheService.invalidate("vendor");
    }
    return result;
  },
  async replaceThumbnail(clipId: string, vendorId: string, uri: string, onProgress?: (value: number) => void) {
    const uploaded = await uploadClipThumbnail(vendorId, clipId, uri, onProgress);
    const result = await supabase.from("clips").update({ thumbnail_url: uploaded.url }).eq("id", clipId).select("*").single();
    if (!result.error) ClipCacheService.invalidate("details", clipId);
    return result;
  },
  async remove(clipId: string) {
    // The Edge Function owns the ordered transaction: verify ownership and
    // read the public ID while the row is visible, delete Cloudinary assets,
    // then soft-delete the database row. Cloudinary destroy is idempotent, so
    // retrying also recovers storage-success/database-failure cases safely.
    await withClipRetry(
      () => ClipCloudinaryService.delete(clipId),
      (retryError) => !(retryError instanceof ClipModuleError) || retryError.retryable,
    );
    ClipCacheService.invalidate();
  },
  async replaceOldest(vendorId: string) {
    const { data, error } = await supabase.rpc("vendor_replace_oldest_clip", { target_vendor_id: vendorId });
    if (error) throw error;
    const oldest = Array.isArray(data) ? data[0] : data;
    if (!oldest?.clip_id) throw new Error("No published Clip is available to replace.");
    ClipCacheService.invalidate();
    // As with remove(), the replace RPC above is a one-shot operation (it already
    // freed the vendor's upload slot), so a Cloudinary hiccup here must not block
    // the caller from proceeding to queue their new upload with the freed slot --
    // best-effort retry, then log and move on rather than throwing.
    try {
      await withClipRetry(
        () => ClipCloudinaryService.delete(oldest.clip_id),
        (retryError) => !(retryError instanceof ClipModuleError) || retryError.retryable,
      );
    } catch (cloudinaryError) {
      ClipLogger.error("cloudinary", "Oldest Clip replaced but Cloudinary cleanup failed", {
        clipId: oldest.clip_id, error: cloudinaryError instanceof Error ? cloudinaryError.message : String(cloudinaryError),
      });
    }
    return oldest.clip_id as string;
  },
};
