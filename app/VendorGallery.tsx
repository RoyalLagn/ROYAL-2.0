import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Crosshair, Eye, FolderOpen, ImagePlus, Images, LockKeyhole, MoreHorizontal, Move, Pencil, Play, Plus, RotateCcw, Sparkles, Star, Trash2, Upload, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { deletePortfolioMedia, deleteUnstoredPortfolioAsset, pickPortfolioMedia, type PortfolioAsset, uploadPortfolioAsset } from "@/services/cloudinary";
import { supabase } from "@/services/supabase";
import PortfolioVideoPlayer from "@/components/vendor/PortfolioVideoPlayer";
import { portfolioAssetFingerprint, portfolioMediaUrl, PORTFOLIO_LIMITS, replaceHeroMedia, updateMediaFocalPoint } from "@/services/vendorPortfolio";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import ImageFadeIn from "@/components/loading/ImageFadeIn";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import Pressable from "@/components/InteropSafePressable";

export default function VendorGallery() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const dark = colorScheme === "dark";
  const canvas = dark ? colors.background : "#FFF9FB";
  const { access, requireFeature } = useSubscriptionAccess();
  const { data, loading, error, portfolioError, refresh } = useVendorWorkspace();
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumModal, setAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, {
    name: string;
    progress: number;
    status: "waiting" | "optimizing" | "signing" | "uploading" | "processing" | "completed" | "failed";
    error?: string;
  }>>({});
  const [preview, setPreview] = useState<any>(null);
  const [albumPreview, setAlbumPreview] = useState<any>(null);
  const [albumActions, setAlbumActions] = useState<any>(null);
  const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
  const [pendingAssets, setPendingAssets] = useState<PortfolioAsset[]>([]);
  const [uploadAlbumId, setUploadAlbumId] = useState<string | null>(null);
  const [uploadAlbumTitle, setUploadAlbumTitle] = useState("");
  const [uploadAlbumInitialCount, setUploadAlbumInitialCount] = useState(0);
  const [uploadModal, setUploadModal] = useState(false);
  const [moveMediaItem, setMoveMediaItem] = useState<any>(null);
  const [moveAlbumSource, setMoveAlbumSource] = useState<any>(null);
  const [heroDraft, setHeroDraft] = useState<string[]>([]);
  const [heroPreviewId, setHeroPreviewId] = useState<string | null>(null);
  const [savingHero, setSavingHero] = useState(false);
  const [focalMedia, setFocalMedia] = useState<any>(null);
  const [focalFrame, setFocalFrame] = useState({ width: 1, height: 1 });
  const gap = 10;
  const contentWidth = Math.min(width, 1120) - (width >= 900 ? 56 : 32);
  // Portfolio media grid: columns/tile width are derived from the grid's own
  // measured layout width (onLayout below), not just the window width. This
  // keeps the 2-up mobile grid correct even when the rendered container is
  // narrower/wider than the raw window (e.g. Android/Expo Go safe-area and
  // navigator chrome), which is what made the grid collapse to one oversized
  // column per row instead of two.
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [previewGridWidth, setPreviewGridWidth] = useState(0);
  const columnsForWidth = (w: number) => (w >= 900 ? 4 : w >= 600 ? 3 : 2);
  const tileWidthForContainer = (containerWidth: number) => {
    const measured = containerWidth || contentWidth;
    const cols = columnsForWidth(measured);
    return (measured - gap * (cols - 1)) / cols;
  };
  const tileWidth = tileWidthForContainer(galleryWidth);
  const previewTileWidth = tileWidthForContainer(previewGridWidth);
  const activeAlbum = data.albums.find((album) => album.id === selectedAlbumId) ?? data.albums[0];
  const media = useMemo(() => data.media.filter((item) => item.album_id === activeAlbum?.id), [data.media, activeAlbum?.id]);
  const lockedPhotoCount = useMemo(() => data.media.filter((item) => item.resource_type === "image" && item.subscription_locked).length, [data.media]);
  const previewMedia = useMemo(
    () => data.media.filter((item) => item.album_id === preview?.album_id).sort((a, b) => a.display_order - b.display_order),
    [data.media, preview?.album_id],
  );
  const previewIndex = previewMedia.findIndex((item) => item.id === preview?.id);
  const remainingCapacity = Math.max(0, PORTFOLIO_LIMITS.mediaPerAlbum - media.length);
  const readyHeroImages = useMemo(() => data.media.filter((item) =>
    item.resource_type === "image"
    && !item.subscription_locked
    && item.upload_status === "completed"
    && (item.processing_status ?? "ready") === "ready"
    && data.albums.some((album) => album.id === item.album_id && album.is_visible),
  ), [data.albums, data.media]);
  const requiredHeroCount = Math.min(PORTFOLIO_LIMITS.heroMin, readyHeroImages.length);
  const heroPreview = readyHeroImages.find((item) => item.id === heroPreviewId)
    ?? readyHeroImages.find((item) => heroDraft.includes(item.id))
    ?? readyHeroImages[0];
  const heroPreviewIndex = readyHeroImages.findIndex((item) => item.id === heroPreview?.id);
  const heroPreviewOrder = heroPreview ? heroDraft.indexOf(heroPreview.id) : -1;
  const uploading = Object.values(uploadProgress).some((task) =>
    task.status === "optimizing" || task.status === "signing" || task.status === "uploading" || task.status === "processing");
  const showFailure = (title: string, caught: unknown, message = "Please check your connection and try again.") => {
    if (__DEV__) console.error(title, caught);
    Alert.alert(title, message);
  };

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    setHeroDraft(data.heroMedia.map((item) => item.media_id));
  }, [data.heroMedia]);
  useEffect(() => {
    setHeroPreviewId((current) => readyHeroImages.some((item) => item.id === current)
      ? current
      : readyHeroImages.find((item) => heroDraft.includes(item.id))?.id ?? readyHeroImages[0]?.id ?? null);
  }, [readyHeroImages, heroDraft]);

  const toggleHeroImage = (mediaId: string) => {
    if (!requireFeature("upload_gallery")) return;
    setHeroDraft((current) => {
      if (current.includes(mediaId)) return current.filter((id) => id !== mediaId);
      if (current.length >= PORTFOLIO_LIMITS.heroMax) {
        Alert.alert("Hero gallery is full", "Choose no more than 8 images.");
        return current;
      }
      return [...current, mediaId];
    });
  };
  const moveHeroImage = (mediaId: string, direction: -1 | 1) => {
    if (!requireFeature("upload_gallery")) return;
    setHeroDraft((current) => {
      const next = [...current];
      const index = next.indexOf(mediaId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const saveHeroGallery = async () => {
    if (!requireFeature("upload_gallery")) return;
    if (!data.vendor?.id) return;
    if (heroDraft.length > 0 && heroDraft.length < requiredHeroCount) {
      return Alert.alert(
        "Choose more hero images",
        `Select ${requiredHeroCount}–${PORTFOLIO_LIMITS.heroMax} images, or clear the selection to use the automatic gallery.`,
      );
    }
    setSavingHero(true);
    try {
      await replaceHeroMedia(data.vendor.id, heroDraft);
      await refresh();
      Alert.alert("Hero gallery saved", heroDraft.length ? "Your selected images will appear in this order." : "RoyalLagn will choose stable album images automatically.");
    } catch (caught) {
      showFailure("Hero gallery not saved", caught);
    } finally {
      setSavingHero(false);
    }
  };

  const openAlbum = (album?: any) => {
    if (!requireFeature("manage_albums")) return;
    if (!album && data.albums.length >= PORTFOLIO_LIMITS.albums) {
      Alert.alert("Album limit reached", "You can create up to 5 portfolio albums. Edit an existing album or delete one before creating another.");
      return;
    }
    setEditingAlbum(album ?? null);
    setTitle(album?.title ?? "");
    setDescription(album?.description ?? "");
    setIsVisible(album?.is_visible ?? true);
    setAlbumModal(true);
  };
  const saveAlbum = async (addMediaAfterSave = false) => {
    if (!requireFeature("manage_albums")) return;
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Connect your Vendor profile before creating albums.");
    if (!title.trim()) return Alert.alert("Album title required");
    if (!editingAlbum && data.albums.length >= PORTFOLIO_LIMITS.albums) {
      return Alert.alert("Album limit reached", "You can create up to 5 portfolio albums.");
    }
    const duplicate = data.albums.some((album) =>
      album.id !== editingAlbum?.id && album.title.trim().toLowerCase() === title.trim().toLowerCase());
    if (duplicate) return Alert.alert("Album name already used", "Choose a different name for this album.");
    setSaving(true);
    const payload = { vendor_id: data.vendor.id, title: title.trim(), description: description.trim() || null, is_visible: isVisible };
    const result = editingAlbum
      ? await supabase.from("vendor_portfolio_albums").update(payload).eq("id", editingAlbum.id).eq("vendor_id", data.vendor.id).select("id").single()
      : await supabase.from("vendor_portfolio_albums").insert({ ...payload, display_order: data.albums.length }).select("id").single();
    setSaving(false);
    if (result.error) return showFailure("Album not saved", result.error, "We couldn’t save this album. Please try again.");
    if (!editingAlbum && result.data?.id) setSelectedAlbumId(result.data.id);
    setAlbumModal(false);
    await refresh();
    if (addMediaAfterSave && result.data?.id) {
      await prepareUpload(result.data.id, title.trim(), 0);
    }
  };
  const deleteAlbumAndMedia = async (album: any) => {
    if (!requireFeature("manage_albums")) return;
    setDeletingAlbumId(album.id);
    try {
      const albumMedia = data.media.filter((item) => item.album_id === album.id);
      const failures: unknown[] = [];
      for (const item of albumMedia) {
        try { await deletePortfolioMedia(item.id); }
        catch (mediaError) { failures.push(mediaError); }
      }
      if (failures.length) {
        showFailure("Some media could not be deleted", failures[0], `${failures.length} of ${albumMedia.length} item${albumMedia.length === 1 ? "" : "s"} could not be removed. The album was kept so you can retry.`);
        return;
      }
      const { error: removeError } = await supabase.from("vendor_portfolio_albums").delete().eq("id", album.id).eq("vendor_id", data.vendor?.id);
      if (removeError) throw removeError;
      setSelectedAlbumId(null);
      setAlbumPreview(null);
    } catch (caught) {
      showFailure("Album not deleted", caught, "Nothing was removed. Please check your connection and try again.");
    } finally {
      await refresh();
      setDeletingAlbumId(null);
    }
  };
  const removeAlbum = (album: any) => {
    if (!requireFeature("manage_albums")) return;
    const albumMedia = data.media.filter((item) => item.album_id === album.id);
    if (!albumMedia.length) {
      return Alert.alert("Delete empty album?", "This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteAlbumAndMedia(album) },
      ]);
    }
    const actions: any[] = [{ text: "Cancel", style: "cancel" }];
    if (data.albums.length > 1) actions.push({ text: "Move media", onPress: () => setMoveAlbumSource(album) });
    actions.push({
      text: "Delete album & media",
      style: "destructive",
      onPress: () => Alert.alert(
        "Delete everything?",
        `${albumMedia.length} Cloudinary asset${albumMedia.length === 1 ? "" : "s"} will be permanently removed.`,
        [{ text: "Keep album", style: "cancel" }, { text: "Delete permanently", style: "destructive", onPress: () => deleteAlbumAndMedia(album) }],
      ),
    });
    Alert.alert("Album contains media", "Move its media to another album, or permanently delete the album and every asset inside it.", actions);
  };
  const moveMediaToAlbum = async (item: any, target: any) => {
    if (!requireFeature("manage_albums")) return;
    const targetCount = data.media.filter((entry) => entry.album_id === target.id).length;
    if (targetCount >= PORTFOLIO_LIMITS.mediaPerAlbum) return Alert.alert("Album is full", "Choose an album with available space.");
    const { error: moveError } = await supabase.from("vendor_portfolio_media")
      .update({ album_id: target.id, display_order: targetCount, is_cover: targetCount === 0 })
      .eq("id", item.id).eq("vendor_id", data.vendor?.id);
    if (moveError) return showFailure("Media not moved", moveError);
    setMoveMediaItem(null);
    setPreview(null);
    setSelectedAlbumId(target.id);
    await refresh();
  };
  const moveAlbumMediaTo = async (target: any) => {
    if (!requireFeature("manage_albums")) return;
    if (!moveAlbumSource) return;
    const sourceItems = data.media.filter((item) => item.album_id === moveAlbumSource.id);
    const targetCount = data.media.filter((item) => item.album_id === target.id).length;
    if (targetCount + sourceItems.length > PORTFOLIO_LIMITS.mediaPerAlbum) {
      return Alert.alert("Not enough room", `${target.title} has room for ${PORTFOLIO_LIMITS.mediaPerAlbum - targetCount} more items. Choose another album.`);
    }
    setDeletingAlbumId(moveAlbumSource.id);
    const moved: typeof sourceItems = [];
    try {
      for (let index = 0; index < sourceItems.length; index += 1) {
        const { error: moveError } = await supabase.from("vendor_portfolio_media")
          .update({ album_id: target.id, display_order: targetCount + index, is_cover: targetCount === 0 && index === 0 })
          .eq("id", sourceItems[index].id).eq("vendor_id", data.vendor?.id);
        if (moveError) throw moveError;
        moved.push(sourceItems[index]);
      }
      const { error: removeError } = await supabase.from("vendor_portfolio_albums")
        .delete().eq("id", moveAlbumSource.id).eq("vendor_id", data.vendor?.id);
      if (removeError) throw removeError;
      setMoveAlbumSource(null);
      setSelectedAlbumId(target.id);
    } catch (caught) {
      if (moved.length && moved.length < sourceItems.length) {
        // Roll the already-moved items back to the source album so a
        // partial failure doesn't leave media split across both albums
        // while the source album still exists.
        await Promise.all(moved.map((item) =>
          supabase.from("vendor_portfolio_media")
            .update({ album_id: item.album_id, display_order: item.display_order, is_cover: item.is_cover })
            .eq("id", item.id).eq("vendor_id", data.vendor?.id),
        ));
      }
      showFailure("Album not moved", caught);
    } finally {
      await refresh();
      setDeletingAlbumId(null);
    }
  };
  const prepareUpload = async (
    targetAlbumId = activeAlbum?.id,
    targetAlbumTitle = activeAlbum?.title ?? "",
    currentMediaCount = media.length,
  ) => {
    if (!requireFeature("upload_gallery")) return;
    if (!data.vendor?.id || !targetAlbumId) return Alert.alert("Create an album first", "Portfolio media must belong to an album.");
    const targetRemaining = Math.max(0, PORTFOLIO_LIMITS.mediaPerAlbum - currentMediaCount);
    if (!targetRemaining) return Alert.alert("Album is full", "Each album can hold 15 photos or videos. Create another album to upload more.");
    try {
      const selected = await pickPortfolioMedia(Math.min(12, targetRemaining));
      const unique = selected.filter((asset, index, all) =>
        all.findIndex((candidate) =>
          candidate.uri === asset.uri
          || (candidate.fileName && candidate.fileName === asset.fileName && candidate.fileSize === asset.fileSize)
        ) === index);
      const existingFingerprints = new Set(data.media.map((item) => item.source_fingerprint).filter(Boolean));
      const withoutStoredDuplicates = unique.filter((asset) => !existingFingerprints.has(portfolioAssetFingerprint(asset)));
      if (withoutStoredDuplicates.length < unique.length) {
        Alert.alert("Duplicate media skipped", `${unique.length - withoutStoredDuplicates.length} file${unique.length - withoutStoredDuplicates.length === 1 ? " was" : "s were"} already in your portfolio.`);
      }
      const longVideos = withoutStoredDuplicates.filter((asset) => asset.type === "video" && (asset.duration ?? 0) > PORTFOLIO_LIMITS.videoWarningSeconds * 1000);
      if (longVideos.length) {
        Alert.alert("Long video", `${longVideos.length} selected video${longVideos.length === 1 ? " is" : "s are"} over 3 minutes. Processing may take longer; the 4-minute limit still applies.`);
      }
      if (!withoutStoredDuplicates.length) return;
      if (withoutStoredDuplicates.length > targetRemaining) {
        return Alert.alert("Too many files", `This album has room for ${targetRemaining} more media item${targetRemaining === 1 ? "" : "s"}.`);
      }
      setUploadAlbumId(targetAlbumId);
      setUploadAlbumTitle(targetAlbumTitle);
      setUploadAlbumInitialCount(currentMediaCount);
      setPendingAssets(withoutStoredDuplicates);
      setUploadProgress(Object.fromEntries(withoutStoredDuplicates.map((asset, index) => {
        const key = `${asset.uri}-${index}`;
        const name = asset.fileName || `${asset.type === "video" ? "Video" : "Image"} ${index + 1}`;
        return [key, { name, progress: 0, status: "waiting" as const }];
      })));
      setUploadModal(true);
    } catch (caught) {
      Alert.alert("Unable to prepare media", caught instanceof Error ? caught.message : "Please try again.");
    }
  };
  const uploadOne = async (asset: PortfolioAsset, index: number) => {
    if (!requireFeature("upload_gallery")) return false;
    if (!data.vendor?.id || !uploadAlbumId) return false;
    const key = `${asset.uri}-${index}`;
    const name = asset.fileName || `${asset.type === "video" ? "Video" : "Image"} ${index + 1}`;
    try {
        setUploadProgress((current) => ({ ...current, [key]: { name, progress: 0, status: "signing" } }));
        const uploaded = await uploadPortfolioAsset(
          asset,
          data.vendor.id,
          uploadAlbumId,
          (value) => setUploadProgress((current) => ({ ...current, [key]: { name, progress: value, status: "uploading" } })),
          (stage) => setUploadProgress((current) => ({ ...current, [key]: {
            name,
            progress: current[key]?.progress ?? 0,
            status: stage === "optimizing" ? "optimizing" : "signing",
          } })),
        );
        setUploadProgress((current) => ({ ...current, [key]: { name, progress: 1, status: "processing" } }));
        if (!uploaded.reservationId) {
          await deleteUnstoredPortfolioAsset(data.vendor.id, uploaded.publicId, uploaded.resourceType).catch(() => undefined);
          throw new Error("Unable to reserve upload capacity. Please try again.");
        }
        // finalize_photo_upload performs the same ownership/feature checks as
        // the old direct insert, plus the atomic total-photo quota check
        // reserve_photo_upload_slot already held a slot for above -- it is
        // now the only way to create a vendor_portfolio_media row.
        const { error: finalizeError } = await supabase.rpc("finalize_photo_upload", {
          target_reservation_id: uploaded.reservationId,
          media_row: {
            vendor_id: data.vendor.id, album_id: uploadAlbumId, secure_url: uploaded.secureUrl,
            public_id: uploaded.publicId, resource_type: uploaded.resourceType, format: uploaded.format,
            width: uploaded.width, height: uploaded.height, duration: uploaded.duration, bytes: uploaded.bytes,
            original_size_bytes: uploaded.originalBytes, optimized_size_bytes: uploaded.optimizedBytes,
            optimized_url: uploaded.optimizedUrl, hero_url: uploaded.heroUrl,
            fullscreen_url: uploaded.fullscreenUrl, video_poster_url: uploaded.videoPosterUrl,
            aspect_ratio: uploaded.width && uploaded.height ? uploaded.width / uploaded.height : null,
            source_fingerprint: portfolioAssetFingerprint(asset),
            thumbnail_url: uploaded.thumbnailUrl, display_order: uploadAlbumInitialCount + index,
            is_cover: uploadAlbumInitialCount === 0 && index === 0,
            upload_status: "completed", processing_status: "ready",
          },
        });
        if (finalizeError) {
          await deleteUnstoredPortfolioAsset(data.vendor.id, uploaded.publicId, uploaded.resourceType).catch(() => undefined);
          throw finalizeError;
        }
        setUploadProgress((current) => ({ ...current, [key]: { name, progress: 1, status: "completed" } }));
        return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed";
      if (__DEV__) console.error("Vendor portfolio upload failed", caught);
      setUploadProgress((current) => ({ ...current, [key]: { name, progress: current[key]?.progress ?? 0, status: "failed", error: message } }));
      return false;
    }
  };
  const upload = async () => {
    if (!requireFeature("upload_gallery")) return;
    const pending = pendingAssets
      .map((asset, index) => ({ asset, index, task: uploadProgress[`${asset.uri}-${index}`] }))
      .filter(({ task }) => !task || task.status === "waiting" || task.status === "failed");
    for (const item of pending) await uploadOne(item.asset, item.index);
    if (pending.length) {
      await refresh();
    }
  };
  const removePendingAsset = (removeIndex: number) => {
    if (uploading) return;
    const next = pendingAssets.filter((_, index) => index !== removeIndex);
    setPendingAssets(next);
    setUploadProgress(Object.fromEntries(next.map((asset, index) => [
      `${asset.uri}-${index}`,
      {
        name: asset.fileName || `${asset.type === "video" ? "Video" : "Image"} ${index + 1}`,
        progress: 0,
        status: "waiting" as const,
      },
    ])));
    if (!next.length) setUploadModal(false);
  };
  const setCover = async (item: any) => {
    if (!requireFeature("manage_albums")) return;
    const { error: coverError } = await supabase.from("vendor_portfolio_media").update({ is_cover: true }).eq("id", item.id).eq("vendor_id", data.vendor?.id);
    if (coverError) return showFailure("Cover not updated", coverError);
    const { error: unsetError } = await supabase.from("vendor_portfolio_media").update({ is_cover: false }).eq("album_id", item.album_id).neq("id", item.id);
    if (unsetError) showFailure("Cover not updated", unsetError);
    await refresh();
  };
  const reorderMedia = async (item: any, direction: -1 | 1) => {
    if (!requireFeature("manage_albums")) return;
    const ordered = [...media].sort((a, b) => a.display_order - b.display_order);
    const index = ordered.findIndex((entry) => entry.id === item.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    const currentOrder = item.display_order;
    const { error: firstError } = await supabase.from("vendor_portfolio_media").update({ display_order: swap.display_order }).eq("id", item.id).eq("vendor_id", data.vendor?.id);
    if (firstError) return showFailure("Order not updated", firstError);
    const { error: orderError } = await supabase.from("vendor_portfolio_media").update({ display_order: currentOrder }).eq("id", swap.id);
    if (orderError) {
      await supabase.from("vendor_portfolio_media").update({ display_order: currentOrder }).eq("id", item.id).eq("vendor_id", data.vendor?.id);
      showFailure("Order not updated", orderError);
    } else refresh();
  };
  const reorderAlbum = async (direction: -1 | 1) => {
    if (!requireFeature("manage_albums")) return;
    if (!activeAlbum) return;
    const ordered = [...data.albums].sort((a, b) => a.display_order - b.display_order);
    const index = ordered.findIndex((entry) => entry.id === activeAlbum.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    const currentOrder = activeAlbum.display_order;
    const { error: firstError } = await supabase.from("vendor_portfolio_albums").update({ display_order: swap.display_order }).eq("id", activeAlbum.id).eq("vendor_id", data.vendor?.id);
    if (firstError) return showFailure("Album order not updated", firstError);
    const { error: orderError } = await supabase.from("vendor_portfolio_albums").update({ display_order: currentOrder }).eq("id", swap.id).eq("vendor_id", data.vendor?.id);
    if (orderError) {
      await supabase.from("vendor_portfolio_albums").update({ display_order: currentOrder }).eq("id", activeAlbum.id).eq("vendor_id", data.vendor?.id);
      showFailure("Album order not updated", orderError);
    } else refresh();
  };
  const removeMedia = (item: any) => {
    if (!requireFeature("manage_albums")) return;
    Alert.alert(
      "Delete media?",
      `${heroDraft.includes(item.id) ? "This image is selected for the public hero gallery and will be removed from it. " : ""}This removes the Cloudinary asset and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          try {
            await deletePortfolioMedia(item.id);
            if (item.is_cover) {
              const nextCover = media.find((entry) => entry.id !== item.id);
              if (nextCover) await supabase.from("vendor_portfolio_media").update({ is_cover: true }).eq("id", nextCover.id).eq("vendor_id", data.vendor?.id);
            }
            setPreview(null);
            await refresh();
          }
          catch (caught) { showFailure("Media not deleted", caught, "Nothing was removed. Please check your connection and try again."); }
        }},
      ],
    );
  };

  return <View style={[styles.page, { backgroundColor: canvas }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView
      contentContainerStyle={[styles.content, width >= 900 && styles.desktop]}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      <View pointerEvents="none" style={styles.ambientGlow} />
      <View style={[styles.headingRow, width < 520 && styles.headingStack]}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: colors.pink }]}>YOUR BEST WORK</Text>
          <Text style={[styles.title, { color: colors.text }]}>Portfolio & Albums</Text>
          <Text style={[styles.subtitle, styles.headingSubtitle, { color: colors.muted }]}>Curate beautiful collections for your public profile.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create album"
          onPress={() => openAlbum()}
          style={({ pressed }) => [
            styles.primary,
            styles.createAlbumButton,
            { backgroundColor: colors.pink, shadowColor: colors.shadow },
            pressed && styles.pressLift,
            data.albums.length >= PORTFOLIO_LIMITS.albums && { opacity: .58 },
          ]}
        >
          <Plus size={19} color="#FFF" strokeWidth={2.4} />
          <Text style={styles.primaryText}>Create album</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={168}
        contentContainerStyle={[styles.summaryGrid, width >= 900 && styles.summaryGridDesktop]}
      >
        {[
          {
            key: "albums",
            icon: <FolderOpen size={19} color={colors.pink} />,
            value: `${data.albums.length}/${PORTFOLIO_LIMITS.albums}`,
            label: "Albums used",
            detail: `${Math.max(0, PORTFOLIO_LIMITS.albums - data.albums.length)} remaining`,
            progress: data.albums.length / PORTFOLIO_LIMITS.albums,
          },
          {
            key: "media",
            icon: <Images size={19} color={colors.pink} />,
            value: String(data.media.length),
            label: "Photos & videos",
            detail: "Media uploaded",
            progress: Math.min(1, data.media.length / (PORTFOLIO_LIMITS.albums * PORTFOLIO_LIMITS.mediaPerAlbum)),
          },
          {
            key: "visible",
            icon: <Eye size={19} color={colors.pink} />,
            value: String(data.albums.filter((album) => album.is_visible).length),
            label: "Visible albums",
            detail: "Publicly visible",
            progress: data.albums.length ? data.albums.filter((album) => album.is_visible).length / data.albums.length : 0,
          },
        ].map((stat) => <View key={stat.key} style={[
          styles.summaryCard,
          width >= 900 && styles.summaryCardDesktop,
          width >= 900 && { width: (contentWidth - 20) / 3 },
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}>
          <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceSoft }]}>{stat.icon}</View>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{stat.value}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>{stat.label}</Text>
          <View style={[styles.statProgress, { backgroundColor: colors.border }]}>
            <View style={[styles.statProgressFill, { width: `${Math.max(4, stat.progress * 100)}%`, backgroundColor: colors.pink }]} />
          </View>
          <Text style={[styles.summaryDetail, { color: stat.key === "albums" ? colors.muted : colors.pink }]}>{stat.detail}</Text>
        </View>)}
      </ScrollView>
      {error && <Text style={[styles.error, { color: colors.warning }]}>We couldn’t load your portfolio. Please refresh and try again.</Text>}
      {portfolioError && <View style={[styles.setupNotice, { backgroundColor: colors.surfaceSoft, borderColor: colors.warning }]}>
        <Text style={[styles.setupTitle, { color: colors.text }]}>Backend setup required</Text>
        <Text style={[styles.setupBody, { color: colors.muted }]}>{portfolioError}</Text>
      </View>}
      {!loading && !data.vendor && <View style={[styles.setupNotice, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <Text style={[styles.setupTitle, { color: colors.text }]}>Vendor profile connection required</Text>
        <Text style={[styles.setupBody, { color: colors.muted }]}>Preview mode can display the gallery, but saving and uploading requires your Vendor account so every album stays private to its owner.</Text>
        <Pressable onPress={() => router.replace("/DashboardCenter")} style={[styles.connectButton, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Connect Vendor Account</Text></Pressable>
      </View>}
      {loading && !data.albums.length ? <View style={styles.skeletonGrid}>
        {[0, 1, 2].map((item) => <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.skeletonCover, { backgroundColor: colors.surfaceSoft }]} />
          <View style={styles.flex}><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceSoft, width: "72%" }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceSoft, width: "48%" }]} /></View>
        </View>)}
      </View> : null}

      {readyHeroImages.length ? <View style={[styles.heroManager, width >= 900 && styles.heroManagerDesktop, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.heroManagerHeader}>
          <View style={[styles.heroTitleIcon, { backgroundColor: colors.surfaceSoft }]}>
            <Sparkles size={19} color={colors.pink} fill={colors.pink} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Profile Hero Gallery</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Choose {requiredHeroCount}–{PORTFOLIO_LIMITS.heroMax} highlights for your profile.</Text>
          </View>
          <Text style={[styles.heroCount, { color: colors.pink, backgroundColor: colors.surfaceSoft }]}>{heroDraft.length}/{PORTFOLIO_LIMITS.heroMax} selected</Text>
        </View>
        {heroPreview ? <View style={[styles.heroStage, { backgroundColor: colors.surfaceSoft }]}>
          <Image
            key={heroPreview.id}
            source={{ uri: portfolioMediaUrl(heroPreview, "hero") }}
            resizeMode="cover"
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={["transparent", "rgba(17,7,12,.58)"]}
            locations={[0.42, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          {readyHeroImages.length > 1 ? <>
            <Pressable
              accessibilityLabel="Previous hero image"
              onPress={() => setHeroPreviewId(readyHeroImages[(heroPreviewIndex - 1 + readyHeroImages.length) % readyHeroImages.length].id)}
              style={({ pressed }) => [styles.heroStageNav, styles.heroStageNavLeft, pressed && styles.pressScale]}
            ><ChevronLeft size={24} color="#2B1520" /></Pressable>
            <Pressable
              accessibilityLabel="Next hero image"
              onPress={() => setHeroPreviewId(readyHeroImages[(heroPreviewIndex + 1) % readyHeroImages.length].id)}
              style={({ pressed }) => [styles.heroStageNav, styles.heroStageNavRight, pressed && styles.pressScale]}
            ><ChevronRight size={24} color="#2B1520" /></Pressable>
          </> : null}
          <View style={styles.heroStageFooter}>
            <View style={styles.heroStageMeta}>
              <Text style={styles.heroStagePosition}>{heroPreviewIndex + 1} of {readyHeroImages.length}</Text>
              <Text style={styles.heroStageHint}>{heroPreviewOrder >= 0 ? `Selected · position ${heroPreviewOrder + 1}` : "Tap its thumbnail to select"}</Text>
            </View>
            {heroPreviewOrder >= 0 ? <View style={[styles.heroSelectedBadge, { backgroundColor: colors.pink }]}>
              <Check size={14} color="#FFF" strokeWidth={3} />
              <Text style={styles.heroSelectedText}>Selected</Text>
            </View> : null}
          </View>
        </View> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroPicker}>
          {readyHeroImages.map((item) => {
            const selectedIndex = heroDraft.indexOf(item.id);
            const selected = selectedIndex >= 0;
            const previewing = item.id === heroPreview?.id;
            return <Pressable
              key={item.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${selected ? "Remove" : "Select"} hero image ${readyHeroImages.indexOf(item) + 1}`}
              onPress={() => {
                setHeroPreviewId(item.id);
                toggleHeroImage(item.id);
              }}
              style={({ pressed }) => [
                styles.heroThumb,
                { backgroundColor: colors.surfaceSoft },
                previewing && { borderColor: colors.pink },
                pressed && styles.pressScale,
              ]}
            >
              <ImageFadeIn source={{ uri: portfolioMediaUrl(item, "thumbnail") }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
              {selected ? <View style={[styles.heroOrder, { backgroundColor: colors.pink }]}>
                <Text style={styles.heroOrderText}>{selectedIndex + 1}</Text>
                <Check size={11} color="#FFF" strokeWidth={3} />
              </View> : <View style={styles.heroUnselectedDot} />}
            </Pressable>;
          })}
        </ScrollView>
        {heroPreviewOrder >= 0 ? <View style={[styles.heroReorder, { backgroundColor: colors.surfaceSoft }]}>
          <Text style={[styles.heroReorderLabel, { color: colors.muted }]}>Position {heroPreviewOrder + 1} of {heroDraft.length}</Text>
          <Pressable
            disabled={heroPreviewOrder === 0}
            accessibilityLabel="Move selected hero image earlier"
            onPress={() => moveHeroImage(heroPreview.id, -1)}
            style={({ pressed }) => [styles.heroReorderButton, { backgroundColor: colors.surface }, heroPreviewOrder === 0 && styles.disabled, pressed && styles.pressScale]}
          ><ChevronLeft size={17} color={colors.text} /><Text style={[styles.heroReorderText, { color: colors.text }]}>Earlier</Text></Pressable>
          <Pressable
            disabled={heroPreviewOrder === heroDraft.length - 1}
            accessibilityLabel="Move selected hero image later"
            onPress={() => moveHeroImage(heroPreview.id, 1)}
            style={({ pressed }) => [styles.heroReorderButton, { backgroundColor: colors.surface }, heroPreviewOrder === heroDraft.length - 1 && styles.disabled, pressed && styles.pressScale]}
          ><Text style={[styles.heroReorderText, { color: colors.text }]}>Later</Text><ChevronRight size={17} color={colors.text} /></Pressable>
        </View> : null}
        <View style={styles.heroActions}>
          <Pressable
            onPress={() => requireFeature("upload_gallery", () => setHeroDraft([]))}
            style={({ pressed }) => [styles.heroAutomatic, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressLift]}
          ><Sparkles size={17} color={colors.text} /><Text style={[styles.heroAutomaticText, { color: colors.text }]}>Use automatic</Text></Pressable>
          <Pressable disabled={savingHero} onPress={saveHeroGallery} style={({ pressed }) => [styles.heroSave, { backgroundColor: colors.pink, shadowColor: colors.shadow }, pressed && styles.pressLift]}>
            {savingHero ? <ActivityIndicator color="#FFF" /> : <><Sparkles size={17} color="#FFF" /><Text style={styles.primaryText}>Save hero gallery</Text></>}
          </Pressable>
        </View>
      </View> : null}

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={[styles.sectionTitle, styles.albumSectionTitle, { color: colors.text }]}>Your Albums</Text>
          <Text style={[styles.sectionCaption, { color: colors.muted }]}>{data.albums.length} curated collection{data.albums.length === 1 ? "" : "s"}</Text>
        </View>
        <Text style={[styles.sectionLink, { color: colors.pink }]}>Swipe to browse</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={274}
        contentContainerStyle={styles.albumStrip}
      >
        {data.albums.map((album) => {
          const albumMedia = data.media.filter((item) => item.album_id === album.id);
          const cover = albumMedia.find((item) => item.is_cover) ?? albumMedia[0];
          const active = activeAlbum?.id === album.id;
          return <View key={album.id} style={[styles.album, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Open ${album.title} album`}
              onPress={() => setSelectedAlbumId(album.id)}
              style={({ pressed }) => [styles.albumSelectArea, pressed && styles.albumPressed]}
            >
              <View style={[styles.albumCover, { backgroundColor: colors.surfaceSoft }]}>
                {cover ? <ImageFadeIn source={{ uri: portfolioMediaUrl(cover, "card") }} resizeMode="cover" style={StyleSheet.absoluteFillObject} /> : <Images size={31} color={colors.muted} />}
                <LinearGradient colors={["transparent", "rgba(20,8,14,.62)"]} locations={[.48, 1]} style={StyleSheet.absoluteFillObject} />
                <View style={styles.albumMediaBadge}><Images size={13} color="#FFF" /><Text style={styles.albumMediaBadgeText}>{albumMedia.length}</Text></View>
              </View>
              <View style={styles.albumBody}>
                <View style={styles.albumTitleRow}>
                  <Text numberOfLines={1} style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text>
                  <View style={[styles.publishBadge, { backgroundColor: album.is_visible ? "#EAF8EF" : colors.surfaceSoft }]}>
                    <View style={[styles.publishDot, { backgroundColor: album.is_visible ? "#55A66B" : colors.muted }]} />
                    <Text style={[styles.publishText, { color: album.is_visible ? "#448A58" : colors.muted }]}>{album.is_visible ? "Published" : "Draft"}</Text>
                  </View>
                </View>
                <Text style={[styles.albumCount, { color: colors.muted }]}>{albumMedia.length} of {PORTFOLIO_LIMITS.mediaPerAlbum} media</Text>
                <View style={[styles.albumCapacity, { backgroundColor: colors.border }]}>
                  <View style={{ width: `${albumMedia.length / PORTFOLIO_LIMITS.mediaPerAlbum * 100}%`, height: "100%", borderRadius: 999, backgroundColor: colors.pink }} />
                </View>
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel={`Open ${album.title} album actions`}
              onPress={() => setAlbumActions(album)}
              style={({ pressed }) => [styles.albumMenuButton, pressed && styles.pressScale]}
            ><MoreHorizontal size={20} color="#2A1721" /></Pressable>
            {active ? <View pointerEvents="none" style={[styles.albumActiveRing, { borderColor: colors.pink }]} /> : null}
          </View>;
        })}
      </ScrollView>

      {!data.albums.length && !loading ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSoft }]}><Images size={30} color={colors.pink} /></View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Build your first album</Text>
        <Text style={[styles.emptyBody, { color: colors.muted }]}>Group related work such as weddings, ceremonies, portraits, or décor so customers can browse with confidence.</Text>
        <Pressable onPress={() => openAlbum()} style={[styles.primary, { backgroundColor: colors.pink }]}><Plus size={18} color="#FFF" /><Text style={styles.primaryText}>Create album</Text></Pressable>
      </View> : null}

      {lockedPhotoCount ? <View style={[styles.subscriptionNotice, { backgroundColor: colors.surfaceSoft }]}><LockKeyhole size={17} color={colors.warning} /><Text style={[styles.subscriptionNoticeText, { color: colors.text }]}>{lockedPhotoCount} photos are safely stored but hidden from customers because your {access?.plan_name || "current"} plan allows {access?.photo_limit ?? 0}. Upgrade to unlock more.</Text><Pressable onPress={() => router.push("/VendorSubscription")}><Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>View plans</Text></Pressable></View> : null}

      {activeAlbum && <View style={[styles.albumDetails, width >= 900 && styles.albumDetailsDesktop, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.albumHeading}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, styles.detailTitle, { color: colors.text }]}>{activeAlbum.title}</Text><Text style={[styles.subtitle, styles.detailSubtitle, { color: colors.muted }]}>{activeAlbum.description || "Add a short description to give this collection context."}</Text></View>
          <Pressable accessibilityLabel="Preview album" onPress={() => setAlbumPreview(activeAlbum)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressScale]}><Eye size={18} color={colors.text} /></Pressable>
          <Pressable accessibilityLabel="Edit album" onPress={() => openAlbum(activeAlbum)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressScale]}><Pencil size={18} color={colors.text} /></Pressable>
          <Pressable disabled={deletingAlbumId === activeAlbum.id} accessibilityLabel="Delete album" onPress={() => removeAlbum(activeAlbum)} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressScale]}>
            {deletingAlbumId === activeAlbum.id ? <ActivityIndicator size="small" color={colors.warning} /> : <Trash2 size={17} color={colors.warning} />}
          </Pressable>
        </View>
        <View style={styles.orderRow}>
          <Text style={[styles.orderLabel, { color: colors.muted }]}>{media.length}/{PORTFOLIO_LIMITS.mediaPerAlbum} media · {remainingCapacity} remaining</Text>
          <Pressable accessibilityLabel="Move album earlier" onPress={() => reorderAlbum(-1)} style={[styles.orderButton, { borderColor: colors.border }]}><ChevronLeft size={15} color={colors.text} /><Text style={[styles.orderText, { color: colors.text }]}>Earlier</Text></Pressable>
          <Pressable accessibilityLabel="Move album later" onPress={() => reorderAlbum(1)} style={[styles.orderButton, { borderColor: colors.border }]}><Text style={[styles.orderText, { color: colors.text }]}>Later</Text><ChevronRight size={15} color={colors.text} /></Pressable>
        </View>
        <Pressable onPress={() => prepareUpload()} disabled={uploading || remainingCapacity === 0} style={({ pressed }) => [styles.upload, { backgroundColor: colors.surfaceSoft }, remainingCapacity === 0 && { opacity: .55 }, pressed && styles.pressLift]}>
          {uploading ? <ActivityIndicator color={colors.pink} /> : <Upload size={19} color={colors.pink} />}
          <Text style={{ color: colors.pink, fontWeight: "700", fontSize: typeScale.body }}>{uploading ? "Uploading securely…" : remainingCapacity === 0 ? "Album limit reached" : "Add images or videos"}</Text>
        </Pressable>
        {remainingCapacity === 0 && <View style={[styles.capacityNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.capacityText, { color: colors.muted }]}>This album contains 15 media items. Create another album to continue uploading.</Text><Pressable onPress={() => openAlbum()}><Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>Create album</Text></Pressable></View>}
        <View onLayout={(event) => setGalleryWidth(event.nativeEvent.layout.width)} style={[styles.mediaGrid, { gap }]}>
          {media.map((item) => <Pressable key={item.id} onPress={() => setPreview(item)} style={{ width: tileWidth }}>
            <View style={[styles.tile, { height: tileWidth * 0.8 }, item.subscription_locked && styles.lockedTile]}>
              <ImageFadeIn source={{ uri: portfolioMediaUrl(item, "thumbnail") }} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
              {item.resource_type === "video" && <View style={styles.play}><Play size={18} fill="#FFF" color="#FFF" /></View>}
              {item.resource_type === "video" && item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, "0")}</Text></View> : null}
              {item.is_cover && <View style={[styles.coverBadge, { backgroundColor: colors.pink }]}><Star size={10} color="#FFF" fill="#FFF" /><Text style={styles.coverText}>Cover</Text></View>}
              {item.subscription_locked ? <View style={styles.lockedOverlay}><LockKeyhole size={18} color="#FFF" /><Text style={styles.lockedOverlayText}>Locked · Upgrade</Text></View> : null}
              <View style={styles.viewBadge}><Eye size={13} color="#FFF" /></View>
            </View>
          </Pressable>)}
        </View>
        {!media.length && <View style={styles.mediaEmpty}><ImagePlus size={26} color={colors.muted} /><Text style={[styles.emptyBody, { color: colors.muted }]}>This album is ready for its first upload.</Text></View>}
      </View>}
    </ScrollView>

    <Modal visible={albumModal} transparent animationType="fade" onRequestClose={() => setAlbumModal(false)}>
      <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{editingAlbum ? "Edit album" : "New album"}</Text><Pressable onPress={() => setAlbumModal(false)}><X size={21} color={colors.text} /></Pressable></View>
        <Text style={[styles.inputLabel, { color: colors.text }]}>Album title</Text>
        <TextInput value={title} onChangeText={setTitle} maxLength={60} placeholder="e.g. Intimate weddings" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
        <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
        <TextInput value={description} onChangeText={setDescription} multiline maxLength={300} placeholder="What makes this collection special?" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
        <View style={[styles.visibilityRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.visibilityTitle, { color: colors.text }]}>Visible on public profile</Text>
            <Text style={[styles.visibilityHint, { color: colors.muted }]}>Turn this off to keep the album private while you prepare it.</Text>
          </View>
          <Switch
            accessibilityLabel="Album visibility"
            value={isVisible}
            onValueChange={setIsVisible}
            trackColor={{ false: colors.border, true: colors.pink }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Text style={[styles.modalHint, { color: colors.muted }]}>Customers will see the album title, description and selected cover in the public preview.</Text>
        <View style={styles.albumSaveActions}>
          <Pressable disabled={saving || !title.trim()} onPress={() => saveAlbum(false)} style={[styles.save, styles.albumSaveSecondary, { borderColor: colors.pink }, (!title.trim() || saving) && { opacity: 0.5 }]}>
            <Text style={[styles.primaryText, { color: colors.pink }]}>Save album</Text>
          </Pressable>
          {!editingAlbum && <Pressable disabled={saving || !title.trim()} onPress={() => saveAlbum(true)} style={[styles.save, styles.albumSavePrimary, { backgroundColor: colors.pink }, (!title.trim() || saving) && { opacity: 0.5 }]}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><ImagePlus size={17} color="#FFF" /><Text style={styles.primaryText}>Save & add media</Text></>}
          </Pressable>}
        </View>
      </View></View>
    </Modal>

    <Modal visible={uploadModal} transparent animationType="fade" onRequestClose={() => !uploading && setUploadModal(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.uploadSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upload media</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>To {uploadAlbumTitle || activeAlbum?.title} · {pendingAssets.length} selected</Text>
            </View>
            <Pressable disabled={uploading} accessibilityLabel="Close upload" onPress={() => setUploadModal(false)}><X size={21} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={styles.uploadList} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {pendingAssets.map((asset, index) => {
              const task = uploadProgress[`${asset.uri}-${index}`];
              const completed = task?.status === "completed";
              const failed = task?.status === "failed";
              return <View key={`${asset.uri}-${index}`} style={[styles.uploadAsset, { backgroundColor: colors.background, borderColor: failed ? colors.warning : colors.border }]}>
                <View style={styles.uploadThumb}>
                  <Image source={{ uri: asset.uri }} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
                  {asset.type === "video" && <View style={styles.miniPlay}><Play size={12} color="#FFF" fill="#FFF" /></View>}
                </View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.uploadAssetName, { color: colors.text }]}>{task?.name}</Text>
                  <Text style={[styles.uploadAssetMeta, { color: colors.muted }]}>
                    {[asset.fileSize ? `${(asset.fileSize / 1024 / 1024).toFixed(1)} MB` : null, asset.type === "video" && asset.duration ? `${Math.round(asset.duration / 1000)} sec` : null].filter(Boolean).join(" · ")}
                  </Text>
                  <Text style={[styles.uploadStatus, { color: failed ? colors.warning : completed ? colors.pink : colors.muted }]}>
                    {task?.status === "waiting" ? "Ready" : task?.status === "optimizing" ? "Optimizing image…" : task?.status === "signing" ? "Securing upload…" : task?.status === "uploading" ? `${Math.round(task.progress * 100)}% uploaded` : task?.status === "processing" ? "Finalising…" : completed ? "Stored successfully" : "Upload failed. Tap retry."}
                  </Text>
                  <View style={[styles.progress, { backgroundColor: colors.border }]}>
                    <View style={{ width: `${Math.round((task?.progress ?? 0) * 100)}%`, height: "100%", backgroundColor: failed ? colors.warning : colors.pink }} />
                  </View>
                </View>
                {completed ? <CheckCircle2 size={20} color={colors.pink} /> : failed ? (
                  <Pressable accessibilityLabel="Retry upload" onPress={() => uploadOne(asset, index)} style={styles.taskAction}><RotateCcw size={18} color={colors.warning} /></Pressable>
                ) : (
                  <Pressable disabled={uploading} accessibilityLabel="Remove selected media" onPress={() => removePendingAsset(index)} style={styles.taskAction}><X size={18} color={colors.muted} /></Pressable>
                )}
              </View>;
            })}
          </ScrollView>
          <View style={[styles.uploadFooter, { borderTopColor: colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.modalHint, { color: colors.muted, margin: 0 }]}>Large images are optimized automatically. Videos keep the existing 25 MB final limit and 4-minute duration limit.</Text>
              {pendingAssets.length > 0 && <Text style={[styles.overallProgress, { color: colors.pink }]}>Overall {Math.round(Object.values(uploadProgress).reduce((sum, task) => sum + task.progress, 0) / pendingAssets.length * 100)}%</Text>}
            </View>
            <Pressable
              disabled={uploading || !pendingAssets.length || Object.values(uploadProgress).every((task) => task.status === "completed")}
              onPress={upload}
              style={[styles.save, styles.uploadStart, { backgroundColor: colors.pink }, uploading && { opacity: .65 }]}
            >
              {uploading ? <ActivityIndicator color="#FFF" /> : <><Upload size={17} color="#FFF" /><Text style={styles.primaryText}>Upload</Text></>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(albumActions)} transparent animationType="fade" onRequestClose={() => setAlbumActions(null)}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.albumActionSheet, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
          <View style={[styles.albumActionHandle, { backgroundColor: colors.border }]} />
          <View style={styles.albumActionHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{albumActions?.title}</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Album actions</Text>
            </View>
            <Pressable accessibilityLabel="Close album actions" onPress={() => setAlbumActions(null)} style={[styles.albumActionClose, { backgroundColor: colors.surfaceSoft }]}>
              <X size={18} color={colors.text} />
            </Pressable>
          </View>
          <Pressable onPress={() => { setAlbumPreview(albumActions); setAlbumActions(null); }} style={({ pressed }) => [styles.albumActionItem, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressLift]}>
            <View style={[styles.albumActionIcon, { backgroundColor: colors.surface }]}><Eye size={19} color={colors.text} /></View>
            <View style={styles.flex}><Text style={[styles.albumActionTitle, { color: colors.text }]}>Preview album</Text><Text style={[styles.albumActionHint, { color: colors.muted }]}>See what customers will view</Text></View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => { const album = albumActions; setAlbumActions(null); openAlbum(album); }} style={({ pressed }) => [styles.albumActionItem, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressLift]}>
            <View style={[styles.albumActionIcon, { backgroundColor: colors.surface }]}><Pencil size={19} color={colors.text} /></View>
            <View style={styles.flex}><Text style={[styles.albumActionTitle, { color: colors.text }]}>Edit details</Text><Text style={[styles.albumActionHint, { color: colors.muted }]}>Update title, description or visibility</Text></View>
            <ChevronRight size={18} color={colors.muted} />
          </Pressable>
          <Pressable onPress={() => { const album = albumActions; setAlbumActions(null); removeAlbum(album); }} style={({ pressed }) => [styles.albumActionItem, { backgroundColor: colors.surfaceSoft }, pressed && styles.pressLift]}>
            <View style={[styles.albumActionIcon, { backgroundColor: colors.surface }]}><Trash2 size={19} color={colors.warning} /></View>
            <View style={styles.flex}><Text style={[styles.albumActionTitle, { color: colors.warning }]}>Delete album</Text><Text style={[styles.albumActionHint, { color: colors.muted }]}>Move or remove its media safely</Text></View>
          </Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(albumPreview)} transparent animationType="fade" onRequestClose={() => setAlbumPreview(null)}>
      <View style={[styles.albumPreviewBackdrop, { backgroundColor: colors.background }]}>
        <View style={[styles.albumPreviewHeader, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable accessibilityLabel="Close album preview" onPress={() => setAlbumPreview(null)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><X size={19} color={colors.text} /></Pressable>
          <View style={styles.flex}><Text style={[styles.previewEyebrow, { color: colors.pink }]}>CUSTOMER PREVIEW</Text><Text numberOfLines={1} style={[styles.albumPreviewTitle, { color: colors.text }]}>{albumPreview?.title}</Text></View>
          <View style={[styles.previewCount, { backgroundColor: colors.surfaceSoft }]}><Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>{data.media.filter((item) => item.album_id === albumPreview?.id).length} media</Text></View>
        </View>
        <ScrollView bounces={false} overScrollMode="never" contentContainerStyle={styles.albumPreviewContent}>
          <View style={[styles.albumPreviewHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.previewFolder, { backgroundColor: colors.surfaceSoft }]}><FolderOpen size={24} color={colors.pink} /></View>
            <Text style={[styles.albumPreviewName, { color: colors.text }]}>{albumPreview?.title}</Text>
            <Text style={[styles.albumPreviewDescription, { color: colors.muted }]}>{albumPreview?.description || "A curated selection from our recent work."}</Text>
          </View>
          <View onLayout={(event) => setPreviewGridWidth(event.nativeEvent.layout.width)} style={[styles.mediaGrid, { gap }]}>
            {data.media.filter((item) => item.album_id === albumPreview?.id).map((item) => <Pressable key={item.id} onPress={() => { setAlbumPreview(null); setPreview(item); }} style={{ width: previewTileWidth }}>
              <View style={[styles.tile, { height: previewTileWidth * .8 }]}>
                <ImageFadeIn source={{ uri: portfolioMediaUrl(item, "thumbnail") }} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
                {item.resource_type === "video" && <View style={styles.play}><Play size={18} fill="#FFF" color="#FFF" /></View>}
                {item.is_cover && <View style={[styles.coverBadge, { backgroundColor: colors.pink }]}><Star size={10} color="#FFF" fill="#FFF" /><Text style={styles.coverText}>Cover</Text></View>}
              </View>
            </Pressable>)}
          </View>
          {!data.media.some((item) => item.album_id === albumPreview?.id) && <View style={styles.mediaEmpty}><ImagePlus size={27} color={colors.muted} /><Text style={[styles.emptyBody, { color: colors.muted }]}>This album has no published media yet.</Text></View>}
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
      <View style={styles.previewBackdrop}>
        <Pressable onPress={() => setPreview(null)} style={[styles.previewClose, { top: insets.top + 12 }]}><X size={24} color="#FFF" /></Pressable>
        {previewIndex > 0 && <Pressable accessibilityLabel="Previous media" onPress={() => setPreview(previewMedia[previewIndex - 1])} style={[styles.previewNav, styles.previewNavLeft]}><ChevronLeft size={26} color="#FFF" /></Pressable>}
        {previewIndex >= 0 && previewIndex < previewMedia.length - 1 && <Pressable accessibilityLabel="Next media" onPress={() => setPreview(previewMedia[previewIndex + 1])} style={[styles.previewNav, styles.previewNavRight]}><ChevronRight size={26} color="#FFF" /></Pressable>}
        {preview?.resource_type === "video"
          ? <View style={styles.previewImage}><PortfolioVideoPlayer uri={preview.secure_url} /></View>
          : preview && <ScrollView
            style={styles.previewImage}
            contentContainerStyle={styles.previewZoomContent}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
          ><Image source={{ uri: preview.secure_url }} style={styles.previewZoomImage} resizeMode="contain" /></ScrollView>}
        {preview && <View style={styles.previewDetails}>
          <Text style={styles.previewPosition}>{previewIndex + 1} / {previewMedia.length}</Text>
          <Text style={styles.previewMeta}>
            {[preview.width && preview.height ? `${preview.width}×${preview.height}` : null, preview.bytes ? `${(preview.bytes / 1024 / 1024).toFixed(1)} MB` : null, preview.duration ? `${Math.round(preview.duration)} sec` : null].filter(Boolean).join(" · ")}
          </Text>
        </View>}
        {preview && <View style={styles.previewActions}>
          <Pressable accessibilityLabel="Move media earlier" onPress={() => reorderMedia(preview, -1)} style={styles.previewButton}><Text style={styles.previewText}>← Earlier</Text></Pressable>
          <Pressable accessibilityLabel="Move media later" onPress={() => reorderMedia(preview, 1)} style={styles.previewButton}><Text style={styles.previewText}>Later →</Text></Pressable>
          {data.albums.length > 1 && <Pressable onPress={() => requireFeature("manage_albums", () => setMoveMediaItem(preview))} style={styles.previewButton}><Move size={17} color="#FFF" /><Text style={styles.previewText}>Move</Text></Pressable>}
          {!preview.is_cover && <Pressable onPress={() => { setCover(preview); setPreview(null); }} style={styles.previewButton}><Star size={17} color="#FFF" /><Text style={styles.previewText}>Set cover</Text></Pressable>}
          {preview.resource_type === "image" && <Pressable onPress={() => requireFeature("upload_gallery", () => { setFocalMedia(preview); setPreview(null); })} style={styles.previewButton}><Crosshair size={17} color="#FFF" /><Text style={styles.previewText}>Focal point</Text></Pressable>}
          <Pressable onPress={() => removeMedia(preview)} style={styles.previewButton}><Trash2 size={17} color="#FFF" /><Text style={styles.previewText}>Delete</Text></Pressable>
        </View>}
      </View>
    </Modal>

    <Modal visible={Boolean(focalMedia)} transparent animationType="fade" onRequestClose={() => setFocalMedia(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Set focal point</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Tap the most important subject. Hero and card crops will keep this area in view.</Text></View>
          <Pressable onPress={() => setFocalMedia(null)}><X size={21} color={colors.text} /></Pressable>
        </View>
        {focalMedia ? <Pressable
          accessibilityLabel="Choose image focal point"
          onLayout={(event) => setFocalFrame(event.nativeEvent.layout)}
          onPress={async (event) => {
            if (!requireFeature("upload_gallery")) return;
            const x = event.nativeEvent.locationX / focalFrame.width;
            const y = event.nativeEvent.locationY / focalFrame.height;
            try {
              await updateMediaFocalPoint(focalMedia.id, x, y);
              setFocalMedia({ ...focalMedia, focal_point_x: x, focal_point_y: y });
              await refresh();
            } catch (caught) {
              showFailure("Focal point not saved", caught);
            }
          }}
          style={styles.focalImage}
        >
          <Image source={{ uri: focalMedia.hero_url || focalMedia.secure_url }} resizeMode="cover" style={StyleSheet.absoluteFillObject} />
          <View style={[styles.focalMarker, {
            left: `${Number(focalMedia.focal_point_x ?? .5) * 100}%`,
            top: `${Number(focalMedia.focal_point_y ?? .5) * 100}%`,
          }]}><Crosshair size={24} color="#FFF" /></View>
        </Pressable> : null}
        <Pressable onPress={() => setFocalMedia(null)} style={[styles.save, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Done</Text></Pressable>
      </View></View>
    </Modal>

    <Modal visible={Boolean(moveMediaItem || moveAlbumSource)} transparent animationType="fade" onRequestClose={() => { setMoveMediaItem(null); setMoveAlbumSource(null); }}>
      <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Choose destination</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{moveAlbumSource ? `Move every item from ${moveAlbumSource.title}` : "Move this item to another album"}</Text></View>
          <Pressable onPress={() => { setMoveMediaItem(null); setMoveAlbumSource(null); }}><X size={21} color={colors.text} /></Pressable>
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 9 }}>
          {data.albums.filter((album) => album.id !== (moveAlbumSource?.id || moveMediaItem?.album_id)).map((album) => {
            const count = data.media.filter((item) => item.album_id === album.id).length;
            const needed = moveAlbumSource ? data.media.filter((item) => item.album_id === moveAlbumSource.id).length : 1;
            const disabled = count + needed > PORTFOLIO_LIMITS.mediaPerAlbum;
            return <Pressable
              key={album.id}
              disabled={disabled || Boolean(deletingAlbumId)}
              onPress={() => moveAlbumSource ? moveAlbumMediaTo(album) : moveMediaToAlbum(moveMediaItem, album)}
              style={[styles.destination, { backgroundColor: colors.background, borderColor: colors.border }, disabled && { opacity: .45 }]}
            >
              <View style={[styles.destinationIcon, { backgroundColor: colors.surfaceSoft }]}><FolderOpen size={18} color={colors.pink} /></View>
              <View style={styles.flex}><Text style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text><Text style={[styles.albumCount, { color: colors.muted }]}>{count}/{PORTFOLIO_LIMITS.mediaPerAlbum} items · {PORTFOLIO_LIMITS.mediaPerAlbum - count} spaces</Text></View>
              {deletingAlbumId ? <ActivityIndicator color={colors.pink} /> : <ChevronRight size={18} color={colors.muted} />}
            </Pressable>;
          })}
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { position: "relative", padding: 16, paddingTop: 22, paddingBottom: 112, alignSelf: "center", width: "100%" },
  desktop: { maxWidth: 1180, paddingHorizontal: 28, paddingTop: 30, paddingBottom: 56 },
  ambientGlow: { position: "absolute", top: -90, right: -110, width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(233,30,99,.055)" },
  flex: { flex: 1, minWidth: 0 },
  headingRow: { flexDirection: "row", gap: 20, alignItems: "center", marginBottom: 22 },
  headingStack: { flexDirection: "column", alignItems: "stretch", gap: 15 },
  eyebrow: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700", letterSpacing: 1.8, marginBottom: 8 },
  title: { ...typeStyles.pageTitle },
  subtitle: { ...typeStyles.body, marginTop: 5 },
  headingSubtitle: { maxWidth: 510 },
  primary: { minHeight: 48, paddingHorizontal: 18, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  createAlbumButton: { minHeight: 48, borderRadius: 14 },
  primaryText: { color: "#FFF", fontWeight: "700", fontSize: typeScale.body },
  pressScale: { transform: [{ scale: .97 }], opacity: .92 },
  pressLift: { transform: [{ translateY: 1 }, { scale: .985 }], opacity: .94 },
  disabled: { opacity: .36 },
  error: { fontSize: typeScale.bodyCompact, marginBottom: 16 },
  summaryGrid: { gap: 10, paddingHorizontal: 1, paddingBottom: 22 },
  summaryGridDesktop: { width: "100%" },
  summaryCard: { width: 150, minHeight: 144, borderWidth: 1, borderRadius: 16, padding: 15 },
  summaryCardDesktop: { minHeight: 126, paddingHorizontal: 18, paddingVertical: 16 },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  summaryValue: { fontSize: typeScale.pageTitle, lineHeight: typeLeading.metric, fontWeight: "700", letterSpacing: -.5 },
  summaryLabel: { fontSize: typeScale.metadata, lineHeight: typeLeading.label, marginTop: 1 },
  summaryDetail: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700", marginTop: 8 },
  statProgress: { height: 4, borderRadius: 999, overflow: "hidden", marginTop: 10 },
  statProgressFill: { height: "100%", borderRadius: 999 },
  skeletonGrid: { flexDirection: "row", gap: 12, paddingBottom: 28, overflow: "hidden" },
  skeletonCard: { width: 260, height: 286, padding: 10, borderRadius: 24 },
  skeletonCover: { width: "100%", height: 184, borderRadius: 18 },
  skeletonLine: { height: 9, borderRadius: 5, marginTop: 12 },
  empty: { borderWidth: 0, borderRadius: 24, padding: 30, alignItems: "center", marginTop: 8, shadowColor: "#7D3D58", shadowOffset: { width: 0, height: 8 }, shadowOpacity: .08, shadowRadius: 18, elevation: 2 },
  emptyIcon: { width: 60, height: 60, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: typeScale.sectionTitle, fontWeight: "700", letterSpacing: -.3 },
  emptyBody: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, textAlign: "center", maxWidth: 430, marginVertical: 8, marginBottom: 16 },
  heroManager: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 28 },
  heroManagerDesktop: { padding: 20 },
  heroManagerHeader: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 16 },
  heroTitleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.editorialCardTitle, fontWeight: "700", letterSpacing: -.35 },
  heroCount: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700" },
  heroStage: { width: "100%", aspectRatio: 1.62, borderRadius: 14, overflow: "hidden" },
  heroStageNav: { position: "absolute", top: "50%", marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,.92)", alignItems: "center", justifyContent: "center", shadowColor: "#1A0911", shadowOffset: { width: 0, height: 4 }, shadowOpacity: .17, shadowRadius: 10, elevation: 4 },
  heroStageNavLeft: { left: 12 },
  heroStageNavRight: { right: 12 },
  heroStageFooter: { position: "absolute", left: 15, right: 15, bottom: 13, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  heroStageMeta: { flex: 1 },
  heroStagePosition: { color: "#FFF", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" },
  heroStageHint: { color: "rgba(255,255,255,.76)", fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 2 },
  heroSelectedBadge: { minHeight: 30, borderRadius: 999, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  heroSelectedText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  heroPicker: { gap: 10, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 1 },
  heroThumb: { width: 78, height: 68, borderWidth: 2, borderColor: "transparent", borderRadius: 15, overflow: "hidden" },
  heroOrder: { position: "absolute", right: 5, top: 5, minWidth: 29, height: 24, borderRadius: 12, paddingHorizontal: 6, flexDirection: "row", gap: 2, alignItems: "center", justifyContent: "center" },
  heroOrderText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  heroUnselectedDot: { position: "absolute", right: 7, top: 7, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,.92)", backgroundColor: "rgba(18,8,13,.22)" },
  heroReorder: { minHeight: 48, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  heroReorderLabel: { flex: 1, fontSize: typeScale.caption, fontWeight: "700" },
  heroReorderButton: { minHeight: 34, borderRadius: 11, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 3 },
  heroReorderText: { fontSize: typeScale.caption, fontWeight: "700" },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  heroAutomatic: { minHeight: 46, flex: 1, borderRadius: 15, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  heroAutomaticText: { fontSize: typeScale.caption, fontWeight: "700" },
  heroSave: { minHeight: 48, flex: 1.2, borderRadius: 14, paddingHorizontal: 12, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 14, paddingHorizontal: 2 },
  albumSectionTitle: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  sectionCaption: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 2 },
  sectionLink: { fontSize: typeScale.caption, fontWeight: "700", paddingBottom: 2 },
  albumStrip: { gap: 12, paddingHorizontal: 1, paddingBottom: 24 },
  album: { position: "relative", width: 252, height: 276, borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  albumSelectArea: { flex: 1, borderRadius: 15, overflow: "hidden" },
  albumPressed: { transform: [{ scale: .985 }], opacity: .94 },
  albumCover: { width: "100%", height: 176, alignItems: "center", justifyContent: "center", overflow: "hidden", borderTopLeftRadius: 15, borderTopRightRadius: 15 },
  albumMediaBadge: { position: "absolute", left: 13, bottom: 12, minHeight: 28, borderRadius: 999, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(18,8,13,.58)" },
  albumMediaBadgeText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  albumBody: { flex: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  albumTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  albumTitle: { flex: 1, fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, fontWeight: "700" },
  albumCount: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 5 },
  publishBadge: { minHeight: 24, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  publishDot: { width: 5, height: 5, borderRadius: 3 },
  publishText: { fontSize: typeScale.caption, fontWeight: "700" },
  albumCapacity: { height: 4, borderRadius: 999, overflow: "hidden", marginTop: 11, width: "100%" },
  albumMenuButton: { position: "absolute", top: 12, right: 12, zIndex: 3, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,.92)", alignItems: "center", justifyContent: "center", shadowColor: "#1A0911", shadowOffset: { width: 0, height: 4 }, shadowOpacity: .15, shadowRadius: 9, elevation: 3 },
  albumActiveRing: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 16, borderWidth: 2, zIndex: 4 },
  albumActionSheet: { width: "100%", maxWidth: 520, alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30, shadowOffset: { width: 0, height: -8 }, shadowOpacity: .12, shadowRadius: 26, elevation: 8 },
  albumActionHandle: { width: 38, height: 4, borderRadius: 999, alignSelf: "center", marginBottom: 18 },
  albumActionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  albumActionClose: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  albumActionItem: { minHeight: 68, borderRadius: 18, padding: 10, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 },
  albumActionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  albumActionTitle: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" },
  albumActionHint: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
  albumDetails: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 24 },
  albumDetailsDesktop: { padding: 20 },
  albumHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 16 },
  detailTitle: { fontSize: typeScale.sectionTitle, lineHeight: typeLeading.sectionTitle },
  detailSubtitle: { maxWidth: 520 },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  orderRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, marginBottom: 12 },
  orderLabel: { flex: 1, fontSize: typeScale.caption },
  orderButton: { height: 36, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 3 },
  orderText: { fontSize: typeScale.caption, fontWeight: "700" },
  upload: { minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 },
  uploadTask: { marginBottom: 8 }, uploadTaskLabel: { flexDirection: "row", gap: 8, marginBottom: 5 }, uploadName: { flex: 1, fontSize: typeScale.caption }, uploadPercent: { fontSize: typeScale.caption, fontWeight: "700" },
  progress: { height: 5, borderRadius: 4, overflow: "hidden" }, mediaGrid: { flexDirection: "row", flexWrap: "wrap" }, tile: { width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: "#050505" },
  lockedTile: { opacity: 0.82 }, lockedOverlay: { position: "absolute", left: 7, right: 7, top: 7, minHeight: 32, borderRadius: 10, backgroundColor: "rgba(20,10,15,.76)", paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, lockedOverlayText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  play: { position: "absolute", top: "50%", left: "50%", marginLeft: -19, marginTop: -19, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,.55)", alignItems: "center", justifyContent: "center" },
  coverBadge: { position: "absolute", left: 7, bottom: 7, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 3 }, coverText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  durationBadge: { position: "absolute", right: 7, bottom: 7, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: "rgba(0,0,0,.62)", borderRadius: 7 }, durationText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  viewBadge: { position: "absolute", right: 7, top: 7, width: 27, height: 27, borderRadius: 9, backgroundColor: "rgba(0,0,0,.42)", alignItems: "center", justifyContent: "center" },
  mediaEmpty: { alignItems: "center", paddingVertical: 34 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(20,10,15,.45)", justifyContent: "flex-end", padding: Platform.OS === "web" ? 20 : 0 },
  sheet: { width: "100%", maxWidth: 520, alignSelf: "center", borderWidth: 1, borderRadius: 26, padding: 20, paddingBottom: 30 }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  inputLabel: { fontSize: typeScale.metadata, fontWeight: "700", marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 15, fontSize: typeScale.body }, textarea: { minHeight: 96, paddingTop: 13, textAlignVertical: "top" },
  modalHint: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginBottom: 14, marginTop: -3 },
  visibilityRow: { minHeight: 66, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 15 },
  visibilityTitle: { fontSize: typeScale.metadata, fontWeight: "700" }, visibilityHint: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
  save: { minHeight: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 4 },
  albumSaveActions: { flexDirection: "row", gap: 9 }, albumSaveSecondary: { flex: 1, borderWidth: 1 }, albumSavePrimary: { flex: 1.35, flexDirection: "row", gap: 7 },
  setupNotice: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 15 },
  subscriptionNotice: { borderRadius: 16, padding: 13, marginBottom: 15, flexDirection: "row", alignItems: "center", gap: 10 }, subscriptionNoticeText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "600" },
  setupTitle: { fontSize: typeScale.metadata, fontWeight: "700" }, setupBody: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 4 },
  connectButton: { alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 13, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 10 },
  capacityNotice: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
  capacityText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
  uploadSheet: { width: "100%", maxWidth: 620, maxHeight: "88%", alignSelf: "center", borderWidth: 1, borderRadius: 26, padding: 20 },
  uploadList: { maxHeight: 470, marginBottom: 14 }, uploadAsset: { minHeight: 76, borderWidth: 1, borderRadius: 16, padding: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadThumb: { width: 58, height: 58, borderRadius: 12, overflow: "hidden", backgroundColor: "#050505" }, miniPlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.18)" },
  uploadAssetName: { fontSize: typeScale.metadata, fontWeight: "700" }, uploadAssetMeta: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 2 }, uploadStatus: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3, marginBottom: 6 },
  taskAction: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  uploadFooter: { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 14 },
  overallProgress: { fontSize: typeScale.caption, fontWeight: "700", marginTop: 5 },
  uploadStart: { width: 122, marginTop: 0, flexDirection: "row", gap: 7 },
  destination: { minHeight: 66, padding: 9, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  destinationIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  focalImage: { width: "100%", aspectRatio: 1.45, overflow: "hidden", borderRadius: 18, backgroundColor: "#21171C", marginBottom: 14 },
  focalMarker: { position: "absolute", width: 42, height: 42, marginLeft: -21, marginTop: -21, borderRadius: 21, backgroundColor: "rgba(233,30,99,.78)", borderWidth: 2, borderColor: "#FFF", alignItems: "center", justifyContent: "center" },
  albumPreviewBackdrop: { flex: 1 }, albumPreviewHeader: { minHeight: 82, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 11 },
  previewEyebrow: { fontSize: typeScale.caption, fontWeight: "700", letterSpacing: 1.3 }, albumPreviewTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 2 },
  previewCount: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, albumPreviewContent: { width: "100%", maxWidth: 1040, alignSelf: "center", padding: 16, paddingBottom: 40 },
  albumPreviewHero: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: "center", marginBottom: 14 }, previewFolder: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  albumPreviewName: { fontSize: typeScale.metric, fontWeight: "700", textAlign: "center", marginTop: 12 }, albumPreviewDescription: { fontSize: typeScale.metadata, lineHeight: typeLeading.tab, textAlign: "center", maxWidth: 520, marginTop: 6 },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(10,7,9,.96)", alignItems: "center", justifyContent: "center" }, previewClose: { position: "absolute", right: 20, top: 55, zIndex: 3, padding: 10 },
  previewImage: { width: "100%", height: "68%" }, previewZoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" }, previewZoomImage: { width: "100%", height: "100%" },
  previewNav: { position: "absolute", top: "47%", zIndex: 3, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,.13)", alignItems: "center", justifyContent: "center" },
  previewNavLeft: { left: 12 }, previewNavRight: { right: 12 },
  previewDetails: { position: "absolute", bottom: 91, alignItems: "center" }, previewPosition: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" }, previewMeta: { color: "rgba(255,255,255,.64)", fontSize: typeScale.caption, marginTop: 3 },
  previewActions: { position: "absolute", bottom: 32, left: 16, right: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }, previewButton: { backgroundColor: "rgba(255,255,255,.14)", paddingHorizontal: 13, height: 42, borderRadius: 14, flexDirection: "row", gap: 6, alignItems: "center" }, previewText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
} as const);
