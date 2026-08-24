import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  type ImageURISource,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Camera, ChevronLeft, Maximize2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";

type CarouselImage = number | ImageURISource;

export type VendorHeroCarouselProps = {
  images: CarouselImage[];
  vendorName: string;
  fallbackImage?: CarouselImage;
  onBack: () => void;
  onOpen?: (index: number) => void;
  focalPoints?: { x: number; y: number }[];
  paused?: boolean;
  intervalMs?: number;
  height?: number;
  containMedia?: boolean;
};

const DEFAULT_INTERVAL = 3500;
const MANUAL_PAUSE_MS = 6500;

function remoteUri(source?: CarouselImage) {
  return typeof source === "object" && source?.uri ? source.uri : null;
}

function VendorHeroCarousel({
  images,
  vendorName,
  fallbackImage,
  onBack,
  onOpen,
  focalPoints = [],
  paused = false,
  intervalMs = DEFAULT_INTERVAL,
  height,
  containMedia = false,
}: VendorHeroCarouselProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sources = useMemo(() => images.length ? images : fallbackImage ? [fallbackImage] : [], [fallbackImage, images]);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(width);
  const heroHeight = height ?? (width >= 900 ? 470 : Math.max(300, Math.min(410, width * 0.78)));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReducedMotion);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    indexRef.current = index;
    const currentUri = remoteUri(sources[index]);
    const nextUri = remoteUri(sources[(index + 1) % sources.length]);
    if (currentUri) Image.prefetch(currentUri).catch(() => undefined);
    if (nextUri) Image.prefetch(nextUri).catch(() => undefined);
  }, [index, sources]);

  const showIndex = useCallback((nextIndex: number) => {
    if (sources.length < 2) return;
    if (nextIndex >= sources.length) {
      scrollRef.current?.scrollTo({ x: sources.length * carouselWidth, y: 0, animated: !reducedMotion });
      return;
    }
    const normalized = (nextIndex + sources.length) % sources.length;
    indexRef.current = normalized;
    setIndex(normalized);
    scrollRef.current?.scrollTo({ x: normalized * carouselWidth, y: 0, animated: !reducedMotion });
  }, [carouselWidth, reducedMotion, sources.length]);

  const pauseTemporarily = useCallback((resumeDelay = MANUAL_PAUSE_MS) => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      resumeTimerRef.current = null;
    }, resumeDelay);
  }, []);

  useEffect(() => {
    if (sources.length < 2 || reducedMotion) return;
    const timer = setInterval(() => {
      if (!paused && !pausedRef.current) showIndex(indexRef.current + 1);
    }, Math.max(3000, Math.min(5000, intervalMs)));
    return () => clearInterval(timer);
  }, [intervalMs, paused, reducedMotion, showIndex, sources.length]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * carouselWidth, y: 0, animated: false });
  }, [carouselWidth]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth || !sources.length) return;
    const rawIndex = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    if (rawIndex === sources.length) {
      indexRef.current = 0;
      setIndex(0);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false }));
      return;
    }
    const nextIndex = Math.max(0, Math.min(rawIndex, sources.length - 1));
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    pauseTemporarily();
  }, [carouselWidth, pauseTemporarily, sources.length]);

  const slides = sources.length > 1 ? [...sources, sources[0]] : sources;

  return (
    <View
      style={[styles.root, { height: heroHeight, backgroundColor: containMedia ? "#FFFFFF" : "#050505" }]}
      onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.galleryTarget}
        onScrollBeginDrag={() => pauseTemporarily()}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {slides.map((source, slideIndex) => {
          const sourceIndex = slideIndex % sources.length;
          const shownSource = failed.has(sourceIndex) && fallbackImage ? fallbackImage : source;
          const focalPoint = focalPoints[sourceIndex] ?? { x: 0.5, y: 0.5 };
          const focalStyle = Platform.OS === "web"
            ? ({ objectPosition: `${Math.round(focalPoint.x * 100)}% ${Math.round(focalPoint.y * 100)}%` } as object)
            : ({ transform: [{ scale: 1.04 }, { translateX: (0.5 - focalPoint.x) * 16 }, { translateY: (0.5 - focalPoint.y) * 16 }] } as object);
          return (
            <Pressable
              key={`${sourceIndex}-${slideIndex === sources.length ? "loop" : "slide"}`}
              onPress={() => {
                pauseTemporarily();
                onOpen?.(sourceIndex);
              }}
              accessibilityRole={onOpen ? "button" : undefined}
              accessibilityLabel={onOpen ? `Open ${vendorName} gallery image ${sourceIndex + 1}` : undefined}
              style={({ pressed, hovered }) => [
                styles.heroSlide,
                { width: carouselWidth, height: heroHeight },
                hovered && Platform.OS === "web" && Boolean(onOpen) && !reducedMotion && styles.heroSlideHovered,
                pressed && Boolean(onOpen) && (reducedMotion ? styles.heroSlidePressedReduced : styles.heroSlidePressed),
              ]}
            >
              {shownSource ? (
                <Image
                  source={shownSource}
                  defaultSource={fallbackImage}
                  resizeMode={containMedia ? "contain" : "cover"}
                  accessibilityLabel={`${vendorName} gallery image ${sourceIndex + 1}`}
                  onError={() => setFailed((current) => new Set(current).add(sourceIndex))}
                  style={[styles.image, focalStyle]}
                />
              ) : null}
              <View pointerEvents="none" style={styles.mediaShade} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View pointerEvents="box-none" style={[styles.topControls, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Go back from ${vendorName}`}
          onPress={(event) => {
            event.stopPropagation();
            onBack();
          }}
          hitSlop={8}
          style={({ pressed, hovered }) => [
            styles.backButton,
            hovered && Platform.OS === "web" && styles.backHovered,
            pressed && styles.pressed,
          ]}
        >
          <ChevronLeft size={25} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>

      {sources.length > 1 ? (
        <View style={styles.counter}>
          <Camera size={13} color="#FFFFFF" strokeWidth={1.8} />
          <Text style={styles.counterText}>{index + 1}/{sources.length}</Text>
        </View>
      ) : null}

      {onOpen ? (
        <View pointerEvents="none" style={styles.expandHint}>
          <Maximize2 size={13} color="#FFFFFF" strokeWidth={1.9} />
          <Text style={styles.expandHintText}>View gallery</Text>
        </View>
      ) : null}

      {sources.length > 1 ? <>
        <View style={styles.dots}>
          {sources.map((_source, dotIndex) => <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.dotActive]} />)}
        </View>
      </> : null}
    </View>
  );
}

export default React.memo(VendorHeroCarousel);

const styles = StyleSheet.create({
  root: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    backgroundColor: "#050505",
  },
  galleryTarget: StyleSheet.absoluteFillObject,
  heroSlide: { overflow: "hidden" },
  heroSlideHovered: { opacity: 0.97, transform: [{ scale: 1.006 }] },
  heroSlidePressed: { opacity: 0.91, transform: [{ scale: 0.992 }] },
  heroSlidePressedReduced: { opacity: 0.91 },
  image: { width: "100%", height: "100%" },
  mediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: brandPalette.light.overlayInk, opacity: 0.12 },
  topControls: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 18 },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(28,20,23,.58)",
    alignItems: "center",
    justifyContent: "center",
  },
  backHovered: { backgroundColor: "rgba(28,20,23,.74)", transform: [{ translateX: -2 }] },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  counter: {
    position: "absolute",
    left: 18,
    bottom: 28,
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(28,20,23,.66)",
  },
  counterText: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" },
  expandHint: { position: "absolute", right: 18, bottom: 27, minHeight: 32, borderRadius: 16, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(28,20,23,.68)" },
  expandHintText: { color: "#FFFFFF", fontSize: typeScale.metadata, lineHeight: typeLeading.caption, fontWeight: "700" },
  dots: { position: "absolute", bottom: 13, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,.5)" },
  dotActive: { width: 16, backgroundColor: "#FFF" },
});
