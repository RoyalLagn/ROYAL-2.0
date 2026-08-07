import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PortfolioVideoPlayer from "@/components/vendor/PortfolioVideoPlayer";
import {
  portfolioMediaUrl,
  type VendorPortfolioMedia,
} from "@/services/vendorPortfolio";
import { typeScale, typeLeading } from "@/constants/typography";

type Props = {
  visible: boolean;
  media: VendorPortfolioMedia[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
};

export default function FullscreenMediaViewer({
  visible,
  media,
  initialIndex = 0,
  title = "Portfolio",
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<VendorPortfolioMedia>>(null);
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible) return;
    const safeIndex = Math.max(0, Math.min(initialIndex, media.length - 1));
    setIndex(safeIndex);
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index: safeIndex, animated: false }));
  }, [initialIndex, media.length, visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) {
        listRef.current?.scrollToIndex({ index: index - 1, animated: true });
      }
      if (event.key === "ArrowRight" && index < media.length - 1) {
        listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, media.length, onClose, visible]);

  useEffect(() => {
    if (!visible || !media.length) return;
    [index - 1, index + 1].forEach((nearby) => {
      const item = media[nearby];
      if (item?.resource_type === "image") {
        Image.prefetch(portfolioMediaUrl(item, "fullscreen")).catch(() => undefined);
      }
    });
  }, [index, media, visible]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<VendorPortfolioMedia>[] }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable)?.index;
    if (typeof nextIndex === "number") setIndex(nextIndex);
  }).current;

  if (!media.length) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={media}
          horizontal
          pagingEnabled
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          getItemLayout={(_data, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          onScrollToIndexFailed={({ index: failedIndex }) =>
            setTimeout(() => listRef.current?.scrollToIndex({ index: failedIndex, animated: false }), 50)}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          renderItem={({ item, index: itemIndex }) => (
            <View style={{ width, height }}>
              {item.resource_type === "video" ? (
                itemIndex === index ? (
                  <View style={styles.media}><PortfolioVideoPlayer uri={item.optimized_url || item.secure_url} /></View>
                ) : (
                  <Image
                    source={{ uri: portfolioMediaUrl(item, "thumbnail") }}
                    resizeMode="contain"
                    style={styles.media}
                  />
                )
              ) : (
                <ScrollView
                  style={styles.media}
                  contentContainerStyle={styles.zoomContent}
                  maximumZoomScale={4}
                  minimumZoomScale={1}
                  centerContent
                  bouncesZoom
                >
                  <Image
                    source={{ uri: portfolioMediaUrl(item, "fullscreen") }}
                    resizeMode="contain"
                    style={{ width, height }}
                  />
                </ScrollView>
              )}
            </View>
          )}
        />

        <View pointerEvents="box-none" style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.titleWrap}>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            <Text style={styles.count}>{index + 1} of {media.length}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close media viewer" onPress={onClose} style={styles.control}>
            <X size={23} color="#FFF" />
          </Pressable>
        </View>

        {index > 0 ? (
          <Pressable
            accessibilityLabel="Previous media"
            onPress={() => listRef.current?.scrollToIndex({ index: index - 1, animated: true })}
            style={[styles.arrow, styles.left]}
          >
            <ChevronLeft size={25} color="#FFF" />
          </Pressable>
        ) : null}
        {index < media.length - 1 ? (
          <Pressable
            accessibilityLabel="Next media"
            onPress={() => listRef.current?.scrollToIndex({ index: index + 1, animated: true })}
            style={[styles.arrow, styles.right]}
          >
            <ChevronRight size={25} color="#FFF" />
          </Pressable>
        ) : null}
        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#070709" },
  media: { width: "100%", height: "100%" },
  zoomContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(7,7,9,.6)",
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { color: "#FFF", fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, fontWeight: "700" },
  count: { color: "rgba(255,255,255,.72)", fontSize: typeScale.metadata, marginTop: 2 },
  control: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center" },
  arrow: { position: "absolute", top: "48%", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(20,18,20,.6)", alignItems: "center", justifyContent: "center" },
  left: { left: 10 },
  right: { right: 10 },
});
