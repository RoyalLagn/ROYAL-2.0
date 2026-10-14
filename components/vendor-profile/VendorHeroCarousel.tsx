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
import { LinearGradient } from "expo-linear-gradient";
import { typeScale, typeLeading } from "@/constants/typography";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";

type CarouselImage = number | ImageURISource;

export type VendorHeroCarouselProps = {
  images: CarouselImage[];
  vendorName: string;
  fallbackImage?: CarouselImage;
  onBack?: () => void;
  onOpen?: (index: number) => void;
  focalPoints?: { x: number; y: number }[];
  paused?: boolean;
  intervalMs?: number;
  height?: number;
  containMedia?: boolean;
};

const DEFAULT_INTERVAL = 4500;
const MANUAL_PAUSE_MS = 10000;

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
  const { width } = useWindowDimensions();
  const sources = useMemo(() => images.length ? images : fallbackImage ? [fallbackImage] : [], [fallbackImage, images]);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const [manualResumeAt, setManualResumeAt] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const manualStartIndexRef = useRef<number | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(width);
  const heroHeight = height ?? (width >= 900 ? 470 : Math.max(300, Math.min(410, width * 0.78)));
  const controlHorizontalInset = width < 380 ? 14 : 18;

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
    if (typeof currentUri === "string" && currentUri) Image.prefetch(currentUri).catch(() => undefined);
    if (typeof nextUri === "string" && nextUri) Image.prefetch(nextUri).catch(() => undefined);
  }, [index, sources]);

  const showIndex = useCallback((nextIndex: number) => {
    if (sources.length < 2) return;
    programmaticScrollRef.current = true;
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
    setManualResumeAt(Date.now() + resumeDelay);
  }, []);

  useEffect(() => {
    if (sources.length < 2 || reducedMotion || paused) return;
    const autoInterval = Math.max(4000, Math.min(6000, intervalMs));
    const delay = manualResumeAt === null
      ? autoInterval
      : Math.max(0, manualResumeAt - Date.now());
    const timer = setTimeout(() => {
      setManualResumeAt(null);
      showIndex(indexRef.current + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [index, intervalMs, manualResumeAt, paused, reducedMotion, showIndex, sources.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * carouselWidth, y: 0, animated: false });
  }, [carouselWidth]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth || !sources.length) return;
    const wasProgrammatic = programmaticScrollRef.current;
    programmaticScrollRef.current = false;
    const measuredIndex = Math.round(event.nativeEvent.contentOffset.x / carouselWidth);
    const manualStartIndex = manualStartIndexRef.current;
    manualStartIndexRef.current = null;
    const rawIndex = !wasProgrammatic && manualStartIndex !== null
      ? Math.max(manualStartIndex - 1, Math.min(measuredIndex, manualStartIndex + 1))
      : measuredIndex;
    if (rawIndex !== measuredIndex) {
      scrollRef.current?.scrollTo({ x: rawIndex * carouselWidth, y: 0, animated: false });
    }
    if (rawIndex === sources.length) {
      indexRef.current = 0;
      setIndex(0);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false }));
      return;
    }
    const nextIndex = Math.max(0, Math.min(rawIndex, sources.length - 1));
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    if (!wasProgrammatic) pauseTemporarily();
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
        snapToInterval={carouselWidth}
        snapToAlignment="start"
        disableIntervalMomentum
        nestedScrollEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.galleryTarget}
        onTouchStart={() => pauseTemporarily()}
        onScrollBeginDrag={() => {
          programmaticScrollRef.current = false;
          manualStartIndexRef.current = indexRef.current;
          pauseTemporarily();
        }}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        {slides.map((source, slideIndex) => {
          const sourceIndex = slideIndex % sources.length;
          const shownSource = failed.has(sourceIndex) && fallbackImage ? fallbackImage : source;
          const focalPoint = focalPoints[sourceIndex] ?? { x: 0.5, y: 0.5 };
          const focalStyle = Platform.OS === "web"
            ? ({ objectPosition: `${Math.round(focalPoint.x * 100)}% ${Math.round(focalPoint.y * 100)}%` } as object)
            : undefined;
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
                  resizeMode={containMedia ? "contain" : "cover"}
                  accessibilityLabel={`${vendorName} gallery image ${sourceIndex + 1}`}
                  onError={() => {
                    setFailed((current) => {
                      if (current.has(sourceIndex)) return current;
                      const next = new Set(current);
                      next.add(sourceIndex);
                      return next;
                    });
                  }}
                  style={[styles.image, focalStyle]}
                />
              ) : null}
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(8,5,7,0.22)", "rgba(8,5,7,0.02)", "rgba(8,5,7,0.64)"]}
                locations={[0, 0.52, 1]}
                style={styles.mediaShade}
              />
              <View pointerEvents="none" style={styles.frameLine} />
            </Pressable>
          );
        })}
      </ScrollView>

      {onBack ? <View pointerEvents="box-none" style={[styles.topControls, { paddingHorizontal: controlHorizontalInset }]}>
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
      </View> : null}

      {sources.length > 1 ? (
        <View style={[styles.counter, { left: controlHorizontalInset }]}>
          <Camera size={13} color="#FFFFFF" strokeWidth={1.8} />
          <Text style={styles.counterText}>{index + 1}/{sources.length}</Text>
        </View>
      ) : null}

      {onOpen ? (
        <View pointerEvents="none" style={[styles.expandHint, { right: controlHorizontalInset }]}>
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
    borderRadius: 26,
    backgroundColor: "#050505",
  },
  galleryTarget: StyleSheet.absoluteFillObject,
  heroSlide: { flexGrow: 0, flexShrink: 0, overflow: "hidden" },
  heroSlideHovered: { opacity: 0.98 },
  heroSlidePressed: { opacity: 0.94 },
  heroSlidePressedReduced: { opacity: 0.91 },
  image: { width: "100%", height: "100%" },
  mediaShade: StyleSheet.absoluteFillObject,
  frameLine: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,.22)",
    borderRadius: 26,
  },
  topControls: { position: "absolute", top: 18, left: 0, right: 0 },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(20,14,17,.64)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  backHovered: { backgroundColor: "rgba(28,20,23,.74)", transform: [{ translateX: -2 }] },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  counter: {
    position: "absolute",
    left: 18,
    bottom: 28,
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(20,14,17,.72)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,.2)",
  },
  counterText: { color: "#FFFFFF", fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" },
  expandHint: { position: "absolute", right: 18, bottom: 27, minHeight: 36, borderRadius: 18, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(20,14,17,.74)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.2)" },
  expandHintText: { color: "#FFFFFF", fontSize: typeScale.metadata, lineHeight: typeLeading.caption, fontWeight: "700" },
  dots: { position: "absolute", bottom: 13, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,.5)" },
  dotActive: { width: 16, backgroundColor: "#FFF" },
});
