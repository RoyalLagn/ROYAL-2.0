import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
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
import { mediaDeliveryUrl } from "@/utils/mediaDelivery";

const AnimatedImage = Animated.createAnimatedComponent(Image);

type SafeImageProps = Omit<ImageProps, "source" | "defaultSource"> & {
  source: SafeImageCandidate;
  fallbackSource: number | ImageURISource;
  debugLabel?: string;
  retryCount?: number;
  /** Set false to skip the fade-in. Defaults to true. */
  fadeIn?: boolean;
  /** Preferred delivery width (CSS px). */
  deliveryWidth?: number;
  deliveryHeight?: number;
  /** Fit mode used by the rendered image container. */
  deliveryCrop?: "fill" | "limit" | "fit";
  /** Web: lazy-load below-the-fold images. Defaults to true. */
  lazy?: boolean;
};

function SafeImage({
  source,
  fallbackSource,
  debugLabel = "image",
  retryCount = 1,
  fadeIn = true,
  deliveryWidth,
  deliveryHeight,
  deliveryCrop = "fill",
  lazy = true,
  onError,
  onLoad,
  style,
  ...props
}: SafeImageProps) {
  const rawRemoteUri = remoteImageUri(source);
  const remoteUri = useMemo(() => {
    if (!rawRemoteUri) return rawRemoteUri;
    if (!deliveryWidth && !deliveryHeight) return rawRemoteUri;
    return mediaDeliveryUrl(rawRemoteUri, {
      width: deliveryWidth,
      height: deliveryHeight,
      crop: deliveryCrop,
      dpr: 2,
      quality: "auto:good",
      format: "auto",
    });
  }, [deliveryCrop, deliveryHeight, deliveryWidth, rawRemoteUri]);

  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion();

  // Remote images fade in on load; bundled local assets resolve synchronously
  const opacity = useSharedValue(remoteUri && fadeIn ? 0 : 1);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    if (remoteUri && fadeIn && !reducedMotion) {
      opacity.value = 0;
    } else {
      opacity.value = 1;
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
        // Ensure fallback is immediately visible — NEVER leave opacity at 0
        opacity.value = 1;
      }
      onError?.(event);
    },
    [attempt, debugLabel, onError, opacity, remoteUri, retryCount],
  );

  const handleLoad = useCallback(
    (event: Parameters<NonNullable<ImageProps["onLoad"]>>[0]) => {
      if (fadeIn && !reducedMotion) {
        opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      } else {
        opacity.value = 1;
      }
      onLoad?.(event);
    },
    [fadeIn, onLoad, opacity, reducedMotion],
  );

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <AnimatedImage
      {...props}
      source={resolvedSource}
      defaultSource={fallbackSource}
      onLoad={handleLoad}
      onError={handleError}
      // @ts-expect-error — RN Web supports loading="lazy"
      loading={Platform.OS === "web" && lazy ? "lazy" : undefined}
      alt={Platform.OS === "web" && typeof props.accessibilityLabel === "string" ? props.accessibilityLabel : undefined}
      style={[style, animatedStyle]}
    />
  );
}

export default React.memo(SafeImage);
