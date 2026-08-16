import { BlurView } from "expo-blur";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { MotionDuration, MotionEasing, MotionTiming } from "@/utils/motion";
import { brandPalette } from "@/constants/brandPalette";

const LOADER_SOURCE = require("../../assets/logos/loader.png");
const IMAGE_ASPECT_RATIO = 1243 / 1265;
const MIN_VISIBLE_MS = 700;
const DOT_COUNT = 3;
const DOT_STAGGER_MS = 150;
const DOT_RISE_MS = 200;
const DOT_SETTLE_MS = 240;
const DOT_IDLE_MS = MotionDuration.loop - DOT_RISE_MS - DOT_SETTLE_MS;

type LoaderRegistration = () => () => void;

const PageLoaderContext = createContext<LoaderRegistration | null>(null);

function LoaderDot({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      index * DOT_STAGGER_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_RISE_MS, easing: MotionEasing.soft }),
          withTiming(0, { duration: DOT_SETTLE_MS, easing: MotionEasing.soft }),
          withTiming(0, { duration: DOT_IDLE_MS }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [index, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0.42 + progress.value * 0.38 : 0.34 + progress.value * 0.66,
    transform: reducedMotion
      ? [{ translateY: 0 }, { scale: 1 }]
      : [{ translateY: progress.value * -2 }, { scale: 0.94 + progress.value * 0.06 }],
  }));

  return <Animated.View testID={`page-loader-dot-${index}`} style={[styles.dot, animatedStyle]} />;
}

/**
 * App-level host for every full-page loader request. It keeps the currently
 * rendered route mounted behind one blocking, safe-area-covering overlay and
 * owns the minimum-visible and exit timing so individual screens never need
 * duplicate timers or presentation logic.
 */
export function PageLoaderProvider({
  children,
  suppressed = false,
}: React.PropsWithChildren<{ suppressed?: boolean }>) {
  const [activeLoaders, setActiveLoaders] = useState(0);
  const [presented, setPresented] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const shownAt = useRef(0);
  const activeLoadersRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  activeLoadersRef.current = activeLoaders;

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const register = useCallback<LoaderRegistration>(() => {
    let registered = true;
    setActiveLoaders((count) => count + 1);

    return () => {
      if (!registered) return;
      registered = false;
      setActiveLoaders((count) => Math.max(0, count - 1));
    };
  }, []);

  useEffect(() => {
    if (suppressed) {
      clearHideTimer();
      setPresented(false);
      setExitRequested(false);
      return;
    }

    if (activeLoaders > 0) {
      clearHideTimer();
      setExitRequested(false);
      if (!presented) {
        shownAt.current = Date.now();
        setPresented(true);
      }
      return;
    }

    if (!presented) return;

    // The 200ms opacity exit is part of the 700ms minimum rather than added
    // after it, keeping fast operations polished without making them feel slow.
    const remaining = Math.max(
      0,
      MIN_VISIBLE_MS - MotionDuration.fast - (Date.now() - shownAt.current),
    );
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setExitRequested(true);
    }, remaining);
  }, [activeLoaders, clearHideTimer, presented, suppressed]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const contextValue = useMemo(() => register, [register]);
  const finishExit = useCallback(() => {
    if (activeLoadersRef.current > 0) {
      setExitRequested(false);
      return;
    }
    setPresented(false);
    setExitRequested(false);
  }, []);

  return (
    <PageLoaderContext.Provider value={contextValue}>
      {children}
      {presented && !suppressed ? (
        <Modal
          animationType="none"
          hardwareAccelerated
          navigationBarTranslucent
          onRequestClose={() => undefined}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          transparent
          visible
        >
          <OverlayLifecycle exitRequested={exitRequested} onExited={finishExit} />
        </Modal>
      ) : null}
    </PageLoaderContext.Provider>
  );
}

function OverlayLifecycle({
  exitRequested,
  onExited,
}: {
  exitRequested: boolean;
  onExited: () => void;
}) {
  const opacity = useSharedValue(0);
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const reducedMotion = useReducedMotion();
  const imageWidth = Math.min(176, Math.max(112, width * 0.32));
  const isDark = colorScheme === "dark";

  useEffect(() => {
    cancelAnimation(opacity);
    opacity.value = withTiming(exitRequested ? 0 : 1, MotionTiming.fast, (finished) => {
      if (finished && exitRequested) runOnJS(onExited)();
    });
    return () => cancelAnimation(opacity);
  }, [exitRequested, onExited, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID="page-loader"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading RoyalLagn"
      accessibilityViewIsModal
      style={[styles.overlay, animatedStyle]}
    >
      <BlurView
        intensity={isDark ? 18 : 22}
        tint={isDark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
        experimentalBlurMethod="none"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.nonInteractive,
          { backgroundColor: isDark ? "rgba(7, 11, 20, 0.24)" : "rgba(255, 255, 255, 0.28)" },
        ]}
      />
      <View style={[styles.content, styles.nonInteractive]}>
        <Image
          accessibilityIgnoresInvertColors
          source={LOADER_SOURCE}
          resizeMode="contain"
          style={{ width: imageWidth, height: imageWidth / IMAGE_ASPECT_RATIO }}
        />
        <View aria-hidden style={styles.dots}>
          {Array.from({ length: DOT_COUNT }).map((_, index) => (
            <LoaderDot key={index} index={index} reducedMotion={reducedMotion} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * Declarative loading request. The provider keeps the overlay alive for the
 * shared minimum duration and fade after this trigger unmounts.
 */
export default function PageLoader() {
  const register = useContext(PageLoaderContext);

  useLayoutEffect(() => register?.(), [register]);

  if (!register && process.env.NODE_ENV !== "production") {
    console.warn("PageLoader must be rendered inside PageLoaderProvider.");
  }

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: Platform.OS === "android" ? 24 : 0,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -8 }],
  },
  nonInteractive: { pointerEvents: "none" },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 10,
    marginTop: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: brandPalette.light.primary,
  },
});
