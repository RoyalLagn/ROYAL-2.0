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
import { Camera, ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CarouselImage = number | ImageURISource;

export type VendorHeroCarouselProps = {
  images: CarouselImage[];
  vendorName: string;
  fallbackImage?: CarouselImage;
  onBack: () => void;
  intervalMs?: number;
};

const DEFAULT_INTERVAL = 4500;
const MANUAL_PAUSE_MS = 6500;

function remoteUri(source?: CarouselImage) {
  return typeof source === "object" && source?.uri ? source.uri : null;
}

export default function VendorHeroCarousel({
  images,
  vendorName,
  fallbackImage,
  onBack,
  intervalMs = DEFAULT_INTERVAL,
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
  const heroHeight = width >= 900 ? 470 : Math.max(300, Math.min(410, width * 0.78));

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
    const nextUri = remoteUri(sources[(index + 1) % sources.length]);
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
      if (!pausedRef.current) showIndex(indexRef.current + 1);
    }, Math.max(4000, Math.min(5000, intervalMs)));
    return () => clearInterval(timer);
  }, [intervalMs, reducedMotion, showIndex, sources.length]);

  useEffect(() => () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    opacity.stopAnimation();
  }, [opacity]);

  const manuallyShow = useCallback((nextIndex: number) => {
    pauseTemporarily();
    showIndex(nextIndex);
  }, [pauseTemporarily, showIndex]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      sources.length > 1 && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => pauseTemporarily(),
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 42) return;
      manuallyShow(indexRef.current + (gesture.dx < 0 ? 1 : -1));
    },
    onPanResponderTerminate: () => pauseTemporarily(),
  }), [manuallyShow, pauseTemporarily, sources.length]);

  const currentSource = failed.has(index) && fallbackImage ? fallbackImage : sources[index];

  return (
    <Pressable
      onPress={(event) => {
        if (Platform.OS !== "web" || sources.length < 2) return;
        const pageX = event.nativeEvent.pageX;
        manuallyShow(indexRef.current + (pageX >= width / 2 ? 1 : -1));
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
      style={[styles.root, { height: heroHeight }]}
      {...panResponder.panHandlers}
    >
      {currentSource ? (
        <Animated.Image
          source={currentSource}
          defaultSource={fallbackImage}
          resizeMode="cover"
          accessibilityLabel={`${vendorName} gallery image ${index + 1}`}
          onError={() => setFailed((current) => new Set(current).add(index))}
          style={[styles.image, { opacity }]}
        />
      ) : null}

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

    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: "#E8DCE1",
  },
  image: { width: "100%", height: "100%" },
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
  counterText: { color: "#FFFFFF", fontSize: 12, lineHeight: 16, fontWeight: "700" },
});
