import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  type ImageURISource,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Camera, ChevronLeft, Maximize2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brandPalette } from "@/constants/brandPalette";
import { typeScale, typeLeading } from "@/constants/typography";

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
  const opacity = useRef(new Animated.Value(1)).current;
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
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
    if (sources.length < 2 || transitioningRef.current) return;
    const normalized = (nextIndex + sources.length) % sources.length;
    if (normalized === indexRef.current) return;

    if (reducedMotion) {
      indexRef.current = normalized;
      setIndex(normalized);
      return;
    }

    transitioningRef.current = true;
    Animated.timing(opacity, {
      toValue: 0.12,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      indexRef.current = normalized;
      setIndex(normalized);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        transitioningRef.current = false;
      });
    });
  }, [opacity, reducedMotion, sources.length]);

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
    opacity.stopAnimation();
  }, [opacity]);

  const manuallyShow = useCallback((nextIndex: number) => {
    pauseTemporarily();
    showIndex(nextIndex);
  }, [pauseTemporarily, showIndex]);

  const panResponder = useMemo(() => {
    const isHorizontalSwipe = (dx: number, dy: number) =>
      sources.length > 1 && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2;
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => isHorizontalSwipe(gesture.dx, gesture.dy),
      onMoveShouldSetPanResponderCapture: (_event, gesture) => isHorizontalSwipe(gesture.dx, gesture.dy),
      onPanResponderGrant: () => pauseTemporarily(),
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) < 42) return;
        manuallyShow(indexRef.current + (gesture.dx < 0 ? 1 : -1));
      },
      onPanResponderTerminate: () => pauseTemporarily(),
    });
  }, [manuallyShow, pauseTemporarily, sources.length]);

  const currentSource = failed.has(index) && fallbackImage ? fallbackImage : sources[index];
  const currentFocalPoint = focalPoints[index] ?? { x: 0.5, y: 0.5 };
  const focalStyle = Platform.OS === "web"
    ? ({ objectPosition: `${Math.round(currentFocalPoint.x * 100)}% ${Math.round(currentFocalPoint.y * 100)}%` } as object)
    : ({ transform: [{ scale: 1.04 }, { translateX: (0.5 - currentFocalPoint.x) * 16 }, { translateY: (0.5 - currentFocalPoint.y) * 16 }] } as object);

  return (
    <View style={[styles.root, { height: heroHeight, backgroundColor: containMedia ? "#FFFFFF" : "#050505" }]}>
      <Pressable
      onPress={(event) => {
        event.stopPropagation();
        pauseTemporarily();
        onOpen?.(indexRef.current);
      }}
      onHoverIn={() => {
        if (Platform.OS === "web") {
          pausedRef.current = true;
          if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
        }
      }}
      onHoverOut={() => {
        if (Platform.OS === "web") pauseTemporarily(1800);
      }}
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityLabel={onOpen ? `Open ${vendorName} gallery image ${index + 1}` : undefined}
      style={styles.galleryTarget}
      {...panResponder.panHandlers}
      >
        {currentSource ? (
          <Animated.Image
            source={currentSource}
            defaultSource={fallbackImage}
            resizeMode={containMedia ? "contain" : "cover"}
            accessibilityLabel={`${vendorName} gallery image ${index + 1}`}
            onError={() => setFailed((current) => new Set(current).add(index))}
            style={[
              styles.image,
              focalStyle,
              { opacity } as any,
            ]}
          />
        ) : null}
        <View pointerEvents="none" style={styles.mediaShade} />
      </Pressable>

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
  backHovered: { backgroundColor: "rgba(28,20,23,.74)", transform: [{ translateY: -1 }] },
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
