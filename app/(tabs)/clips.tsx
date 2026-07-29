import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, AppState, FlatList, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type ListRenderItemInfo, type ViewToken,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Clapperboard, RefreshCw, Search, Sparkles } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
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

function FeedSkeleton({ dark }: { dark: boolean }) {
  return <View style={[styles.skeleton, { backgroundColor: dark ? "#120D11" : "#F9EEF3" }]}>
    <View style={styles.skeletonVideo}><ActivityIndicator size="large" color="#E91E63" /></View>
    <View style={styles.skeletonBottom}><View style={styles.skeletonAvatar} /><View style={styles.skeletonLines}><View style={[styles.skeletonLine, { width: "46%" }]} /><View style={[styles.skeletonLine, { width: "78%" }]} /><View style={[styles.skeletonLine, { width: "62%" }]} /></View></View>
  </View>;
}

export default function ClipsScreen() {
  const router = useRouter();
  const { clipId } = useLocalSearchParams<{ clipId?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const isFocused = useIsFocused();
  const { profile } = usePublicAuth();
  const { categories } = useCategories();
  const viewedIds = useRef(new Set<string>());
  const [containerHeight, setContainerHeight] = useState(Math.max(1, windowHeight - 64));
  const [clips, setClips] = useState<PublicClip[]>([]);
  const [cursor, setCursor] = useState<ClipCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [preloadIndex, setPreloadIndex] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [engagement, setEngagement] = useState<Record<string, ClipEngagementState>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; saves: number; views: number }>>({});

  const visibleCategories = useMemo(() =>
    categories.filter((category) => category.isActive && category.showInSearch).slice(0, 14),
  [categories]);
  const feedWidth = width;
  const background = dark ? "#070507" : "#F8EDF2";

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => subscription.remove();
  }, []);

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
    const clip = clips[activeIndex];
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
  }, [activeIndex, clips, foreground, isFocused, profile?.id]);

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
    <PublicClipCard
      clip={item} height={containerHeight}
      active={index === activeIndex && isFocused && foreground}
      nearby={index === activeIndex || index === preloadIndex}
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
  ), [activeIndex, contactVendor, containerHeight, counts, engagement, foreground, isFocused, muted, openVendor, preloadIndex, toggleLike, toggleSave]);

  return <View style={[styles.root, { backgroundColor: background }]}>
    <View onLayout={(event) => setContainerHeight(Math.max(1, event.nativeEvent.layout.height))} style={[styles.feedFrame, { width: feedWidth }]}>
      {loading ? <FeedSkeleton dark={dark} /> : error ? <View style={[styles.state, { backgroundColor: dark ? "#120D11" : "#FFF7FA" }]}><Clapperboard size={48} color="#E91E63" /><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#23161D" }]}>Inspiration is taking a moment</Text><Text style={[styles.stateText, { color: dark ? "#BFAFB7" : "#776A71" }]}>Check your connection and try again.</Text><Pressable onPress={() => void loadInitial()} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View> :
      !clips.length ? <View style={[styles.state, { backgroundColor: dark ? "#120D11" : "#FFF7FA" }]}><View style={styles.emptyIllustration}><Sparkles size={26} color="#E91E63" /><Clapperboard size={54} color="#E91E63" /></View><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#23161D" }]}>No wedding inspiration yet.</Text><Text style={[styles.stateText, { color: dark ? "#BFAFB7" : "#776A71" }]}>Be the first vendor to upload amazing wedding moments.</Text></View> :
      <FlatList data={clips} renderItem={renderItem} keyExtractor={(item) => item.id}
        pagingEnabled snapToInterval={containerHeight} snapToAlignment="start" decelerationRate="fast"
        disableIntervalMomentum showsVerticalScrollIndicator={false}
        initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3} removeClippedSubviews={Platform.OS !== "web"}
        getItemLayout={(_, index) => ({ length: containerHeight, offset: containerHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={viewabilityConfig}
        onScrollBeginDrag={() => setPreloadIndex(activeIndex < clips.length - 1 ? activeIndex + 1 : null)}
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) setPreloadIndex(null);
        }}
        onMomentumScrollEnd={() => setPreloadIndex(null)}
        onEndReached={() => void loadMore()} onEndReachedThreshold={0.75}
        ListFooterComponent={loadingMore ? <View style={[styles.footer, { height: 60 }]}><ActivityIndicator color="#E91E63" /></View> : null}
      />}

      <LinearGradient colors={["rgba(8,5,7,.78)", "rgba(8,5,7,0)"]} style={styles.topShade} />
      <View style={[styles.topControls, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.search}><Search size={17} color="#F7EAF0" /><TextInput accessibilityLabel="Search vendors, clips, cities" placeholder="Search vendors, clips, cities..." placeholderTextColor="#E8D5DE" style={styles.searchInput} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCategoryId === null }} onPress={() => setSelectedCategoryId(null)} style={[styles.chip, selectedCategoryId === null && styles.chipActive]}><Text style={[styles.chipText, selectedCategoryId === null && styles.chipTextActive]}>All</Text></Pressable>
          {visibleCategories.map((category) => {
            const selected = selectedCategoryId === category.id;
            return <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setSelectedCategoryId(category.id)} style={[styles.chip, selected && styles.chipActive]}><Text style={[styles.chipText, selected && styles.chipTextActive]}>{category.name}</Text></Pressable>;
          })}
        </ScrollView>
      </View>
    </View>

  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", backgroundColor: "#080608" }, feedFrame: { flex: 1, alignSelf: "center", backgroundColor: "#080608", overflow: "hidden" },
  topShade: { position: "absolute", left: 0, right: 0, top: 0, height: 170, pointerEvents: "none" }, topControls: { position: "absolute", top: 0, left: 0, right: 0 },
  search: { height: 44, marginHorizontal: 14, paddingHorizontal: 14, borderRadius: 22, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(14,10,12,.58)", borderWidth: 1, borderColor: "rgba(255,255,255,.26)", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 12, elevation: 4 },
  searchInput: { flex: 1, marginLeft: 8, color: "#FFF", fontSize: 11, outlineStyle: "none" } as any,
  chips: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 7 }, chip: { height: 32, borderRadius: 16, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,10,12,.55)", borderWidth: 1, borderColor: "rgba(255,255,255,.22)" },
  chipActive: { backgroundColor: "#E91E63", borderColor: "#F8B4CF" }, chipText: { color: "#F6EAF0", fontSize: 9, fontWeight: "700" }, chipTextActive: { color: "#FFF", fontWeight: "900" },
  skeleton: { flex: 1 }, skeletonVideo: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.08)" },
  skeletonBottom: { position: "absolute", left: 18, right: 70, bottom: 25, flexDirection: "row", alignItems: "center" }, skeletonAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(233,30,99,.24)" }, skeletonLines: { flex: 1, marginLeft: 10, gap: 7 }, skeletonLine: { height: 9, borderRadius: 5, backgroundColor: "rgba(233,30,99,.18)" },
  state: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center" }, emptyIllustration: { width: 128, height: 128, borderRadius: 42, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(233,30,99,.1)", marginBottom: 18 },
  stateTitle: { fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 14 }, stateText: { maxWidth: 380, textAlign: "center", fontSize: 12, lineHeight: 19, marginTop: 7 },
  retry: { height: 46, borderRadius: 23, backgroundColor: "#E91E63", paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 }, retryText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  footer: { alignItems: "center", justifyContent: "center", backgroundColor: "#100A0E" },
});
