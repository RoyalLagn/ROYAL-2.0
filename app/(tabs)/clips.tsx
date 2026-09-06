import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, AppState, FlatList, Image, PixelRatio, Platform,
  Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type ListRenderItemInfo, type ViewToken,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Clapperboard, RefreshCw, Search, Sparkles } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { PublicClipCard } from "@/clips/components";
import {
  PublicClipEngagementService, PublicClipService, sharePublicClip,
  ClipViewerHandoff, ClipViewerSessionService,
} from "@/clips/services";
import { CLIP_FEED_SETTINGS } from "@/clips/constants";
import { cloudinaryDeliveryUrl } from "@/utils/cloudinaryDelivery";
import type {
  ClipEngagementState, PublicClip, PublicClipCursor,
} from "@/clips/types";
import { EnquiryExternalOpenError, EnquiryService } from "@/services/enquiries";
import { typeScale, typeLeading } from "@/constants/typography";
import PageLoader from "@/components/loading/PageLoader";
import { getPublicClipsEnabled } from "@/services/publicClipsAvailability";

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
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getPublicClipsEnabled()
      .then((value) => { if (active) setEnabled(value); })
      .catch(() => { if (active) setEnabled(true); });
    return () => { active = false; };
  }, []);

  if (enabled === null) return <View style={[styles.availabilityRoot, { backgroundColor: dark ? "#080608" : "#FFFFFF" }]}><PageLoader /></View>;
  if (!enabled) return <ClipsComingSoon dark={dark} />;
  return <ClipsFeed />;
}

function ClipsComingSoon({ dark }: { dark: boolean }) {
  return <View style={[styles.availabilityRoot, { backgroundColor: dark ? "#080608" : "#FFFFFF" }]}>
    <StatusBar style={dark ? "light" : "dark"} />
    <View style={[styles.comingSoonCard, { backgroundColor: dark ? "#151014" : "#FFF8FB", borderColor: dark ? "#30232A" : "#F5D7E3" }]}>
      <View style={styles.comingSoonIcon}><Clapperboard size={42} color="#E91E63" strokeWidth={1.8} /></View>
      <Text style={[styles.comingSoonEyebrow, { color: dark ? "#FF8CB4" : "#C2185B" }]}>CLIPS</Text>
      <Text style={[styles.comingSoonTitle, { color: dark ? "#FFFFFF" : "#211A1D" }]}>This feature is coming soon</Text>
      <Text style={[styles.comingSoonText, { color: dark ? "#CBBBC3" : "#71666B" }]}>We’re preparing wedding inspiration for you. Please check back soon.</Text>
    </View>
  </View>;
}

function ClipsFeed() {
  const router = useRouter();
  const { clipId, clipSearch } = useLocalSearchParams<{ clipId?: string; clipSearch?: string }>();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const isFocused = useIsFocused();
  const { profile } = usePublicAuth();
  const listRef = useRef<FlatList<PublicClip>>(null);
  const viewedIds = useRef(new Set<string>());
  const previousFocus = useRef(isFocused);
  const [containerHeight, setContainerHeight] = useState(Math.max(1, windowHeight - (width >= 1100 ? 166 : 80)));
  const [clips, setClips] = useState<PublicClip[]>([]);
  const [cursor, setCursor] = useState<PublicClipCursor | null>(null);
  const [feedSession, setFeedSession] = useState(
    () => ClipViewerSessionService.createFeedSession(),
  );
  const activeFeedSeed = useRef(feedSession.seed);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [immersiveHold, setImmersiveHold] = useState(false);
  const [muted, setMuted] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [engagement, setEngagement] = useState<Record<string, ClipEngagementState>>({});
  const [counts, setCounts] = useState<Record<string, { likes: number; saves: number; views: number }>>({});

  const headerOpacity = useRef(new Animated.Value(1)).current;
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
  const desktop = width >= 1100;
  const background = desktop && !dark ? "#FFFFFF" : "#000000";
  const playerWidth = desktop
    ? Math.max(1, Math.min(480, feedWidth - 56, containerHeight * (9 / 16)))
    : Math.max(1, feedWidth);
  const playerHeight = desktop
    ? Math.max(1, Math.min(containerHeight, playerWidth * (16 / 9)))
    : Math.max(1, containerHeight);
  const compactPlayer = playerWidth < 360 || playerHeight < 620;

  useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: immersiveHold ? 0 : 1,
      duration: immersiveHold ? 90 : 170,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [headerOpacity, immersiveHold]);

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

  const beginNewFeedSession = useCallback(() => {
    const nextSession = ClipViewerSessionService.createFeedSession();
    activeFeedSeed.current = nextSession.seed;
    setLoadingMore(false);
    setFeedSession(nextSession);
  }, []);

  const loadInitial = useCallback(async () => {
    const requestSeed = feedSession.seed;
    setLoading(true);
    setError("");
    setActiveIndex(0);
    viewedIds.current.clear();
    try {
      const page = await PublicClipService.list({
        session: feedSession,
        pinnedClipId: clipId || null,
      });
      if (activeFeedSeed.current !== requestSeed) return;
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
      if (activeFeedSeed.current !== requestSeed) return;
      setClips([]);
      setError(caught instanceof Error ? caught.message : "Unable to load wedding inspiration.");
    } finally {
      if (activeFeedSeed.current !== requestSeed) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [clipId, feedSession, hydrateEngagement]);

  useEffect(() => { void loadInitial(); }, [loadInitial]);

  useEffect(() => {
    if (isFocused && !previousFocus.current) {
      // Tabs stay mounted between visits. Always begin a new public Clips
      // visit with sound enabled instead of retaining a previous mute choice.
      setMuted(false);
      beginNewFeedSession();
    }
    previousFocus.current = isFocused;
  }, [beginNewFeedSession, isFocused]);

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchQuery]);

  const loadMore = useCallback(async () => {
    // Search filters the already-loaded feed client-side (there is no
    // server-side search query yet), so paging further in can't surface more
    // matches -- it would just keep silently pulling in the rest of the feed
    // in the background every time the short filtered list hits its end.
    if (!cursor || !hasMore || loadingMore || searchQuery.trim()) return;
    const requestSeed = feedSession.seed;
    setLoadingMore(true);
    try {
      const page = await PublicClipService.list({
        cursor,
        session: feedSession,
        pinnedClipId: clipId || null,
      });
      if (activeFeedSeed.current !== requestSeed) return;
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
      if (activeFeedSeed.current !== requestSeed) return;
      setLoadingMore(false);
    }
  }, [clipId, cursor, feedSession, hasMore, hydrateEngagement, loadingMore, searchQuery]);

  const refreshFeed = useCallback(() => {
    setRefreshing(true);
    beginNewFeedSession();
  }, [beginNewFeedSession]);

  useEffect(() => {
    const clip = feedItems[activeIndex];
    if (!clip || !isFocused || !foreground || viewedIds.current.has(clip.id)) return;
    const timer = setTimeout(() => {
      viewedIds.current.add(clip.id);
      void PublicClipEngagementService.recordView(
        clip.id,
        profile?.id,
        clip.durationSeconds,
      )
        .then((countedNewView) => {
          if (!countedNewView) return;
          setCounts((current) => ({
            ...current,
            [clip.id]: {
              ...(current[clip.id] ?? {
                likes: clip.likesCount,
                saves: clip.savesCount,
                views: clip.viewsCount,
              }),
              views: (current[clip.id]?.views ?? clip.viewsCount) + 1,
            },
          }));
        })
        .catch(() => {
          // Playback stays usable if analytics cannot be recorded.
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

  // Controlled preloading: only the active clip ever mounts a real video
  // player (see PublicClipCard's shouldPlayVideo). To keep the *next* Clip
  // opening fast without a second decoder running, warm just its poster —
  // the same sized Cloudinary derivative PublicClipCard will request, so
  // this is a cache hit, not extra bytes.
  useEffect(() => {
    const dpr = Math.min(2, Math.max(1, PixelRatio.get()));
    for (let offset = 1; offset <= CLIP_FEED_SETTINGS.prefetchAhead; offset += 1) {
      const next = feedItems[activeIndex + offset];
      if (!next?.thumbnailUrl) continue;
      const posterUri = cloudinaryDeliveryUrl(next.thumbnailUrl, {
        width: playerWidth, height: playerHeight, crop: "fill", dpr, quality: "auto",
      });
      Image.prefetch(posterUri).catch(() => {
        // Best-effort warmup only; the poster will still load on demand.
      });
    }
  }, [activeIndex, feedItems, playerHeight, playerWidth]);

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
    if (clip.vendor.slug) {
      router.push({ pathname: "/vendor/[slug]", params: { slug: clip.vendor.slug, src: "clip" } });
      return;
    }
    router.push({ pathname: "/VendorsProfile", params: { vendorId: clip.vendor.id, src: "clip" } });
  }, [router]);
  const contactVendor = useCallback(async (clip: PublicClip) => {
    if (!clip.vendor.contactPhone) return openVendor(clip);
    try {
      await EnquiryService.trackContactAndOpen({
        vendorId: clip.vendor.id,
        vendorName: clip.vendor.name,
        contactPhone: clip.vendor.contactPhone,
        channel: "call",
        source: "clip",
        sourceRecordId: clip.id,
      });
    } catch (cause) {
      if (cause instanceof EnquiryExternalOpenError) Alert.alert("Dialler not opened", `${cause.message} Call Click ${cause.referenceCode} is still saved.`);
      else Alert.alert("Contact unavailable", cause instanceof Error ? cause.message : "Open the vendor profile to contact them.");
    }
  }, [openVendor]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<PublicClip>[] }) => {
    const visible = viewableItems.find((token) => token.isViewable && typeof token.index === "number");
    if (typeof visible?.index === "number") {
      setActiveIndex(visible.index);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 80 }).current;
  const handleHoldChange = useCallback((holding: boolean) => {
    setImmersiveHold(holding);
  }, []);

  useEffect(() => {
    setImmersiveHold(false);
  }, [activeIndex, isFocused]);

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
        shouldPlayVideo={index === activeIndex}
        muted={muted}
        engagement={engagement[item.id] ?? EMPTY_ENGAGEMENT}
        counts={counts[item.id] ?? { likes: item.likesCount, saves: item.savesCount, views: item.viewsCount }}
        chromeVisible={!immersiveHold}
        onHoldChange={handleHoldChange}
        onToggleMuted={() => setMuted((value) => !value)}
        onLike={() => void toggleLike(item)}
        onSave={() => void toggleSave(item)}
        onShare={() => void sharePublicClip(item).catch(() => Alert.alert("Unable to share", "Please try again."))}
        onVendor={() => openVendor(item)}
        onContact={() => void contactVendor(item)}
      />
    </View>
  ), [activeIndex, background, compactPlayer, contactVendor, containerHeight, counts, dark, desktop, engagement, feedWidth, foreground, handleHoldChange, immersiveHold, isFocused, muted, openVendor, playerHeight, playerWidth, toggleLike, toggleSave]);

  return <View style={[styles.root, { backgroundColor: background }, Platform.OS === "web" ? styles.rootWeb : null]}>
    {loading || refreshing ? <PageLoader /> : null}
    <StatusBar style="light" backgroundColor="transparent" translucent={!desktop} />
    {!desktop ? <Animated.View
      pointerEvents={immersiveHold ? "none" : "box-none"}
      style={[styles.toolbar, { paddingTop: Math.max(insets.top, 10), opacity: headerOpacity }]}
    >
      <View style={[styles.toolbarInner, { maxWidth: feedWidth }]}>
        <View style={styles.mobileSearchRow}>
          <View style={styles.searchShell}>
            <Search size={19} color="#FFFFFF" strokeWidth={2} />
            <TextInput
              accessibilityLabel="Search vendors, clips and weddings"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search clips, vendors, weddings..."
              placeholderTextColor="rgba(255,255,255,.76)"
              selectionColor="#FF7DA8"
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={styles.searchInput}
            />
          </View>
        </View>
      </View>
    </Animated.View> : null}

    <View onLayout={(event) => setContainerHeight(Math.max(1, Math.round(event.nativeEvent.layout.height)))} style={[styles.feedFrame, { width: feedWidth, backgroundColor: background }]}>
      {loading ? <FeedSkeleton dark={dark} width={playerWidth} height={playerHeight} /> : error ? <View style={[styles.state, { backgroundColor: background }]}><Clapperboard size={48} color="#E91E63" /><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>Inspiration is taking a moment</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Check your connection and try again.</Text><Pressable onPress={() => void loadInitial()} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View> :
      !clips.length ? <View style={[styles.state, { backgroundColor: background }]}><View style={styles.emptyIllustration}><Sparkles size={26} color="#E91E63" /><Clapperboard size={54} color="#E91E63" /></View><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>No wedding inspiration yet.</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Be the first vendor to upload amazing wedding moments.</Text></View> :
      !feedItems.length ? <View style={styles.state}><Search size={42} color="#E91E63" /><Text style={[styles.stateTitle, { color: dark ? "#FFF" : "#171717" }]}>No Clips match your search</Text><Text style={[styles.stateText, { color: dark ? "#CBBBC3" : "#737373" }]}>Try a vendor, city, category or another wedding keyword.</Text></View> :
      <FlatList ref={listRef} data={feedItems} renderItem={renderItem} keyExtractor={(item) => item.id}
        style={[styles.feed, Platform.OS === "web" ? styles.feedWeb : null]}
        refreshing={refreshing}
        onRefresh={refreshFeed}
        pagingEnabled snapToInterval={containerHeight} snapToAlignment="start" decelerationRate="fast"
        disableIntervalMomentum showsVerticalScrollIndicator={false}
        // Only the active + immediate-neighbor rows ever need to be mounted —
        // each row is a full screen and only the active one carries a real
        // video player, so a tight render window keeps native view count
        // (and therefore memory + composited layers) from growing while
        // scrolling through a long feed. Web keeps a slightly wider window
        // since DOM nodes are far cheaper than native views.
        initialNumToRender={Platform.OS === "web" ? 3 : 2}
        maxToRenderPerBatch={Platform.OS === "web" ? 3 : 2}
        updateCellsBatchingPeriod={16}
        windowSize={Platform.OS === "web" ? 5 : 3}
        // iOS-only: removeClippedSubviews has long-standing VirtualizedList
        // bugs on Android with per-item content like ours (native video
        // surfaces + absolute-positioned gradient overlays) — clipped rows
        // can fail to un-clip on scroll-back, which cuts the feed short
        // well before the real end. Not worth it here: the active-only
        // video mount + tight windowSize above already keep native view
        // count and memory in check without it.
        removeClippedSubviews={Platform.OS === "ios"}
        getItemLayout={(_, index) => ({ length: containerHeight, offset: containerHeight * index, index })}
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={viewabilityConfig}
        onEndReached={() => void loadMore()} onEndReachedThreshold={0.75}
        onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: index * containerHeight, animated: false })}
      />}
      {loadingMore ? <View pointerEvents="none" style={styles.loadingMore}><ActivityIndicator color="#FFFFFF" /></View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  availabilityRoot: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  comingSoonCard: { width: "100%", maxWidth: 520, alignItems: "center", borderWidth: 1, borderRadius: 28, paddingHorizontal: 28, paddingVertical: 48 },
  comingSoonIcon: { width: 96, height: 96, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.10)", marginBottom: 24 },
  comingSoonEyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 1.4, fontWeight: "800" },
  comingSoonTitle: { marginTop: 8, textAlign: "center", fontSize: typeScale.sectionTitle, lineHeight: 32, fontWeight: "800" },
  comingSoonText: { maxWidth: 360, marginTop: 10, textAlign: "center", fontSize: typeScale.body, lineHeight: typeLeading.body },
  root: { flex: 1, width: "100%", maxWidth: "100%", minHeight: 0, alignItems: "center", overflow: "hidden", backgroundColor: "#080608" },
  rootWeb: { maxHeight: "100dvh", overscrollBehavior: "none" } as any,
  toolbar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, width: "100%", alignItems: "center", paddingBottom: 12 },
  toolbarInner: { width: "100%", paddingHorizontal: 14 },
  mobileSearchRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10 },
  searchShell: { flex: 1, minWidth: 0, height: 46, borderRadius: 23, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(7,5,7,.30)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.46)", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  searchInput: { flex: 1, minWidth: 0, height: "100%", paddingVertical: 0, color: "#FFFFFF", fontSize: typeScale.body, fontWeight: "500", textShadowColor: "rgba(0,0,0,.4)", textShadowRadius: 4 },
  feedFrame: { flex: 1, minHeight: 0, alignSelf: "center", backgroundColor: "#080608", overflow: "hidden" },
  feed: { flex: 1, width: "100%" },
  feedWeb: { scrollSnapType: "y mandatory", overscrollBehavior: "contain", scrollbarWidth: "none" } as any,
  page: { flexShrink: 0, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: "#080608" },
  skeletonStage: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  skeleton: { overflow: "hidden", borderRadius: 18 }, skeletonVideo: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.08)" },
  skeletonBottom: { position: "absolute", left: 18, right: 70, bottom: 25, flexDirection: "row", alignItems: "center" }, skeletonAvatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(233,30,99,.24)" }, skeletonLines: { flex: 1, marginLeft: 10, gap: 7 }, skeletonLine: { height: 9, borderRadius: 5, backgroundColor: "rgba(233,30,99,.18)" },
  state: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center" }, emptyIllustration: { width: 128, height: 128, borderRadius: 42, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "rgba(233,30,99,.1)", marginBottom: 18 },
  stateTitle: { color: "#FFF", fontSize: typeScale.sectionTitle, fontWeight: "700", textAlign: "center", marginTop: 14 }, stateText: { color: "#CBBBC3", maxWidth: 380, textAlign: "center", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 7 },
  retry: { height: 46, borderRadius: 23, backgroundColor: "#E91E63", paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 }, retryText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
  loadingMore: { position: "absolute", right: 14, bottom: 14, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(16,10,14,.74)" },
});
