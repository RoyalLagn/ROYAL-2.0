import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  type ImageProps,
  type ImageURISource,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  remoteImageUri,
  resolveImageSource,
  retryImageUri,
  type SafeImageCandidate,
} from "@/utils/imageResolver";

const AnimatedImage = Animated.createAnimatedComponent(Image);

type SafeImageProps = Omit<ImageProps, "source" | "defaultSource"> & {
  source: SafeImageCandidate;
  fallbackSource: number | ImageURISource;
  debugLabel?: string;
  retryCount?: number;
  /** Set false to skip the fade-in (e.g. an image that must appear
   *  instantly, like a live camera preview thumbnail). Defaults to true. */
  fadeIn?: boolean;
};

function SafeImage({
  source,
  fallbackSource,
  debugLabel = "image",
  retryCount = 1,
  fadeIn = true,
  onError,
  onLoad,
  style,
  ...props
}: SafeImageProps) {
  const remoteUri = remoteImageUri(source);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  // Remote images fade in on load (prevents the white-flash/pop-in of a
  // Cloudinary asset arriving over the network); bundled local assets
  // resolve synchronously so there is nothing to fade.
  const opacity = useSharedValue(remoteUri && fadeIn ? 0 : 1);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    if (remoteUri && fadeIn) {
      opacity.value = reducedMotion ? 1 : 0;
    }
  }, [fadeIn, opacity, reducedMotion, remoteUri]);

  const resolvedSource = remoteUri
    ? !failed
      ? { uri: retryImageUri(remoteUri, attempt) }
      : fallbackSource
    : resolveImageSource(source, fallbackSource);

  const handleError = useCallback(
    (event: Parameters<NonNullable<ImageProps["onError"]>>[0]) => {
      if (__DEV__) {
        console.warn(
          `[SafeImage] Failed to render ${debugLabel}:`,
          event.nativeEvent.error,
        );
      }
      if (remoteUri && attempt < retryCount) {
        setAttempt((current) => current + 1);
      } else {
        setFailed(true);
        // A fallback image should still appear, not stay invisible because
        // the network image never finished loading.
        opacity.value = reducedMotion ? 1 : withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
      onError?.(event);
    },
    [attempt, debugLabel, onError, opacity, reducedMotion, remoteUri, retryCount],
  );

  const handleLoad = useCallback(
    (event: Parameters<NonNullable<ImageProps["onLoad"]>>[0]) => {
      opacity.value = reducedMotion ? 1 : withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      onLoad?.(event);
    },
    [onLoad, opacity, reducedMotion],
  );

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <AnimatedImage
      {...props}
      source={resolvedSource}
      defaultSource={fallbackSource}
      onLoad={handleLoad}
      onError={handleError}
      style={[style, animatedStyle]}
    />
  );
}

export default React.memo(SafeImage);
