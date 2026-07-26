import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, FolderOpen, ImagePlus, Images, Maximize2, Move, Pencil, Play, Plus, RotateCcw, Star, Trash2, Upload, X } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { deletePortfolioMedia, deleteUnstoredPortfolioAsset, pickPortfolioMedia, type PortfolioAsset, uploadPortfolioAsset } from "@/services/cloudinary";
import { supabase } from "@/services/supabase";
import PortfolioVideoPlayer from "@/components/vendor/PortfolioVideoPlayer";

export default function VendorGallery() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
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
    status: "waiting" | "signing" | "uploading" | "processing" | "completed" | "failed";
    error?: string;
  }>>({});
  const [preview, setPreview] = useState<any>(null);
  const [albumPreview, setAlbumPreview] = useState<any>(null);
  const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
  const [pendingAssets, setPendingAssets] = useState<PortfolioAsset[]>([]);
  const [uploadAlbumId, setUploadAlbumId] = useState<string | null>(null);
  const [uploadAlbumTitle, setUploadAlbumTitle] = useState("");
  const [uploadAlbumInitialCount, setUploadAlbumInitialCount] = useState(0);
  const [uploadModal, setUploadModal] = useState(false);
  const [moveMediaItem, setMoveMediaItem] = useState<any>(null);
  const [moveAlbumSource, setMoveAlbumSource] = useState<any>(null);
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = 10;
  const contentWidth = Math.min(width, 1120) - (width >= 900 ? 56 : 32);
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;
  const activeAlbum = data.albums.find((album) => album.id === selectedAlbumId) ?? data.albums[0];
  const media = useMemo(() => data.media.filter((item) => item.album_id === activeAlbum?.id), [data.media, activeAlbum?.id]);
  const previewMedia = useMemo(
    () => data.media.filter((item) => item.album_id === preview?.album_id).sort((a, b) => a.display_order - b.display_order),
    [data.media, preview?.album_id],
  );
  const previewIndex = previewMedia.findIndex((item) => item.id === preview?.id);
  const remainingCapacity = Math.max(0, 25 - media.length);
  const uploading = Object.values(uploadProgress).some((task) =>
    task.status === "signing" || task.status === "uploading" || task.status === "processing");
  const showFailure = (title: string, caught: unknown, message = "Please check your connection and try again.") => {
    if (__DEV__) console.error(title, caught);
    Alert.alert(title, message);
  };

  useFocusEffect(React.useCallback(() => { refresh(); }, [refresh]));

  const openAlbum = (album?: any) => {
    setEditingAlbum(album ?? null);
    setTitle(album?.title ?? "");
    setDescription(album?.description ?? "");
    setIsVisible(album?.is_visible ?? true);
    setAlbumModal(true);
  };
  const saveAlbum = async (addMediaAfterSave = false) => {
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Connect your Vendor profile before creating albums.");
    if (!title.trim()) return Alert.alert("Album title required");
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
    setDeletingAlbumId(album.id);
    try {
      const albumMedia = data.media.filter((item) => item.album_id === album.id);
      for (const item of albumMedia) await deletePortfolioMedia(item.id);
      const { error: removeError } = await supabase.from("vendor_portfolio_albums").delete().eq("id", album.id).eq("vendor_id", data.vendor?.id);
      if (removeError) throw removeError;
      setSelectedAlbumId(null);
      setAlbumPreview(null);
      await refresh();
    } catch (caught) {
      showFailure("Album not deleted", caught, "Nothing was removed. Please check your connection and try again.");
      await refresh();
    } finally {
      setDeletingAlbumId(null);
    }
  };
  const removeAlbum = (album: any) => {
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
    const targetCount = data.media.filter((entry) => entry.album_id === target.id).length;
    if (targetCount >= 25) return Alert.alert("Album is full", "Choose an album with available space.");
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
    if (!moveAlbumSource) return;
    const sourceItems = data.media.filter((item) => item.album_id === moveAlbumSource.id);
    const targetCount = data.media.filter((item) => item.album_id === target.id).length;
    if (targetCount + sourceItems.length > 25) {
      return Alert.alert("Not enough room", `${target.title} has room for ${25 - targetCount} more items. Choose another album.`);
    }
    setDeletingAlbumId(moveAlbumSource.id);
    try {
      for (let index = 0; index < sourceItems.length; index += 1) {
        const { error: moveError } = await supabase.from("vendor_portfolio_media")
          .update({ album_id: target.id, display_order: targetCount + index, is_cover: targetCount === 0 && index === 0 })
          .eq("id", sourceItems[index].id).eq("vendor_id", data.vendor?.id);
        if (moveError) throw moveError;
      }
      const { error: removeError } = await supabase.from("vendor_portfolio_albums")
        .delete().eq("id", moveAlbumSource.id).eq("vendor_id", data.vendor?.id);
      if (removeError) throw removeError;
      setMoveAlbumSource(null);
      setSelectedAlbumId(target.id);
      await refresh();
    } catch (caught) {
      showFailure("Album not moved", caught);
      await refresh();
    } finally {
      setDeletingAlbumId(null);
    }
  };
  const prepareUpload = async (
    targetAlbumId = activeAlbum?.id,
    targetAlbumTitle = activeAlbum?.title ?? "",
    currentMediaCount = media.length,
  ) => {
    if (!data.vendor?.id || !targetAlbumId) return Alert.alert("Create an album first", "Portfolio media must belong to an album.");
    const targetRemaining = Math.max(0, 25 - currentMediaCount);
    if (!targetRemaining) return Alert.alert("Album is full", "Each album can hold 25 photos or videos. Create another album to upload more.");
    try {
      const selected = await pickPortfolioMedia(Math.min(12, targetRemaining));
      const unique = selected.filter((asset, index, all) =>
        all.findIndex((candidate) =>
          candidate.uri === asset.uri
          || (candidate.fileName && candidate.fileName === asset.fileName && candidate.fileSize === asset.fileSize)
        ) === index);
      if (!unique.length) return;
      if (unique.length > targetRemaining) {
        return Alert.alert("Too many files", `This album has room for ${targetRemaining} more media item${targetRemaining === 1 ? "" : "s"}.`);
      }
      setUploadAlbumId(targetAlbumId);
      setUploadAlbumTitle(targetAlbumTitle);
      setUploadAlbumInitialCount(currentMediaCount);
      setPendingAssets(unique);
      setUploadProgress(Object.fromEntries(unique.map((asset, index) => {
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
    if (!data.vendor?.id || !uploadAlbumId) return false;
    const key = `${asset.uri}-${index}`;
    const name = asset.fileName || `${asset.type === "video" ? "Video" : "Image"} ${index + 1}`;
    try {
        setUploadProgress((current) => ({ ...current, [key]: { name, progress: 0, status: "signing" } }));
        const uploaded = await uploadPortfolioAsset(asset, data.vendor.id, uploadAlbumId,
          (value) => setUploadProgress((current) => ({ ...current, [key]: { name, progress: value, status: "uploading" } })));
        setUploadProgress((current) => ({ ...current, [key]: { name, progress: 1, status: "processing" } }));
        const { error: insertError } = await supabase.from("vendor_portfolio_media").insert({
          vendor_id: data.vendor.id, album_id: uploadAlbumId, secure_url: uploaded.secureUrl,
          public_id: uploaded.publicId, resource_type: uploaded.resourceType, format: uploaded.format,
          width: uploaded.width, height: uploaded.height, duration: uploaded.duration, bytes: uploaded.bytes,
          thumbnail_url: uploaded.thumbnailUrl, display_order: uploadAlbumInitialCount + index,
          is_cover: uploadAlbumInitialCount === 0 && index === 0,
          upload_status: "completed",
        });
        if (insertError) {
          await deleteUnstoredPortfolioAsset(data.vendor.id, uploaded.publicId, uploaded.resourceType).catch(() => undefined);
          throw insertError;
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
    const { error: coverError } = await supabase.from("vendor_portfolio_media").update({ is_cover: true }).eq("id", item.id).eq("vendor_id", data.vendor?.id);
    if (coverError) return showFailure("Cover not updated", coverError);
    const { error: unsetError } = await supabase.from("vendor_portfolio_media").update({ is_cover: false }).eq("album_id", item.album_id).neq("id", item.id);
    if (unsetError) showFailure("Cover not updated", unsetError);
    await refresh();
  };
  const reorderMedia = async (item: any, direction: -1 | 1) => {
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
  const removeMedia = (item: any) => Alert.alert("Delete media?", "This removes the Cloudinary asset and cannot be undone.", [
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
  ]);

  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView
      contentContainerStyle={[styles.content, width >= 900 && styles.desktop]}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      <View style={styles.headingRow}>
        <View style={styles.flex}><Text style={[styles.eyebrow, { color: colors.pink }]}>YOUR BEST WORK</Text><Text style={[styles.title, { color: colors.text }]}>Portfolio</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Organise images and videos into polished customer-facing albums.</Text></View>
        <Pressable onPress={() => openAlbum()} style={[styles.primary, { backgroundColor: colors.pink }]}><Plus size={18} color="#FFF" /><Text style={styles.primaryText}>Album</Text></Pressable>
      </View>
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.text }]}>{data.albums.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Albums</Text></View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.text }]}>{data.media.length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Photos & videos</Text></View>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.text }]}>{data.albums.filter((album) => album.is_visible).length}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Visible albums</Text></View>
      </View>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumStrip}>
        {data.albums.map((album) => {
          const albumMedia = data.media.filter((item) => item.album_id === album.id);
          const cover = albumMedia.find((item) => item.is_cover) ?? albumMedia[0];
          const active = activeAlbum?.id === album.id;
          return <Pressable key={album.id} onPress={() => setSelectedAlbumId(album.id)}
            style={[styles.album, { backgroundColor: colors.surface, borderColor: active ? colors.pink : colors.border }]}>
            <View style={[styles.albumCover, { backgroundColor: colors.surfaceSoft }]}>
              {cover ? <Image source={{ uri: cover.thumbnail_url || cover.secure_url }} style={StyleSheet.absoluteFillObject} /> : <Images size={23} color={colors.muted} />}
            </View>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text>
              <Text style={[styles.albumCount, { color: colors.muted }]}>{albumMedia.length}/25 · {album.is_visible ? "Visible" : "Hidden"}</Text>
              <View style={[styles.albumCapacity, { backgroundColor: colors.border }]}><View style={{ width: `${albumMedia.length / 25 * 100}%`, height: "100%", backgroundColor: colors.pink }} /></View>
            </View>
            <Pressable accessibilityLabel={`Preview ${album.title} album`} onPress={() => setAlbumPreview(album)} style={styles.albumPreviewButton}>
              <Maximize2 size={14} color={active ? colors.pink : colors.muted} />
            </Pressable>
          </Pressable>;
        })}
      </ScrollView>

      {!data.albums.length && !loading ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSoft }]}><Images size={30} color={colors.pink} /></View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Build your first album</Text>
        <Text style={[styles.emptyBody, { color: colors.muted }]}>Group related work such as weddings, ceremonies, portraits, or décor so customers can browse with confidence.</Text>
        <Pressable onPress={() => openAlbum()} style={[styles.primary, { backgroundColor: colors.pink }]}><Plus size={18} color="#FFF" /><Text style={styles.primaryText}>Create album</Text></Pressable>
      </View> : null}

      {activeAlbum && <View>
        <View style={styles.albumHeading}>
          <View style={styles.flex}><Text style={[styles.sectionTitle, { color: colors.text }]}>{activeAlbum.title}</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{activeAlbum.description || "Add a short description to give this collection context."}</Text></View>
          <Pressable accessibilityLabel="Preview album" onPress={() => setAlbumPreview(activeAlbum)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Eye size={17} color={colors.text} /></Pressable>
          <Pressable accessibilityLabel="Edit album" onPress={() => openAlbum(activeAlbum)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Pencil size={17} color={colors.text} /></Pressable>
          <Pressable disabled={deletingAlbumId === activeAlbum.id} accessibilityLabel="Delete album" onPress={() => removeAlbum(activeAlbum)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {deletingAlbumId === activeAlbum.id ? <ActivityIndicator size="small" color={colors.warning} /> : <Trash2 size={17} color={colors.warning} />}
          </Pressable>
        </View>
        <View style={styles.orderRow}>
          <Text style={[styles.orderLabel, { color: colors.muted }]}>{media.length}/25 media · {remainingCapacity} remaining</Text>
          <Pressable accessibilityLabel="Move album earlier" onPress={() => reorderAlbum(-1)} style={[styles.orderButton, { borderColor: colors.border }]}><ChevronLeft size={15} color={colors.text} /><Text style={[styles.orderText, { color: colors.text }]}>Earlier</Text></Pressable>
          <Pressable accessibilityLabel="Move album later" onPress={() => reorderAlbum(1)} style={[styles.orderButton, { borderColor: colors.border }]}><Text style={[styles.orderText, { color: colors.text }]}>Later</Text><ChevronRight size={15} color={colors.text} /></Pressable>
        </View>
        <Pressable onPress={() => prepareUpload()} disabled={uploading || remainingCapacity === 0} style={[styles.upload, { borderColor: colors.pink, backgroundColor: colors.surfaceSoft }, remainingCapacity === 0 && { opacity: .55 }]}>
          {uploading ? <ActivityIndicator color={colors.pink} /> : <Upload size={19} color={colors.pink} />}
          <Text style={{ color: colors.pink, fontWeight: "700", fontSize: 13 }}>{uploading ? "Uploading securely…" : remainingCapacity === 0 ? "Album limit reached" : "Add images or videos"}</Text>
        </Pressable>
        {remainingCapacity === 0 && <View style={[styles.capacityNotice, { backgroundColor: colors.surfaceSoft }]}><Text style={[styles.capacityText, { color: colors.muted }]}>This album contains 25 media items. Create another album to continue uploading.</Text><Pressable onPress={() => openAlbum()}><Text style={{ color: colors.pink, fontSize: 10, fontWeight: "800" }}>Create album</Text></Pressable></View>}
        <View style={[styles.mediaGrid, { gap }]}>
          {media.map((item) => <Pressable key={item.id} onPress={() => setPreview(item)} style={{ width: tileWidth }}>
            <View style={[styles.tile, { height: tileWidth * 0.8, backgroundColor: colors.surfaceSoft }]}>
              <Image source={{ uri: item.thumbnail_url || item.secure_url }} style={StyleSheet.absoluteFillObject} />
              {item.resource_type === "video" && <View style={styles.play}><Play size={18} fill="#FFF" color="#FFF" /></View>}
              {item.resource_type === "video" && item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{Math.floor(item.duration / 60)}:{String(Math.round(item.duration % 60)).padStart(2, "0")}</Text></View> : null}
              {item.is_cover && <View style={[styles.coverBadge, { backgroundColor: colors.pink }]}><Star size={10} color="#FFF" fill="#FFF" /><Text style={styles.coverText}>Cover</Text></View>}
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
        <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="e.g. Intimate weddings" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
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
                <View style={[styles.uploadThumb, { backgroundColor: colors.surfaceSoft }]}>
                  <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFillObject} />
                  {asset.type === "video" && <View style={styles.miniPlay}><Play size={12} color="#FFF" fill="#FFF" /></View>}
                </View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={[styles.uploadAssetName, { color: colors.text }]}>{task?.name}</Text>
                  <Text style={[styles.uploadStatus, { color: failed ? colors.warning : completed ? colors.pink : colors.muted }]}>
                    {task?.status === "waiting" ? "Ready" : task?.status === "signing" ? "Securing upload…" : task?.status === "uploading" ? `${Math.round(task.progress * 100)}% uploaded` : task?.status === "processing" ? "Finalising…" : completed ? "Stored successfully" : "Upload failed. Tap retry."}
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
              <Text style={[styles.modalHint, { color: colors.muted, margin: 0 }]}>Limits: images 15 MB, videos 80 MB. Assets are saved only after Cloudinary confirms the upload.</Text>
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

    <Modal visible={Boolean(albumPreview)} transparent animationType="fade" onRequestClose={() => setAlbumPreview(null)}>
      <View style={[styles.albumPreviewBackdrop, { backgroundColor: colors.background }]}>
        <View style={[styles.albumPreviewHeader, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable accessibilityLabel="Close album preview" onPress={() => setAlbumPreview(null)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><X size={19} color={colors.text} /></Pressable>
          <View style={styles.flex}><Text style={[styles.previewEyebrow, { color: colors.pink }]}>CUSTOMER PREVIEW</Text><Text numberOfLines={1} style={[styles.albumPreviewTitle, { color: colors.text }]}>{albumPreview?.title}</Text></View>
          <View style={[styles.previewCount, { backgroundColor: colors.surfaceSoft }]}><Text style={{ color: colors.pink, fontSize: 10, fontWeight: "800" }}>{data.media.filter((item) => item.album_id === albumPreview?.id).length} media</Text></View>
        </View>
        <ScrollView bounces={false} overScrollMode="never" contentContainerStyle={styles.albumPreviewContent}>
          <View style={[styles.albumPreviewHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.previewFolder, { backgroundColor: colors.surfaceSoft }]}><FolderOpen size={24} color={colors.pink} /></View>
            <Text style={[styles.albumPreviewName, { color: colors.text }]}>{albumPreview?.title}</Text>
            <Text style={[styles.albumPreviewDescription, { color: colors.muted }]}>{albumPreview?.description || "A curated selection from our recent work."}</Text>
          </View>
          <View style={[styles.mediaGrid, { gap }]}>
            {data.media.filter((item) => item.album_id === albumPreview?.id).map((item) => <Pressable key={item.id} onPress={() => { setAlbumPreview(null); setPreview(item); }} style={{ width: tileWidth }}>
              <View style={[styles.tile, { height: tileWidth * .8, backgroundColor: colors.surfaceSoft }]}>
                <Image source={{ uri: item.thumbnail_url || item.secure_url }} style={StyleSheet.absoluteFillObject} />
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
        <Pressable onPress={() => setPreview(null)} style={styles.previewClose}><X size={24} color="#FFF" /></Pressable>
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
          {data.albums.length > 1 && <Pressable onPress={() => setMoveMediaItem(preview)} style={styles.previewButton}><Move size={17} color="#FFF" /><Text style={styles.previewText}>Move</Text></Pressable>}
          {!preview.is_cover && <Pressable onPress={() => { setCover(preview); setPreview(null); }} style={styles.previewButton}><Star size={17} color="#FFF" /><Text style={styles.previewText}>Set cover</Text></Pressable>}
          <Pressable onPress={() => removeMedia(preview)} style={styles.previewButton}><Trash2 size={17} color="#FFF" /><Text style={styles.previewText}>Delete</Text></Pressable>
        </View>}
      </View>
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
            const disabled = count + needed > 25;
            return <Pressable
              key={album.id}
              disabled={disabled || Boolean(deletingAlbumId)}
              onPress={() => moveAlbumSource ? moveAlbumMediaTo(album) : moveMediaToAlbum(moveMediaItem, album)}
              style={[styles.destination, { backgroundColor: colors.background, borderColor: colors.border }, disabled && { opacity: .45 }]}
            >
              <View style={[styles.destinationIcon, { backgroundColor: colors.surfaceSoft }]}><FolderOpen size={18} color={colors.pink} /></View>
              <View style={styles.flex}><Text style={[styles.albumTitle, { color: colors.text }]}>{album.title}</Text><Text style={[styles.albumCount, { color: colors.muted }]}>{count}/25 items · {25 - count} spaces</Text></View>
              {deletingAlbumId ? <ActivityIndicator color={colors.pink} /> : <ChevronRight size={18} color={colors.muted} />}
            </Pressable>;
          })}
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingTop: 22, paddingBottom: 24, alignSelf: "center", width: "100%" }, desktop: { maxWidth: 1120, paddingHorizontal: 28, paddingBottom: 48 },
  flex: { flex: 1, minWidth: 0 }, headingRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20 }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 5 },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.8 }, subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4 }, primary: { minHeight: 42, paddingHorizontal: 15, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  error: { fontSize: 12, marginBottom: 12 }, albumStrip: { gap: 10, paddingBottom: 20 }, album: { width: 218, height: 72, padding: 8, borderRadius: 18, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 9 },
  albumPreviewButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  albumCover: { width: 54, height: 54, borderRadius: 13, overflow: "hidden", alignItems: "center", justifyContent: "center" }, albumTitle: { fontSize: 12, fontWeight: "700" }, albumCount: { fontSize: 10, marginTop: 4 },
  albumCapacity: { height: 3, borderRadius: 3, overflow: "hidden", marginTop: 6, width: "86%" },
  skeletonGrid: { flexDirection: "row", gap: 10, paddingBottom: 20, overflow: "hidden" }, skeletonCard: { width: 218, height: 72, padding: 8, borderRadius: 18, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  skeletonCover: { width: 54, height: 54, borderRadius: 13 }, skeletonLine: { height: 8, borderRadius: 5, marginVertical: 4 },
  empty: { borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center", marginTop: 8 }, emptyIcon: { width: 60, height: 60, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 19, fontWeight: "800" }, emptyBody: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 430, marginVertical: 8, marginBottom: 16 },
  albumHeading: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 }, sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  iconButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  orderRow: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, marginBottom: 10 },
  orderLabel: { flex: 1, fontSize: 10 }, orderButton: { height: 34, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 3 },
  orderText: { fontSize: 9, fontWeight: "700" },
  upload: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 13 },
  uploadTask: { marginBottom: 8 }, uploadTaskLabel: { flexDirection: "row", gap: 8, marginBottom: 5 }, uploadName: { flex: 1, fontSize: 10 }, uploadPercent: { fontSize: 9, fontWeight: "800" },
  progress: { height: 5, borderRadius: 4, overflow: "hidden" }, mediaGrid: { flexDirection: "row", flexWrap: "wrap" }, tile: { width: "100%", borderRadius: 16, overflow: "hidden" },
  play: { position: "absolute", top: "50%", left: "50%", marginLeft: -19, marginTop: -19, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,.55)", alignItems: "center", justifyContent: "center" },
  coverBadge: { position: "absolute", left: 7, bottom: 7, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 3 }, coverText: { color: "#FFF", fontSize: 8, fontWeight: "800" },
  durationBadge: { position: "absolute", right: 7, bottom: 7, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: "rgba(0,0,0,.62)", borderRadius: 7 }, durationText: { color: "#FFF", fontSize: 8, fontWeight: "800" },
  viewBadge: { position: "absolute", right: 7, top: 7, width: 27, height: 27, borderRadius: 9, backgroundColor: "rgba(0,0,0,.42)", alignItems: "center", justifyContent: "center" },
  mediaEmpty: { alignItems: "center", paddingVertical: 34 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(20,10,15,.45)", justifyContent: "flex-end", padding: Platform.OS === "web" ? 20 : 0 },
  sheet: { width: "100%", maxWidth: 520, alignSelf: "center", borderWidth: 1, borderRadius: 26, padding: 20, paddingBottom: 30 }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  inputLabel: { fontSize: 11, fontWeight: "700", marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 15, fontSize: 13 }, textarea: { minHeight: 96, paddingTop: 13, textAlignVertical: "top" },
  modalHint: { fontSize: 10, lineHeight: 15, marginBottom: 14, marginTop: -3 },
  visibilityRow: { minHeight: 66, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 15 },
  visibilityTitle: { fontSize: 11, fontWeight: "800" }, visibilityHint: { fontSize: 9, lineHeight: 13, marginTop: 3 },
  save: { minHeight: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 4 },
  albumSaveActions: { flexDirection: "row", gap: 9 }, albumSaveSecondary: { flex: 1, borderWidth: 1 }, albumSavePrimary: { flex: 1.35, flexDirection: "row", gap: 7 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 18 },
  summaryCard: { flexGrow: 1, flexBasis: 130, minHeight: 72, padding: 14, borderWidth: 1, borderRadius: 17, justifyContent: "center" },
  summaryValue: { fontSize: 20, lineHeight: 24, fontWeight: "800" }, summaryLabel: { fontSize: 10, marginTop: 3 },
  setupNotice: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 15 },
  setupTitle: { fontSize: 11, fontWeight: "800" }, setupBody: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  connectButton: { alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 13, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 10 },
  capacityNotice: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 13 },
  capacityText: { flex: 1, fontSize: 9, lineHeight: 13 },
  uploadSheet: { width: "100%", maxWidth: 620, maxHeight: "88%", alignSelf: "center", borderWidth: 1, borderRadius: 26, padding: 20 },
  uploadList: { maxHeight: 470, marginBottom: 14 }, uploadAsset: { minHeight: 76, borderWidth: 1, borderRadius: 16, padding: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadThumb: { width: 58, height: 58, borderRadius: 12, overflow: "hidden" }, miniPlay: { position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,.28)" },
  uploadAssetName: { fontSize: 11, fontWeight: "700" }, uploadStatus: { fontSize: 9, lineHeight: 12, marginTop: 3, marginBottom: 6 },
  taskAction: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  uploadFooter: { paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 14 },
  overallProgress: { fontSize: 9, fontWeight: "800", marginTop: 5 },
  uploadStart: { width: 122, marginTop: 0, flexDirection: "row", gap: 7 },
  destination: { minHeight: 66, padding: 9, borderWidth: 1, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  destinationIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  albumPreviewBackdrop: { flex: 1 }, albumPreviewHeader: { minHeight: 82, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: 11 },
  previewEyebrow: { fontSize: 8, fontWeight: "800", letterSpacing: 1.3 }, albumPreviewTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  previewCount: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, albumPreviewContent: { width: "100%", maxWidth: 1040, alignSelf: "center", padding: 16, paddingBottom: 40 },
  albumPreviewHero: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: "center", marginBottom: 14 }, previewFolder: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  albumPreviewName: { fontSize: 22, fontWeight: "800", textAlign: "center", marginTop: 12 }, albumPreviewDescription: { fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 520, marginTop: 6 },
  previewBackdrop: { flex: 1, backgroundColor: "rgba(10,7,9,.96)", alignItems: "center", justifyContent: "center" }, previewClose: { position: "absolute", right: 20, top: 55, zIndex: 3, padding: 10 },
  previewImage: { width: "100%", height: "68%" }, previewZoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" }, previewZoomImage: { width: "100%", height: "100%" },
  previewNav: { position: "absolute", top: "47%", zIndex: 3, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,.13)", alignItems: "center", justifyContent: "center" },
  previewNavLeft: { left: 12 }, previewNavRight: { right: 12 },
  previewDetails: { position: "absolute", bottom: 91, alignItems: "center" }, previewPosition: { color: "#FFF", fontSize: 11, fontWeight: "800" }, previewMeta: { color: "rgba(255,255,255,.64)", fontSize: 9, marginTop: 3 },
  previewActions: { position: "absolute", bottom: 32, left: 16, right: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }, previewButton: { backgroundColor: "rgba(255,255,255,.14)", paddingHorizontal: 13, height: 42, borderRadius: 14, flexDirection: "row", gap: 6, alignItems: "center" }, previewText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
});
