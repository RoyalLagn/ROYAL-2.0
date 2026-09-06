export type ClipStatus =
  | "draft"
  | "pending"
  | "approved"
  | "hidden"
  | "rejected"
  | "deleted";

export type ClipVisibility = "public" | "unlisted" | "private";
export type ClipModerationDecision = "approved" | "hidden" | "rejected";
export type ClipUploadStage =
  | "idle"
  | "validating"
  | "compressing"
  | "thumbnail"
  | "uploading"
  | "saving"
  | "complete"
  | "failed";

export interface ClipResolution {
  width: number;
  height: number;
}

export interface Clip {
  id: string;
  vendorId: string;
  categoryId: string;
  title: string;
  caption: string | null;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  resolution: ClipResolution;
  fileSizeBytes: number;
  cloudinaryPublicId: string;
  viewsCount: number;
  likesCount: number;
  savesCount: number;
  status: ClipStatus;
  visibility: ClipVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
}

export interface ClipCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ClipUpload {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: ClipResolution;
}

export interface ClipUploadDraft {
  vendorId: string;
  categoryId: string;
  title: string;
  caption?: string;
  source: ClipUpload;
  customThumbnailUri?: string | null;
}

export interface UploadProgress {
  stage: ClipUploadStage;
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  attempt: number;
}

export interface ClipAnalytics {
  clipId: string;
  views: number;
  uniqueViewers: number;
  likes: number;
  saves: number;
  shares: number;
  completionRate: number;
}

export interface ModerationResult {
  clipId: string;
  decision: ClipModerationDecision;
  reason: string | null;
  reviewedAt: string;
}

export interface ClipCursor {
  createdAt: string;
  id: string;
}

export interface ClipPage {
  items: Clip[];
  nextCursor: ClipCursor | null;
  hasMore: boolean;
}

export interface ClipResponse<T> {
  data: T | null;
  error: import("../utils/errors").ClipModuleError | null;
}

export interface ClipCloudinaryAsset {
  videoUrl: string;
  thumbnailUrl: string;
  publicId: string;
  durationSeconds: number;
  resolution: ClipResolution;
  fileSizeBytes: number;
}

export interface ClipPlanLimits {
  maximumClips: number;
}

export type ClipQueueStatus =
  | "waiting"
  | "compressing"
  | "thumbnail"
  | "uploading"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export interface ClipQueueItem {
  id: string;
  draft: ClipUploadDraft;
  status: ClipQueueStatus;
  progress: UploadProgress;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
}

export interface ClipDraftRecord {
  id: string;
  vendorId: string;
  categoryId: string;
  title: string;
  caption: string;
  source: ClipUpload | null;
  customThumbnailUri: string | null;
  updatedAt: string;
}

export interface PublicClipVendor {
  id: string;
  slug: string;
  name: string;
  city: string;
  avatarUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  verified: boolean;
  categoryName: string;
  rating: number;
  reviewCount: number;
}

export interface PublicClip extends Clip {
  categoryName: string;
  vendor: PublicClipVendor;
  hashtags: string[];
}

export interface PublicClipCursor {
  offset: number;
}

export interface PublicClipFeedSession {
  seed: string;
  startedAt: string;
}

export interface PublicClipPage {
  items: PublicClip[];
  nextCursor: PublicClipCursor | null;
  hasMore: boolean;
}

export interface ClipEngagementState {
  liked: boolean;
  saved: boolean;
}
