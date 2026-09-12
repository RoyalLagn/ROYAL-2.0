import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Crosshair, Eye, FolderOpen, ImagePlus, Images, LockKeyhole, MoreHorizontal, Move, Pencil, Play, Plus, RotateCcw, Star, Trash2, Upload, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { deletePortfolioMedia, deleteUnstoredPortfolioAsset, pickPortfolioMedia, type PortfolioAsset, uploadPortfolioAsset } from "@/services/media";
import { supabase } from "@/services/supabase";
import PortfolioVideoPlayer from "@/components/vendor/PortfolioVideoPlayer";
import { portfolioAssetFingerprint, portfolioMediaUrl, PORTFOLIO_LIMITS, updateMediaFocalPoint } from "@/services/vendorPortfolio";
import { useSubscriptionAccess } from "@/hooks/useSubscriptionAccess";
import ImageFadeIn from "@/components/loading/ImageFadeIn";
import { typeScale } from "@/constants/typography";
import { vendorGalleryStyles as styles } from "@/components/vendor/gallery/vendorGalleryStyles";
import Pressable from "@/components/InteropSafePressable";
import { useAppFeedback } from "@/context/AppFeedbackContext";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";

export default function VendorGallery() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wideWebLayout = Platform.OS === "web" && width >= 1180;
  const compactUploadSheet = Platform.OS !== "web" && width < 600;
  const insets = useSafeAreaInsets();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
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
  const albumFormScrollRef = useRef<ScrollView>(null);
  const albumTitleRef = useRef<TextInput>(null);
  const albumDescriptionRef = useRef<TextInput>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, {
    name: string;
    progress: number;
    status: "waiting" | "optimizing" | "signing" | "uploading" | "processing" | "completed" | "failed";
    error?: string;
  }>>({});
  const [preview, setPreview] = useState<any>(null);
  const [previewDeleteCandidate, setPreviewDeleteCandidate] = useState<any>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
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
  const [focalMedia, setFocalMedia] = useState<any>(null);
  const [focalFrame, setFocalFrame] = useState({ width: 1, height: 1 });
  const gap = 10;
  const contentWidth = Math.min(width, wideWebLayout ? 1600 : 1120) - (width >= 900 ? (wideWebLayout ? 72 : 56) : 32);
  // Portfolio media grid: columns/tile width are derived from the grid's own
  // measured layout width (onLayout below), not just the window width. This
  // keeps the 2-up mobile grid correct even when the rendered container is
  // narrower/wider than the raw window (e.g. Android/Expo Go safe-area and
  // navigator chrome), which is what made the grid collapse to one oversized
  // column per row instead of two.
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [previewGridWidth, setPreviewGridWidth] = useState(0);
  const [albumGridWidth, setAlbumGridWidth] = useState(0);
  const columnsForWidth = (w: number) => (wideWebLayout && w >= 1180 ? 5 : w >= 900 ? 4 : w >= 600 ? 3 : 2);
  const tileWidthForContainer = (containerWidth: number) => {
    const measured = containerWidth || contentWidth;
    const cols = columnsForWidth(measured);
    return (measured - gap * (cols - 1)) / cols;
  };
  const tileWidth = tileWidthForContainer(galleryWidth);
  const previewTileWidth = tileWidthForContainer(previewGridWidth);
  const albumColumns = wideWebLayout ? 3 : 2;
  const albumStripHorizontalPadding = 2;
  const albumGridAvailableWidth = albumGridWidth || contentWidth;
  const albumWidth = Math.floor(
    (albumGridAvailableWidth - albumStripHorizontalPadding - gap * (albumColumns - 1)) / albumColumns,
  );
  const albumHeight = Math.round(albumWidth * (wideWebLayout ? 0.92 : width >= 900 ? 1.06 : 1.13));
  const albumCoverHeight = Math.round(albumWidth * (wideWebLayout ? 0.54 : 0.58));
  const activeAlbum = data.albums.find((album) => album.id === selectedAlbumId) ?? data.albums[0];
  const media = useMemo(() => data.media.filter((item) => item.album_id === activeAlbum?.id), [data.media, activeAlbum?.id]);
  const lockedPhotoCount = useMemo(() => data.media.filter((item) => item.resource_type === "image" && item.subscription_locked).length, [data.media]);
  const previewMedia = useMemo(
    () => data.media.filter((item) => item.album_id === preview?.album_id).sort((a, b) => a.display_order - b.display_order),
    [data.media, preview?.album_id],
  );
  const previewIndex = previewMedia.findIndex((item) => item.id === preview?.id);
  const remainingCapacity = Math.max(0, PORTFOLIO_LIMITS.mediaPerAlbum - media.length);
  const uploading = Object.values(uploadProgress).some((task) =>
    task.status === "optimizing" || task.status === "signing" || task.status === "uploading" || task.status === "processing");
  const uploadsCompleted = pendingAssets.length > 0
    && pendingAssets.every((asset, index) => uploadProgress[`${asset.uri}-${index}`]?.status === "completed");
  const completedUploadCount = pendingAssets.filter((asset, index) => uploadProgress[`${asset.uri}-${index}`]?.status === "completed").length;
  const overallUploadProgress = pendingAssets.length
    ? Math.round(Object.values(uploadProgress).reduce((sum, task) => sum + task.progress, 0) / pendingAssets.length * 100)
    : 0;
  const planPhotoUsage = access?.photo_usage
    ?? data.media.filter((item) => item.resource_type === "image").length;
  const planPhotoLimit = access?.photo_limit;
  const showFailure = (title: string, caught: unknown, message = "Please check your connection and try again.") => {
    if (__DEV__) console.error(title, caught);
    Alert.alert(title, message);
  };
  const revealAlbumField = (field: React.RefObject<TextInput | null>) => {
    if (Platform.OS === "web") return;
    // Wait for the modal window to finish resizing before calculating the field position.
    setTimeout(() => {
      const input = field.current;
      if (!input) return;
      albumFormScrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(input, 24, true);
    }, 280);
  };

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));
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
    const wasEditing = Boolean(editingAlbum);
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
    showSuccess(wasEditing ? "Album updated" : "Album created");
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
        try {
          await deletePortfolioMedia(item.id, {
            vendorId: data.vendor.id,
            publicId: item.public_id,
            resourceType: item.resource_type,
          });
        }
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
      showSuccess("Album deleted");
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
        `${albumMedia.length} media asset${albumMedia.length === 1 ? "" : "s"} will be permanently removed.`,
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
    showSuccess("Media moved");
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
    let movedSuccessfully = false;
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
      movedSuccessfully = true;
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
      if (movedSuccessfully) showSuccess("Album media moved");
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
    let uploadedCount = 0;
    for (const item of pending) {
      if (await uploadOne(item.asset, item.index)) uploadedCount += 1;
    }
    if (pending.length) {
      await refresh();
    }
    if (uploadedCount) showSuccess(`${uploadedCount} media item${uploadedCount === 1 ? "" : "s"} uploaded`);
  };
  const finishUpload = () => {
    setUploadModal(false);
    setPendingAssets([]);
    setUploadProgress({});
    setUploadAlbumId(null);
    setUploadAlbumTitle("");
    setUploadAlbumInitialCount(0);
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
    if (unsetError) return showFailure("Cover not updated", unsetError);
    await refresh();
    showSuccess("Album cover updated");
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
    } else {
      await refresh();
      showSuccess("Media order updated");
    }
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
    } else {
      await refresh();
      showSuccess("Album order updated");
    }
  };
  const deleteMediaNow = async (item: any, returnToAlbum: any = null) => {
    setDeletingMediaId(item.id);
    try {
      await deletePortfolioMedia(item.id, {
        vendorId: data.vendor.id,
        publicId: item.public_id,
        resourceType: item.resource_type,
      });
      if (item.is_cover) {
        const nextCover = media.find((entry) => entry.id !== item.id);
        if (nextCover) await supabase.from("vendor_portfolio_media").update({ is_cover: true }).eq("id", nextCover.id).eq("vendor_id", data.vendor?.id);
      }
      setPreviewDeleteCandidate(null);
      setPreview(null);
      await refresh();
      if (returnToAlbum) setAlbumPreview(returnToAlbum);
      showSuccess("Media deleted");
    } catch (caught) {
      if (returnToAlbum) setAlbumPreview(returnToAlbum);
      showFailure("Media not deleted", caught, "Nothing was removed. Please check your connection and try again.");
    } finally {
      setDeletingMediaId(null);
    }
  };
  const removeMedia = (item: any, returnToAlbum: any = null) => {
    if (!requireFeature("upload_gallery")) return;
    const restoreAlbumPreview = () => {
      if (returnToAlbum) setAlbumPreview(returnToAlbum);
    };
    const showDeleteConfirmation = () => Alert.alert(
        "Delete media?",
        "This removes the stored media asset and cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: restoreAlbumPreview },
          { text: "Delete", style: "destructive", onPress: async () => {
            await deleteMediaNow(item, returnToAlbum);
          }},
        ],
      );

    if (Platform.OS === "web" && returnToAlbum) {
      // React Native Web modals share one host. Close the album preview for a
      // frame so the global confirmation dialog cannot render underneath it.
      setAlbumPreview(null);
      setTimeout(showDeleteConfirmation, 0);
      return;
    }
    showDeleteConfirmation();
  };

  return <View style={[styles.page, { backgroundColor: canvas }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView
      contentContainerStyle={[styles.content, width >= 900 && styles.desktop, wideWebLayout && styles.wideWeb]}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
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
      <View style={[styles.summaryGrid, width >= 900 && styles.summaryGridDesktop]}>
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
            value: planPhotoLimit == null ? String(planPhotoUsage) : `${planPhotoUsage}/${planPhotoLimit}`,
            label: "Plan photo usage",
            detail: planPhotoLimit == null
              ? `${access?.plan_name || "Current"} plan`
              : `${Math.max(0, planPhotoLimit - planPhotoUsage)} uploads remaining`,
            progress: planPhotoLimit && planPhotoLimit > 0 ? Math.min(1, planPhotoUsage / planPhotoLimit) : 0,
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
          wideWebLayout && styles.summaryCardWideWeb,
          width < 520 && styles.summaryCardCompact,
          { width: width >= 900 ? (contentWidth - 20) / 3 : "31%" },
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}>
          <View style={[styles.summaryIcon, wideWebLayout && styles.summaryIconWideWeb, { backgroundColor: colors.surfaceSoft }]}>{stat.icon}</View>
          <View style={wideWebLayout && styles.summaryCopyWideWeb}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>{stat.label}</Text>
          </View>
          <View style={wideWebLayout && styles.summaryMetaWideWeb}>
            <View style={[styles.statProgress, wideWebLayout && styles.statProgressWideWeb, { backgroundColor: colors.border }]}>
              <View style={[styles.statProgressFill, { width: `${Math.max(4, stat.progress * 100)}%`, backgroundColor: colors.pink }]} />
            </View>
            <Text style={[styles.summaryDetail, wideWebLayout && styles.summaryDetailWideWeb, { color: stat.key === "albums" ? colors.muted : colors.pink }]}>{stat.detail}</Text>
          </View>
        </View>)}
      </View>
      {error && <Text style={[styles.error, { color: colors.warning }]}>We couldn’t load your portfolio. Please refresh and try again.</Text>}
      {portfolioError && <View style={[styles.setupNotice, { backgroundColor: colors.surfaceSoft, borderColor: colors.warning }]}>
        <Text style={[styles.setupTitle, { color: colors.text }]}>Backend setup required</Text>
        <Text style={[styles.setupBody, { color: colors.muted }]}>{portfolioError}</Text>
      </View>}
      {!loading && !data.vendor && <View style={[styles.setupNotice, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <Text style={[styles.setupTitle, { color: colors.text }]}>Vendor profile connection required</Text>
        <Text style={[styles.setupBody, { color: colors.muted }]}>Preview mode can display the gallery, but saving and uploading requires your Vendor account so every album stays private to its owner.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Connect vendor account" onPress={() => router.replace("/DashboardCenter")} style={[styles.connectButton, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Connect Vendor Account</Text></Pressable>
      </View>}
      {loading && !data.albums.length ? <View style={styles.skeletonGrid}>
        {[0, 1, 2].map((item) => <View key={item} style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.skeletonCover, { backgroundColor: colors.surfaceSoft }]} />
          <View style={styles.flex}><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceSoft, width: "72%" }]} /><View style={[styles.skeletonLine, { backgroundColor: colors.surfaceSoft, width: "48%" }]} /></View>
        </View>)}
      </View> : null}

      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={[styles.sectionTitle, styles.albumSectionTitle, { color: colors.text }]}>Your Albums</Text>
          <Text style={[styles.sectionCaption, { color: colors.muted }]}>{data.albums.length} curated collection{data.albums.length === 1 ? "" : "s"}</Text>
        </View>
      </View>
      <View onLayout={(event) => setAlbumGridWidth(event.nativeEvent.layout.width)} style={styles.albumStrip}>
        {data.albums.map((album) => {
          const albumMedia = data.media.filter((item) => item.album_id === album.id);
          const cover = albumMedia.find((item) => item.is_cover) ?? albumMedia[0];
          const active = activeAlbum?.id === album.id;
          return <View key={album.id} style={[styles.album, { width: albumWidth, height: albumHeight, backgroundColor: colors.background, borderColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Open ${album.title} album`}
              onPress={() => {
                setSelectedAlbumId(album.id);
                setAlbumPreview(album);
              }}
              style={({ pressed, hovered, focused }) => [
                styles.albumSelectArea,
                (hovered || focused) && styles.hoverLift,
                pressed && styles.albumPressed,
              ]}
            >
              <View style={[styles.albumCover, { height: albumCoverHeight, backgroundColor: colors.surfaceSoft }]}>
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
      </View>

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
          {media.map((item) => <View key={item.id} style={[styles.mediaTileWrap, { width: tileWidth }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${item.resource_type}`} onPress={() => setPreview(item)}>
              <View style={[styles.tile, { height: tileWidth * 0.8 }, item.subscription_locked && styles.lockedTile]}>
                <ImageFadeIn source={{ uri: portfolioMediaUrl(item, "thumbnail") }} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
                {item.resource_type === "video" && <View style={styles.play}><Play size={18} fill="#FFF" color="#FFF" /></View>}
                {item.resource_type === "video" && item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, "0")}</Text></View> : null}
                {item.is_cover && <View style={[styles.coverBadge, { backgroundColor: colors.pink }]}><Star size={10} color="#FFF" fill="#FFF" /><Text style={styles.coverText}>Cover</Text></View>}
                {item.subscription_locked ? <View style={styles.lockedOverlay}><LockKeyhole size={18} color="#FFF" /><Text style={styles.lockedOverlayText}>Locked · Upgrade</Text></View> : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.resource_type}`}
              onPress={() => removeMedia(item)}
              style={({ pressed }) => [styles.mediaDeleteButton, pressed && styles.pressScale]}
            ><Trash2 size={16} color="#FFF" /></Pressable>
          </View>)}
        </View>
        {!media.length && <View style={styles.mediaEmpty}><ImagePlus size={26} color={colors.muted} /><Text style={[styles.emptyBody, { color: colors.muted }]}>This album is ready for its first upload.</Text></View>}
      </View>}
    </ScrollView>

    <Modal visible={albumModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAlbumModal(false)}>
      <KeyboardAwareScrollView
        ref={albumFormScrollRef}
        containerStyle={styles.albumModalKeyboard}
        contentContainerStyle={[styles.albumModalScroll, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}
        keyboardShouldPersistTaps="handled"
        avoidKeyboardOnAndroid
        keyboardGap={24}
      >
      <View style={styles.modalBackdrop}><View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>{editingAlbum ? "Edit album" : "New album"}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close album editor" hitSlop={8} onPress={() => setAlbumModal(false)}><X size={21} color={colors.text} /></Pressable></View>
        <Text style={[styles.inputLabel, { color: colors.text }]}>Album title</Text>
        <TextInput ref={albumTitleRef} value={title} onChangeText={setTitle} onFocus={() => revealAlbumField(albumTitleRef)} maxLength={60} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => albumDescriptionRef.current?.focus()} placeholder="e.g. Intimate weddings" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
        <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
        <TextInput ref={albumDescriptionRef} value={description} onChangeText={setDescription} onFocus={() => revealAlbumField(albumDescriptionRef)} multiline maxLength={300} textAlignVertical="top" placeholder="What makes this collection special?" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
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
      </KeyboardAwareScrollView>
    </Modal>

    <Modal visible={uploadModal} transparent statusBarTranslucent animationType="fade" onRequestClose={() => !uploading && setUploadModal(false)}>
      <View style={styles.modalBackdrop}>
        <View style={[
          styles.uploadSheet,
          compactUploadSheet && styles.uploadSheetCompact,
          { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, compactUploadSheet ? 16 : 20) },
        ]}>
          <View style={[styles.sheetHeader, compactUploadSheet && styles.uploadHeaderCompact]}>
            <View style={styles.flex}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upload media</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>To {uploadAlbumTitle || activeAlbum?.title} · {pendingAssets.length} selected</Text>
            </View>
            <Pressable disabled={uploading} accessibilityRole="button" accessibilityLabel="Close upload" hitSlop={8} onPress={() => setUploadModal(false)}><X size={21} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={[styles.uploadList, compactUploadSheet && styles.uploadListCompact]} contentContainerStyle={{ gap: compactUploadSheet ? 8 : 10 }} showsVerticalScrollIndicator={false}>
            {pendingAssets.map((asset, index) => {
              const task = uploadProgress[`${asset.uri}-${index}`];
              const completed = task?.status === "completed";
              const failed = task?.status === "failed";
              return <View key={`${asset.uri}-${index}`} style={[styles.uploadAsset, compactUploadSheet && styles.uploadAssetCompact, { backgroundColor: colors.background, borderColor: failed ? colors.warning : colors.border }]}>
                <View style={[styles.uploadThumb, compactUploadSheet && styles.uploadThumbCompact]}>
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
          {!uploadsCompleted ? (
            <Text style={[styles.uploadLimitHint, { color: colors.muted }]}>Images are optimized automatically · Videos up to 25 MB and 4 minutes</Text>
          ) : null}
          <View style={[styles.uploadFooter, compactUploadSheet && styles.uploadFooterCompact, { borderTopColor: colors.border }]}>
            <View style={styles.flex}>
              {pendingAssets.length > 0 ? <Text style={[styles.overallProgress, { color: colors.pink }]}>Overall {overallUploadProgress}%</Text> : null}
              {uploadsCompleted ? <Text numberOfLines={1} style={[styles.uploadCompleteLabel, { color: colors.muted }]}>{completedUploadCount} media {completedUploadCount === 1 ? "item" : "items"} stored successfully</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uploadsCompleted ? "Done uploading" : "Upload selected media"}
              disabled={!uploadsCompleted && (uploading || !pendingAssets.length)}
              onPress={uploadsCompleted ? finishUpload : upload}
              style={[styles.save, styles.uploadStart, compactUploadSheet && styles.uploadStartCompact, { backgroundColor: colors.pink }, uploading && { opacity: .65 }]}
            >
              {uploading
                ? <ActivityIndicator color="#FFF" />
                : uploadsCompleted
                  ? <><Check size={17} color="#FFF" /><Text style={styles.primaryText}>Done</Text></>
                  : <><Upload size={17} color="#FFF" /><Text style={styles.primaryText}>Upload</Text></>}
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
            {data.media.filter((item) => item.album_id === albumPreview?.id).map((item) => <View key={item.id} style={[styles.mediaTileWrap, { width: previewTileWidth }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${item.resource_type}`} onPress={() => { setAlbumPreview(null); setPreview(item); }}>
                <View style={[styles.tile, { height: previewTileWidth * .8 }]}>
                  <ImageFadeIn source={{ uri: portfolioMediaUrl(item, "thumbnail") }} resizeMode="contain" style={StyleSheet.absoluteFillObject} />
                  {item.resource_type === "video" && <View style={styles.play}><Play size={18} fill="#FFF" color="#FFF" /></View>}
                  {item.is_cover && <View style={[styles.coverBadge, { backgroundColor: colors.pink }]}><Star size={10} color="#FFF" fill="#FFF" /><Text style={styles.coverText}>Cover</Text></View>}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.resource_type} from ${albumPreview?.title || "album"}`}
                onPress={() => removeMedia(item, albumPreview)}
                style={({ pressed }) => [styles.mediaDeleteButton, pressed && styles.pressScale]}
              ><Trash2 size={16} color="#FFF" /></Pressable>
            </View>)}
          </View>
          {!data.media.some((item) => item.album_id === albumPreview?.id) && <View style={styles.mediaEmpty}><ImagePlus size={27} color={colors.muted} /><Text style={[styles.emptyBody, { color: colors.muted }]}>This album has no published media yet.</Text></View>}
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={Boolean(preview)} transparent animationType="fade" onRequestClose={() => { setPreviewDeleteCandidate(null); setPreview(null); }}>
      <View style={[styles.previewBackdrop, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close media preview" onPress={() => { setPreviewDeleteCandidate(null); setPreview(null); }} style={[styles.previewClose, { top: insets.top + 12 }]}><X size={24} color="#FFF" /></Pressable>
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
        {preview && <View style={styles.previewFooter}>
          <View style={styles.previewDetails}>
            <Text style={styles.previewPosition}>{previewIndex + 1} / {previewMedia.length}</Text>
            <Text style={styles.previewMeta}>
              {[preview.width && preview.height ? `${preview.width}×${preview.height}` : null, preview.bytes ? `${(preview.bytes / 1024 / 1024).toFixed(1)} MB` : null, preview.duration ? `${Math.round(preview.duration)} sec` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View style={styles.previewActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Move media earlier" onPress={() => reorderMedia(preview, -1)} style={styles.previewButton}><Text style={styles.previewText}>← Earlier</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Move media later" onPress={() => reorderMedia(preview, 1)} style={styles.previewButton}><Text style={styles.previewText}>Later →</Text></Pressable>
            {data.albums.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Move media to another album" onPress={() => requireFeature("manage_albums", () => setMoveMediaItem(preview))} style={styles.previewButton}><Move size={17} color="#FFF" /><Text style={styles.previewText}>Move</Text></Pressable>}
            {!preview.is_cover && <Pressable accessibilityRole="button" accessibilityLabel="Set media as album cover" onPress={() => { setCover(preview); setPreview(null); }} style={styles.previewButton}><Star size={17} color="#FFF" /><Text style={styles.previewText}>Set cover</Text></Pressable>}
            {preview.resource_type === "image" && <Pressable accessibilityRole="button" accessibilityLabel="Set image focal point" onPress={() => requireFeature("upload_gallery", () => { setFocalMedia(preview); setPreview(null); })} style={styles.previewButton}><Crosshair size={17} color="#FFF" /><Text style={styles.previewText}>Focal point</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Delete media" onPress={() => setPreviewDeleteCandidate(preview)} style={[styles.previewButton, styles.previewDeleteButton]}><Trash2 size={17} color="#FFF" /><Text style={styles.previewText}>Delete</Text></Pressable>
          </View>
        </View>}
        {previewDeleteCandidate && <View style={styles.previewConfirmBackdrop}>
          <View style={styles.previewConfirmCard}>
            <View style={styles.previewConfirmIcon}><Trash2 size={22} color="#FFF" /></View>
            <Text style={styles.previewConfirmTitle}>Delete this media?</Text>
            <Text style={styles.previewConfirmBody}>This permanently removes the image from this album and media storage. This cannot be undone.</Text>
            <View style={styles.previewConfirmActions}>
              <Pressable disabled={Boolean(deletingMediaId)} onPress={() => setPreviewDeleteCandidate(null)} style={[styles.previewConfirmButton, styles.previewConfirmCancel]}><Text style={styles.previewConfirmCancelText}>Cancel</Text></Pressable>
              <Pressable disabled={Boolean(deletingMediaId)} onPress={() => void deleteMediaNow(previewDeleteCandidate)} style={[styles.previewConfirmButton, styles.previewConfirmDelete]}>{deletingMediaId ? <ActivityIndicator color="#FFF" /> : <><Trash2 size={17} color="#FFF" /><Text style={styles.previewConfirmDeleteText}>Delete</Text></>}</Pressable>
            </View>
          </View>
        </View>}
      </View>
    </Modal>

    <Modal visible={Boolean(focalMedia)} transparent animationType="fade" onRequestClose={() => setFocalMedia(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Set focal point</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Tap the most important subject. Hero and card crops will keep this area in view.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close focal point editor" hitSlop={8} onPress={() => setFocalMedia(null)}><X size={21} color={colors.text} /></Pressable>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Finish editing focal point" onPress={() => setFocalMedia(null)} style={[styles.save, { backgroundColor: colors.pink }]}><Text style={styles.primaryText}>Done</Text></Pressable>
      </View></View>
    </Modal>

    <Modal visible={Boolean(moveMediaItem || moveAlbumSource)} transparent animationType="fade" onRequestClose={() => { setMoveMediaItem(null); setMoveAlbumSource(null); }}>
      <View style={styles.modalBackdrop}><View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sheetHeader}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>Choose destination</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{moveAlbumSource ? `Move every item from ${moveAlbumSource.title}` : "Move this item to another album"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close destination picker" hitSlop={8} onPress={() => { setMoveMediaItem(null); setMoveAlbumSource(null); }}><X size={21} color={colors.text} /></Pressable>
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
