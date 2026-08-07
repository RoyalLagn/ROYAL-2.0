import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text,
  useWindowDimensions, View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bookmark, ChevronLeft, Clapperboard, MapPin } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  ClipViewerHandoff, SavedClipEvents, SavedClipService, type SavedClipItem,
} from "@/clips/services";

function Skeleton({ width }: { width: number }) {
  return <View style={{ width }}>
    <View style={[styles.skeletonImage, { height: width * 1.35 }]} />
    <View style={[styles.skeletonLine, { width: "72%" }]} />
    <View style={[styles.skeletonLine, { width: "48%" }]} />
  </View>;
}

const SavedCard = React.memo(function SavedCard({
  item, width, onPress,
}: {
  item: SavedClipItem;
  width: number;
  onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.clip.title}`} onPress={onPress} style={[styles.card, { width }]}>
    <View style={[styles.imageWrap, { height: width * 1.35 }]}>
      <Image source={{ uri: item.clip.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={styles.savedBadge}><Bookmark size={14} color="#FFF" fill="#FFF" /></View>
      <View style={styles.playBadge}><Clapperboard size={17} color="#FFF" /></View>
    </View>
    <Text numberOfLines={1} style={styles.vendor}>{item.clip.vendor.name}</Text>
    <Text numberOfLines={2} style={styles.caption}>{item.clip.caption || item.clip.title}</Text>
    <View style={styles.meta}>
      {item.clip.vendor.city ? <><MapPin size={10} color="#9A7D8A" /><Text numberOfLines={1} style={styles.metaText}>{item.clip.vendor.city}</Text></> : null}
      <Text style={styles.savedDate}>Saved {new Date(item.savedAt).toLocaleDateString()}</Text>
    </View>
  </Pressable>;
});

export default function SavedClipsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const { profile, isPublicAuthenticated, loading: authLoading } = usePublicAuth();
  const dark = colorScheme === "dark";
  const columns = width >= 1100 ? 5 : width >= 760 ? 4 : width >= 520 ? 3 : 2;
  const gap = 12;
  const horizontalPadding = width >= 760 ? 28 : 14;
  const cardWidth = Math.floor((width - horizontalPadding * 2 - gap * (columns - 1)) / columns);
  const [items, setItems] = useState<SavedClipItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError("");
    try {
      const page = await SavedClipService.list(profile.id);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load saved Clips.");
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(useCallback(() => {
    // Wait for the stored session to be restored — redirecting while auth is
    // still loading bounced signed-in users out to the role picker on reload.
    if (authLoading) return;
    if (!isPublicAuthenticated) {
      router.replace("/DashboardCenter");
      return;
    }
    void load();
  }, [authLoading, isPublicAuthenticated, load, router]));

  useEffect(() => SavedClipEvents.subscribe(({ clipId, saved }) => {
    if (!saved) setItems((current) => current.filter((item) => item.clip.id !== clipId));
    else void load();
  }), [load]);

  const loadMore = useCallback(async () => {
    if (!profile?.id || !cursor || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await SavedClipService.list(profile.id, cursor);
      setItems((current) => {
        const existing = new Set(current.map((item) => item.clip.id));
        return [...current, ...page.items.filter((item) => !existing.has(item.clip.id))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore, profile?.id]);

  const contentStyle = useMemo(() => ({
    paddingHorizontal: horizontalPadding,
    paddingBottom: 40,
  }), [horizontalPadding]);

  const openClip = useCallback((item: SavedClipItem) => {
    ClipViewerHandoff.set(item.clip);
    router.push({ pathname: "/(tabs)/clips", params: { clipId: item.clip.id } });
  }, [router]);

  return <SafeAreaView style={[styles.root, { backgroundColor: dark ? "#0A0809" : "#FFF9FC" }]} edges={["top"]}>
    <View style={[styles.header, { borderBottomColor: dark ? "#2C2227" : "#F1DCE5" }]}>
      <Pressable accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><ChevronLeft size={23} color={dark ? "#FFF" : "#21151B"} /></Pressable>
      <View style={styles.headerText}><Text style={[styles.title, { color: dark ? "#FFF" : "#21151B" }]}>Saved Clips</Text><Text style={styles.subtitle}>{items.length ? `${items.length} wedding inspiration${items.length === 1 ? "" : "s"}` : "Your wedding inspiration collection"}</Text></View>
    </View>
    {loading ? <View style={[styles.skeletonGrid, contentStyle]}>{Array.from({ length: columns * 2 }).map((_, index) => <Skeleton key={index} width={cardWidth} />)}</View>
      : error ? <View style={styles.center}><Bookmark size={44} color="#E91E63" /><Text style={[styles.emptyTitle, { color: dark ? "#FFF" : "#21151B" }]}>Saved Clips unavailable</Text><Text style={styles.emptyText}>{error}</Text><Pressable onPress={() => void load()} style={styles.explore}><Text style={styles.exploreText}>Try Again</Text></Pressable></View>
      : !items.length ? <View style={styles.center}><View style={styles.emptyIcon}><Bookmark size={42} color="#E91E63" /></View><Text style={[styles.emptyTitle, { color: dark ? "#FFF" : "#21151B" }]}>No Saved Clips Yet</Text><Text style={styles.emptyText}>Save wedding ideas you love and find them here anytime.</Text><Pressable onPress={() => router.push("/(tabs)/clips")} style={styles.explore}><Text style={styles.exploreText}>Explore Clips</Text></Pressable></View>
      : <FlatList
        key={columns}
        data={items}
        numColumns={columns}
        keyExtractor={(item) => item.clip.id}
        renderItem={({ item }) => <SavedCard item={item} width={cardWidth} onPress={() => openClip(item)} />}
        columnWrapperStyle={styles.row}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        initialNumToRender={columns * 2}
        maxToRenderPerBatch={columns * 2}
        windowSize={5}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.65}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loader} color="#E91E63" /> : null}
      />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, paddingRight: 44 }, title: { fontSize: 22, fontWeight: "900", letterSpacing: -0.4 }, subtitle: { color: "#9A7D8A", fontSize: 10, marginTop: 2 },
  row: { gap: 12 }, card: { marginTop: 14 }, imageWrap: { borderRadius: 16, overflow: "hidden", backgroundColor: "#21151B" },
  savedBadge: { position: "absolute", top: 9, right: 9, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,8,10,.58)" },
  playBadge: { position: "absolute", left: 9, bottom: 9, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.86)" },
  vendor: { color: "#E91E63", fontSize: 10, fontWeight: "900", marginTop: 8 }, caption: { color: "#604D56", fontSize: 11, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 5 }, metaText: { flexShrink: 1, color: "#9A7D8A", fontSize: 8 }, savedDate: { marginLeft: "auto", color: "#A8949D", fontSize: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, emptyIcon: { width: 94, height: 94, borderRadius: 47, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(233,30,99,.1)" },
  emptyTitle: { fontSize: 20, fontWeight: "900", marginTop: 18 }, emptyText: { maxWidth: 330, color: "#8C7580", textAlign: "center", fontSize: 11, lineHeight: 18, marginTop: 7 },
  explore: { height: 46, borderRadius: 23, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63", marginTop: 18 }, exploreText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 14 }, skeletonImage: { borderRadius: 16, backgroundColor: "rgba(233,30,99,.1)" }, skeletonLine: { height: 8, borderRadius: 4, backgroundColor: "rgba(154,125,138,.16)", marginTop: 7 },
  loader: { marginVertical: 24 },
});
