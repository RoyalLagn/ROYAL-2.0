import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BadgeCheck, ChevronLeft, Eye, Heart, Send } from "lucide-react-native";
import { PublicClipVideo, PublicClipVideoBoundary } from "@/clips/components";
import { CLIP_FEED_SETTINGS } from "@/clips/constants";
import {
  PublicClipEngagementService,
  sharePublicClip,
} from "@/clips/services";
import type { ClipEngagementState, PublicClip } from "@/clips/types";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { cloudinaryDeliveryUrl } from "@/utils/cloudinaryDelivery";

type ViewerItem = {
  key: string;
  clip: PublicClip;
};

const EMPTY_ENGAGEMENT: ClipEngagementState = { liked: false, saved: false };

function compactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K`;
  return String(Math.max(0, value));
}

export default function VendorClipsReelViewer({
  visible,
  clips,
  initialIndex,
  vendorName,
  verified,
  onClose,
}: {
  visible: boolean;
  clips: PublicClip[];
  initialIndex: number;
  vendorName: string;
  verified: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = usePublicAuth();
  const listRef = useRef<FlatList<ViewerItem>>(null);
  const viewedIds = useRef(new Set<string>());
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [activeIndex, setActiveIndex] = useState(0);
  const [engagement, setEngagement] = useState<Record<string, ClipEngagementState>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; views: number }>>({});

  const viewerItems = useMemo<ViewerItem[]>(() => {
    if (clips.length <= 1) return clips.map((clip) => ({ key: clip.id, clip }));
    return [0, 1, 2].flatMap((cycle) =>
      clips.map((clip) => ({ key: `${cycle}:${clip.id}`, clip })),
    );
  }, [clips]);
  const safeInitial = Math.max(0, Math.min(initialIndex, Math.max(0, clips.length - 1)));
  const initialPhysicalIndex = clips.length > 1 ? clips.length + safeInitial : safeInitial;
  const activeClip = viewerItems[activeIndex]?.clip ?? clips[safeInitial];

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(initialPhysicalIndex);
    viewedIds.current.clear();
    setCounts(Object.fromEntries(clips.map((clip) => [
      clip.id,
      { likes: clip.likesCount, views: clip.viewsCount },
    ])));
    void PublicClipEngagementService.getMine(clips.map((clip) => clip.id), profile?.id)
      .then(setEngagement)
      .catch(() => {
        // Playback remains available when personal engagement cannot load.
      });
  }, [clips, initialPhysicalIndex, profile?.id, visible]);

  useEffect(() => {
    if (!visible || !foreground || !activeClip || viewedIds.current.has(activeClip.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(activeClip.id);
      void PublicClipEngagementService.recordView(
        activeClip.id,
        profile?.id,
        activeClip.durationSeconds,
      ).then((counted) => {
        if (!counted) return;
        setCounts((current) => ({
          ...current,
          [activeClip.id]: {
            likes: current[activeClip.id]?.likes ?? activeClip.likesCount,
            views: (current[activeClip.id]?.views ?? activeClip.viewsCount) + 1,
          },
        }));
      }).catch(() => {
        // A failed analytics call must not interrupt the Reel.
      });
    }, CLIP_FEED_SETTINGS.minimumViewDurationMs);
    return () => clearTimeout(timer);
  }, [activeClip, foreground, profile?.id, visible]);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const forward = event.key === "ArrowDown" || event.key === "PageDown";
      const backward = event.key === "ArrowUp" || event.key === "PageUp";
      if (!forward && !backward) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(viewerItems.length - 1, activeIndex + (forward ? 1 : -1)));
      listRef.current?.scrollToIndex({ index: next, animated: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, viewerItems.length, visible]);

  const requireProfile = useCallback(() => {
    if (profile?.id) return profile.id;
    Alert.alert("Sign in to continue", "Sign in to like this vendor's Clips.", [
      { text: "Not now", style: "cancel" },
      {
        text: "Sign In",
        onPress: () => {
          onClose();
          router.push("/DashboardCenter");
        },
      },
    ]);
    return null;
  }, [onClose, profile?.id, router]);

  const toggleLike = useCallback(async (clip: PublicClip) => {
    const profileId = requireProfile();
    if (!profileId) return;
    const previous = engagement[clip.id] ?? EMPTY_ENGAGEMENT;
    const next = !previous.liked;
    setEngagement((current) => ({
      ...current,
      [clip.id]: { ...(current[clip.id] ?? EMPTY_ENGAGEMENT), liked: next },
    }));
    setCounts((current) => {
      const value = current[clip.id] ?? { likes: clip.likesCount, views: clip.viewsCount };
      return {
        ...current,
        [clip.id]: { ...value, likes: Math.max(0, value.likes + (next ? 1 : -1)) },
      };
    });
    try {
      await PublicClipEngagementService.setLiked(clip.id, profileId, next);
    } catch {
      setEngagement((current) => ({ ...current, [clip.id]: previous }));
      setCounts((current) => {
        const value = current[clip.id];
        return value ? {
          ...current,
          [clip.id]: { ...value, likes: Math.max(0, value.likes + (next ? -1 : 1)) },
        } : current;
      });
      Alert.alert("Like not saved", "Check your connection and try again.");
    }
  }, [engagement, requireProfile]);

  const onViewableItemsChanged = useRef(({
    viewableItems,
  }: {
    viewableItems: ViewToken<ViewerItem>[];
  }) => {
    const visibleItem = viewableItems.find((token) => token.isViewable && typeof token.index === "number");
    if (typeof visibleItem?.index === "number") setActiveIndex(visibleItem.index);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65, minimumViewTime: 80 }).current;

  const recenterInfiniteList = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (clips.length <= 1) return;
    const settledIndex = Math.round(event.nativeEvent.contentOffset.y / height);
    if (settledIndex >= clips.length && settledIndex < clips.length * 2) return;
    const logicalIndex = ((settledIndex % clips.length) + clips.length) % clips.length;
    const centeredIndex = clips.length + logicalIndex;
    listRef.current?.scrollToIndex({ index: centeredIndex, animated: false });
    setActiveIndex(centeredIndex);
  }, [clips.length, height]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<ViewerItem>) => {
    // Only the active slot mounts a real video player — matches the main
    // Clips feed's "one decoder at a time" rule so this modal can't stack up
    // extra concurrent players either.
    const shouldPlayVideo = index === activeIndex;
    const clip = item.clip;
    const liked = engagement[clip.id]?.liked ?? false;
    const clipCounts = counts[clip.id] ?? { likes: clip.likesCount, views: clip.viewsCount };
    const posterUri = clip.thumbnailUrl
      ? cloudinaryDeliveryUrl(clip.thumbnailUrl, { width, height, crop: "fill", dpr: 2, quality: "auto" })
      : clip.thumbnailUrl;
    return (
      <View
        style={[
          styles.reel,
          { width, height },
          Platform.OS === "web"
            ? ({ scrollSnapAlign: "start", scrollSnapStop: "always" } as any)
            : null,
        ]}
      >
        {shouldPlayVideo ? (
          <PublicClipVideoBoundary posterUri={posterUri ?? ""}>
            <PublicClipVideo
              uri={clip.videoUrl}
              thumbnailUrl={clip.thumbnailUrl}
              sourceWidth={clip.resolution.width}
              sourceHeight={clip.resolution.height}
              active={index === activeIndex && visible && foreground}
              muted={muted}
              width={width}
              height={height}
              showMuteControl={false}
              onToggleMuted={() => setMuted((current) => !current)}
              onDoubleTapLike={() => {
                if (!liked) void toggleLike(clip);
              }}
            />
          </PublicClipVideoBoundary>
        ) : posterUri ? (
          <Image source={{ uri: posterUri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,.44)", "transparent", "transparent", "rgba(0,0,0,.78)"]}
          locations={[0, 0.18, 0.56, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Clips"
            onPress={onClose}
            style={({ pressed }) => [styles.backButton, pressed && styles.controlPressed]}
          >
            <ChevronLeft size={25} color="#FFFFFF" strokeWidth={2.3} />
          </Pressable>
          <View style={styles.vendorIdentity}>
            <Text numberOfLines={1} style={styles.vendorName}>{vendorName}</Text>
            {verified ? <BadgeCheck size={17} color="#FF5F91" fill="#FFFFFF" strokeWidth={2.4} /> : null}
          </View>
          <View style={styles.topSpacer} />
        </View>

        <View style={[styles.bottomOverlay, { paddingBottom: Math.max(insets.bottom + 22, 30) }]}>
          <View style={styles.captionWrap}>
            {clip.title ? <Text numberOfLines={2} style={styles.clipTitle}>{clip.title}</Text> : null}
            {clip.caption ? <Text numberOfLines={2} style={styles.clipCaption}>{clip.caption}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={liked ? "Unlike Clip" : "Like Clip"}
              onPress={() => void toggleLike(clip)}
              style={({ pressed }) => [styles.action, pressed && styles.controlPressed]}
            >
              <Heart
                size={27}
                color={liked ? "#FF4F86" : "#FFFFFF"}
                fill={liked ? "#FF4F86" : "transparent"}
                strokeWidth={2.2}
              />
              <Text style={styles.actionText}>{compactCount(clipCounts.likes)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share Clip"
              onPress={() => void sharePublicClip(clip).catch(() =>
                Alert.alert("Unable to share", "Please try again."))
              }
              style={({ pressed }) => [styles.action, pressed && styles.controlPressed]}
            >
              <Send size={26} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
            <View accessibilityLabel={`${clipCounts.views} views`} style={styles.action}>
              <Eye size={27} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={styles.actionText}>{compactCount(clipCounts.views)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [
    activeIndex,
    counts,
    engagement,
    foreground,
    height,
    insets.bottom,
    insets.top,
    muted,
    onClose,
    toggleLike,
    vendorName,
    verified,
    visible,
    width,
  ]);

  if (!visible || !clips.length) return null;

  return (
    <Modal
      visible
      animationType="fade"
      hardwareAccelerated
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar style="light" backgroundColor="#000000" />
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          key={`${clips.length}:${safeInitial}:${height}`}
          data={viewerItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          initialScrollIndex={initialPhysicalIndex}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          initialNumToRender={Platform.OS === "web" ? 3 : 2}
          maxToRenderPerBatch={Platform.OS === "web" ? 3 : 2}
          windowSize={Platform.OS === "web" ? 5 : 3}
          removeClippedSubviews={Platform.OS !== "web"}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onMomentumScrollEnd={recenterInfiniteList}
          style={Platform.OS === "web" ? styles.listWeb : undefined}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  listWeb: { scrollSnapType: "y mandatory" } as any,
  reel: { backgroundColor: "#000000", overflow: "hidden" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 72,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,7,10,.38)",
  },
  vendorIdentity: {
    maxWidth: "68%",
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(12,7,10,.28)",
  },
  vendorName: { color: "#FFFFFF", fontSize: 14, lineHeight: 19, fontWeight: "800" },
  topSpacer: { width: 44, height: 44 },
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
  },
  captionWrap: { flex: 1, paddingBottom: 4, gap: 5 },
  clipTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,.55)",
    textShadowRadius: 4,
  },
  clipCaption: {
    color: "rgba(255,255,255,.88)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,.55)",
    textShadowRadius: 4,
  },
  actions: { alignItems: "center", gap: 17 },
  action: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 },
  actionText: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,.7)",
    textShadowRadius: 3,
  },
  controlPressed: { opacity: 0.7, transform: [{ scale: 0.92 }] },
});
