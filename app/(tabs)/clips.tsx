import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, AppState, FlatList, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View,
  type ListRenderItemInfo, type ViewToken,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Clapperboard, RefreshCw, Search, Sparkles } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { useCategories } from "@/context/CategoryContext";
import { PublicClipCard } from "@/clips/components";
import {
  PublicClipEngagementService, PublicClipService, sharePublicClip,
  ClipViewerHandoff,
} from "@/clips/services";
import { CLIP_FEED_SETTINGS } from "@/clips/constants";
import type {
  ClipCursor, ClipEngagementState, PublicClip,
} from "@/clips/types";

const EMPTY_ENGAGEMENT: ClipEngagementState = { liked: false, saved: false };

function FeedSkeleton({ dark, width, height }: { dark: boolean; width: number; height: number }) {
  return <View style={styles.skeletonStage}>
    <View style={[styles.skeleton, { width, height, backgroundColor: dark ? "#120D11" : "#21151B" }]}>
      <View style={styles.skeletonVideo}><ActivityIndicator size="large" color="#E91E63" /></View>
      <View style={styles.skeletonBottom}><View style={styles.skeletonAvatar} /><View style={styles.skeletonLines}><View style={[styles.skeletonLine, { width: "46%" }]} /><View style={[styles.skeletonLine, { width: "78%" }]} /><View style={[styles.skeletonLine, { width: "62%" }]} /></View></View>
    </View>
  </View>;
}

export default function ClipsScreen() {
  const router = useRouter();
  const { clipId, clipSearch } = useLocalSearchParams<{ clipId?: string; clipSearch?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const isFocused = useIsFocused();
  const { profile } = usePublicAuth();
  const { categories } = useCategories();
  const listRef = useRef<FlatList<PublicClip>>(null);
  const viewedIds = useRef(new Set<string>());
  const [containerHeight, setContainerHeight] = useState(Math.max(1, windowHeight - (width >= 1100 ? 166 : 178)));
  const [clips, setClips] = useState<PublicClip[]>([]);
  const [cursor, setCursor] = useState<ClipCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [preloadIndex, setPreloadIndex] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [muted, setMuted] = useState(Platform.OS === "web");
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [engagement, setEngagement] = useState<Record<string, ClipEngagementState>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; saves: number; views: number }>>({});

  const visibleCategories = useMemo(() =>
    categories.filter((category) => category.isActive && category.showInSearch).slice(0, 14),
  [categories]);
  const feedItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return clips;
    return clips.filter((clip) => [
      clip.title,
      clip.caption ?? "",
      clip.categoryName,
      clip.vendor.name,
      clip.vendor.city,
      clip.vendor.categoryName,
      ...clip.hashtags,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [clips, searchQuery]);
  const feedWidth = width;
  const background = dark ? "#000000" : "#FFFFFF";
  const desktop = width >= 1100;
  const tablet = width >= 768 && !desktop;
  const horizontalInset = desktop ? 28 : tablet ? 20 : 4;
  const maximumPlayerWidth = desktop ? 480 : tablet ? 440 : Math.max(1, feedWidth - (horizontalInset * 2));
  const playerWidth = Math.max(1, Math.min(
    maximumPlayerWidth,
    feedWidth - (horizontalInset * 2),
    containerHeight * (9 / 16),
  ));
  const playerHeight = Math.max(1, Math.min(containerHeight, playerWidth * (16 / 9)));
  const compactPlayer = playerWidth < 360 || playerHeight < 620;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setSearchQuery(typeof clipSearch === "string" ? clipSearch : "");
  }, [clipSearch]);

  const hydrateEngagement = useCallback(async (items: PublicClip[]) => {
    if (!items.length) return;
    setCounts((current) => {
      const next = { ...current };
      items.forEach((clip) => {
        next[clip.id] ??= { likes: clip.likesCount, saves: clip.savesCount, views: clip.viewsCount };
      });
      return next;
    });
    try {
      const mine = await PublicClipEngagementService.getMine(items.map((item) => item.id), profile?.id);
      setEngagement((current) => ({ ...current, ...mine }));
    } catch {
      // Public playback remains available when personal engagement cannot load.
    }
  }, [profile?.id]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    setActiveIndex(0);
    try {
      const page = await PublicClipService.list({ categoryId: selectedCategoryId });
      const handedOff = clipId ? ClipViewerHandoff.consume(clipId) : null;
      const selected = handedOff ?? page.items.find((item) => item.id === clipId) ?? null;
      const orderedItems = selected
        ? [selected, ...page.items.filter((item) => item.id !== selected.id)]
        : page.items;
      setClips(orderedItems);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      await hydrateEngagement(orderedItems);
    } catch (caught) {
      setClips([]);
      setError(caught instanceof Error ? caught.message : "Unable to load wedding inspiration.");
    } finally {
      setLoading(false);
    }
  }, [clipId, hydrateEngagement, selectedCategoryId]);

  useEffect(() => { void loadInitial(); }, [loadInitial]);

  useEffect(() => {
    setActiveIndex(0);
    setPreloadIndex(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchQuery]);

  const loadMore = useCallback(async () => {
    if (!cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await PublicClipService.list({ categoryId: selectedCategoryId, cursor });
      setClips((current) => {
        const known = new Set(current.map((clip) => clip.id));
        return [...current, ...page.items.filter((clip) => !known.has(clip.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      await hydrateEngagement(page.items);
    } catch {
      // Keep the current page usable; scrolling can trigger another attempt.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, hydrateEngagement, loadingMore, selectedCategoryId]);

  useEffect(() => {
    const clip = feedItems[activeIndex];
    if (!clip || !isFocused || !foreground || viewedIds.current.has(clip.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(clip.id);
      setCounts((current) => ({
        ...current,
        [clip.id]: { ...(current[clip.id] ?? { likes: clip.likesCount, saves: clip.savesCount, views: clip.viewsCount }), views: (current[clip.id]?.views ?? clip.viewsCount) + 1 },
      }));
      void PublicClipEngagementService.recordView(clip.id, profile?.id).catch(() => {
        // Unique-index conflicts mean this installation already counted the view.
      });
    }, CLIP_FEED_SETTINGS.minimumViewDurationMs);
    return () => clearTimeout(timer);
  }, [activeIndex, feedItems, foreground, isFocused, profile?.id]);

  useEffect(() => {
    if (!containerHeight || !feedItems.length) return;
    listRef.current?.scrollToOffset({
      offset: Math.min(activeIndex, feedItems.length - 1) * containerHeight,
      animated: false,
    });
  }, [activeIndex, containerHeight, feedItems.length]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.tagName === "INPUT" || element?.tagName === "TEXTAREA") return;
      const forward = event.key === "ArrowDown" || event.key === "PageDown";
      const backward = event.key === "ArrowUp" || event.key === "PageUp";
      if (!forward && !backward) return;
      event.preventDefault();
      const nextIndex = Math.max(0, Math.min(
        feedItems.length - 1,
        activeIndex + (forward ? 1 : -1),
      ));
      if (nextIndex === activeIndex) return;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, feedItems.length]);

  const requireProfile = useCallback(() => {
    if (profile?.id) return profile.id;
    Alert.alert("Sign in to continue", "Like, save and report Clips after signing in.", [
      { text: "Not now", style: "cancel" },
      { text: "Sign In", onPress: () => router.push("/DashboardCenter") },
    ]);
    return null;
  }, [profile?.id, router]);

  const toggleLike = useCallback(async (clip: PublicClip) => {
    const profileId = requireProfile();
    if (!profileId) return;
    const previous = engagement[clip.id] ?? EMPTY_ENGAGEMENT;
    const next = !previous.liked;
    setEngagement((current) => ({ ...current, [clip.id]: { ...(current[clip.id] ?? EMPTY_ENGAGEMENT), liked: next } }));
    setCounts((current) => {
      const value = current[clip.id] ?? { likes: clip.likesCount, saves: clip.savesCount, views: clip.viewsCount };
      return { ...current, [clip.id]: { ...value, likes: Math.max(0, value.likes + (next ? 1 : -1)) } };
    });
    try {
      await PublicClipEngagementService.setLiked(clip.id, profileId, next);
    } catch {
      setEngagement((current) => ({ ...current, [clip.id]: previous }));
      setCounts((current) => {
        const value = current[clip.id];
        return value ? { ...current, [clip.id]: { ...value, likes: Math.max(0, value.likes + (next ? -1 : 1)) } } : current;
      });
      Alert.alert("Like not saved", "Check your connection and try again.");
    }
  }, [engagement, requireProfile]);

  const toggleSave = useCallback(async (clip: PublicClip) => {
    const profileId = requireProfile();
    if (!profileId) return;
    const previous = engagement[clip.id] ?? EMPTY_ENGAGEMENT;
    const next = !previous.saved;
    setEngagement((current) => ({ ...current, [clip.id]: { ...(current[clip.id] ?? EMPTY_ENGAGEMENT), saved: next } }));
    setCounts((current) => {
      const value = current[clip.id] ?? { likes: clip.likesCount, saves: clip.savesCount, views: clip.viewsCount };
      return { ...current, [clip.id]: { ...value, saves: Math.max(0, value.saves + (next ? 1 : -1)) } };
    });
    try {
      await PublicClipEngagementService.setSaved(clip.id, profileId, next);
    } catch {
      setEngagement((current) => ({ ...current, [clip.id]: previous }));
      setCounts((current) => {
        const value = current[clip.id];
        return value ? { ...current, [clip.id]: { ...value, saves: Math.max(0, value.saves + (next ? -1 : 1)) } } : current;
      });
      Alert.alert("Save failed", "Check your connection and try again.");
    }
  }, [engagement, requireProfile]);

  const openVendor = useCallback((clip: PublicClip) => {
    router.push({ pathname: "/VendorsProfile", params: { vendorId: clip.vendor.id, category: clip.vendor.categoryName } });
  }, [router]);
  const contactVendor = useCallback(async (clip: PublicClip) => {
    const destination = clip.vendor.contactPhone
      ? `tel:${clip.vendor.contactPhone.replace(/[^\d+]/g, "")}`
      : clip.vendor.contactEmail ? `mailto:${clip.vendor.contactEmail}` : null;
    if (!destination || !(await Linking.canOpenURL(destination))) return openVendor(clip);
    await Linking.openURL(destination);
  }, [openVendor]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<PublicClip>[] }) => {
    const visible = viewableItems.find((token) => token.isViewable && typeof token.index === "number");
    if (typeof visible?.index === "number") {
      setActiveIndex(visible.index);
      setPreloadIndex(null);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75, minimumViewTime: 120 }).current;

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<PublicClip>) => (
    <View
      style={[
        styles.page,
        { width: feedWidth, height: containerHeight, backgroundColor: background },
        Platform.OS === "web" ? ({ scrollSnapAlign: "start", scrollSnapStop: "always" } as any) : null,
      ]}
    >
      <PublicClipCard
        clip={item}
        width={playerWidth}
        height={playerHeight}
        compact={compactPlayer}
        desktop={desktop}
        dark={dark}
        active={index === activeIndex && isFocused && foreground}
        nearby={Platform.OS === "android"
          ? index === activeIndex
          : index === activeIndex || index === preloadIndex}
        muted={muted}
        engagement={engagement[item.id] ?? EMPTY_ENGAGEMENT}
        counts={counts[item.id] ?? { likes: item.likesCount, saves: item.savesCount, views: item.viewsCount }}
        onToggleMuted={() => setMuted((value) => !value)}
        onLike={() => void toggleLike(item)}
        onSave={() => void toggleSave(item)}
        onShare={() => void sharePublicClip(item).catch(() => Alert.alert("Unable to share", "Please try again."))}
        onVendor={() => openVendor(item)}
        onContact={() => void contactVendor(item)}
      />
    </View>
  ), [activeIndex, background, compactPlayer, contactVendor, containerHeight, counts, dark, desktop, engagement, feedWidth, foreground, isFocused, muted, openVendor, playerHeight, playerWidth, preloadIndex, toggleLike, toggleSave]);

  return <View style={[styles.root, { backgroundColor: background }, Platform.OS === "web" ? styles.rootWeb : null]}>
    <StatusBar style={dark ? "light" : "dark"} backgroundColor={background} translucent={false} />
    <View style={[styles.toolbar, {
      paddingTop: desktop ? 4 : Math.max(insets.top, 8),
      backgroundColor: dark ? "#000000" : "#FFFFFF",
      borderBottomColor: dark ? "#242424" : "#EFEFEF",
    }]}>
      <View style={[styles.toolbarInner, { maxWidth: desktop ? 560 : tablet ? 520 : feedWidth }]}>
        {!desktop ? <View style={styles.mobileSearchRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: dark ? "#0E141F" : "#FFFFFF" },
              pressed && styles.backButtonPressed,
            ]}
          >
            <ChevronLeft size={18} color="#F04478" strokeWidth={2} />
          </Pressable>
          <CompactSearchBar
            accessibilityLabel="Search vendors, clips and cities"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search vendors, clips, cities..."
            dark={dark}
            style={styles.homeSearchBar}
          />
        </View> : null}
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, compactPlayer && styles.chipsCompact]}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCategoryId === null }} onPress={() => setSelectedCategoryId(null)} style={[styles.chip, { backgroundColor: dark ? "#181818" : "#F7F7F7", borderColor: dark ? "#353535" : "#E2E2E2" }, compactPlayer && styles.chipCompact, selectedCategoryId === null && styles.chipActive]}><Text style={[styles.chipText, { color: dark ? "#F6EAF0" : "#4A4A4A" }, selectedCategoryId === null && styles.chipTextActive]}>All</Text></Pressable>
          {visibleCategories.map((category) => {
            const selected = selectedCategoryId === category.id;
            return <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedCategoryId(category.id)} style={[styles.chip, { backgroundColor: dark ? "#181818" : "#F7F7F7", borderColor: dark ? "#353535" : "#E2E2E2" }, compactPlayer && styles.chipCompact, selected && styles.chipActive]}><Text style={[styles.chipText, { color: dark ? "#F6EAF0" : "#4A4A4A" }, selected && styles.chipTextActive]}>{category.name}</Text></Pressable>;
          })}
        </ScrollView>
      </View>
    </View>

    <View onLayout={(event) => setContainerHeight(Math.max(1, Math.round(event.nativeEvent.layout.height)))} style={[styles.feedFrame, { width: feedWidth, backgroundColor: background }]}>
      {loading ? <FeedSkeleton dark={dark} width={playerWidth} height={playerHeight} /> : error ? <View style={[styles.state, { backgroundColor: background }]}><Clapperboard size={48} color="#E91E63" /><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>Inspiration is taking a moment</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Check your connection and try again.</Text><Pressable onPress={() => void loadInitial()} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View> :
      !clips.length ? <View style={[styles.state, { backgroundColor: background }]}><View style={styles.emptyIllustration}><Sparkles size={26} color="#E91E63" /><Clapperboard size={54} color="#E91E63" /></View><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>No wedding inspiration yet.</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Be the first vendor to upload amazing wedding moments.</Text></View> :
      !feedItems.length ? <View style={styles.state}><Search size={42} color="#E91E63" /><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>No Clips match your search</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Try a vendor, city, category or another wedding keyword.</Text></View> :
      <FlatList ref={listRef} data={feedItems} renderItem={renderItem} keyExtractor={(item) => item.id}
        style={[styles.feed, Platform.OS === "web" ? styles.feedWeb : null]}
        pagingEnabled snapToInterval={containerHeight} snapToAlignment="start" decelerationRate="fast"
        disableIntervalMomentum showsVerticalScrollIndicator={false}
        initialNumToRender={Platform.OS === "android" ? 1 : 2}
        maxToRenderPerBatch={Platform.OS === "android" ? 2 : 3}
        windowSize={Platform.OS === "android" ? 2 : 3}
        removeClippedSubviews={Platform.OS === "ios"}
        getItemLayout={(_, index) => ({ length: containerHeight, offset: containerHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={() => {
          if (Platform.OS !== "android") {
            setPreloadIndex(activeIndex < feedItems.length - 1 ? activeIndex + 1 : null);
          }
        }}
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) setPreloadIndex(null);
        }}
        onMomentumScrollEnd={() => setPreloadIndex(null)}
        onEndReached={() => void loadMore()} onEndReachedThreshold={0.75}
        onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: index * containerHeight, animated: false })}
      />}
      {loadingMore ? <View pointerEvents="none" style={styles.loadingMore}><ActivityIndicator color="#FFFFFF" /></View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", maxWidth: "100%", minHeight: 0, alignItems: "center", overflow: "hidden", backgroundColor: "#080608" },
  rootWeb: { maxHeight: "100dvh", overscrollBehavior: "none" } as any,
  toolbar: { width: "100%", flexShrink: 0, alignItems: "center", backgroundColor: "#0D090C", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,.1)" },
  toolbarInner: { width: "100%", paddingHorizontal: 12 },
  mobileSearchRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 8 },
  homeSearchBar: { flex: 1, minWidth: 0, height: 42 },
  backButton: { width: 42, height: 42, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: "#F04478", shadowOpacity: 0, elevation: 0 },
  backButtonPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  chips: { paddingTop: 7, paddingBottom: 8, gap: 6 },
  chipsCompact: { paddingTop: 6, paddingBottom: 7, gap: 5 },
  chip: { height: 28, borderRadius: 14, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(35,25,30,.92)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)" },
  chipCompact: { height: 26, borderRadius: 13, paddingHorizontal: 9 },
  chipActive: { backgroundColor: "#E91E63", borderColor: "#F8B4CF" }, chipText: { color: "#F6EAF0", fontSize: 9, fontWeight: "700" }, chipTextActive: { color: "#FFF", fontWeight: "900" },
  feedFrame: { flex: 1, minHeight: 0, alignSelf: "center", backgroundColor: "#080608", overflow: "hidden" },
  feed: { flex: 1, width: "100%" },
  feedWeb: { scrollSnapType: "y mandatory", overscrollBehavior: "contain", scrollbarWidth: "none" } as any,
  page: { alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#080608" },
  skeletonStage: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  skeleton: { overflow: "hidden", borderRadius: 18 }, skeletonVideo: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.08)" },
  skeletonBottom: { position: "absolute", left: 18, right: 70, bottom: 25, flexDirection: "row", alignItems: "center" }, skeletonAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(233,30,99,.24)" }, skeletonLines: { flex: 1, marginLeft: 10, gap: 7 }, skeletonLine: { height: 9, borderRadius: 5, backgroundColor: "rgba(233,30,99,.18)" },
  state: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center" }, emptyIllustration: { width: 128, height: 128, borderRadius: 42, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(233,30,99,.1)", marginBottom: 18 },
  stateTitle: { color: "#FFF", fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 14 }, stateText: { color: "#CBBBC3", maxWidth: 380, textAlign: "center", fontSize: 12, lineHeight: 19, marginTop: 7 },
  retry: { height: 46, borderRadius: 23, backgroundColor: "#E91E63", paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 }, retryText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  loadingMore: { position: "absolute", right: 14, bottom: 14, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(16,10,14,.74)" },
});
