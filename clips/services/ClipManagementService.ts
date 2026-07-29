import { supabase } from "@/services/supabase";
import type { ClipVisibility } from "../types";
import { ClipCacheService } from "./ClipCacheService";
import { ClipCloudinaryService } from "./ClipCloudinaryService";
import { uploadClipThumbnail } from "./ClipCloudinaryNativeAdapter";

export interface UpdateVendorClipInput {
  title: string;
  caption?: string;
  categoryId: string;
  visibility: ClipVisibility;
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
    const { error } = await supabase.rpc("vendor_soft_delete_clip", { target_clip_id: clipId });
    if (error) throw error;
    await ClipCloudinaryService.delete(clipId);
    ClipCacheService.invalidate();
  },
  async replaceOldest(vendorId: string) {
    const { data, error } = await supabase.rpc("vendor_replace_oldest_clip", { target_vendor_id: vendorId });
    if (error) throw error;
    const oldest = Array.isArray(data) ? data[0] : data;
    if (!oldest?.clip_id) throw new Error("No published Clip is available to replace.");
    await ClipCloudinaryService.delete(oldest.clip_id);
    ClipCacheService.invalidate();
    return oldest.clip_id as string;
  },
};
