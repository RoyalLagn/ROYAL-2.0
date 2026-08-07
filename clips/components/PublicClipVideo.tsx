import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Heart, Play, RefreshCw, TriangleAlert, Volume2, VolumeX } from "lucide-react-native";
import { cloudinaryDeliveryUrl, cloudinaryVideoDeliveryUrl } from "@/utils/cloudinaryDelivery";
import { CLIP_VIDEO_DELIVERY } from "../constants";

const DOUBLE_TAP_MS = 260;
const VALID_URI = /^https?:\/\//i;

export const PublicClipVideo = React.memo(function PublicClipVideo({
  uri, thumbnailUrl, sourceWidth, sourceHeight, active, muted, onToggleMuted, onDoubleTapLike,
  onHoldChange, showMuteControl = true, width, height,
}: {
  uri: string;
  thumbnailUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  active: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onDoubleTapLike: () => void;
  onHoldChange?: (holding: boolean) => void;
  showMuteControl?: boolean;
  /** Rendered pixel size — used to request a device-appropriate Cloudinary derivative. */
  width?: number;
  height?: number;
}) {
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const longPressed = useRef(false);
  const holdReleaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();
  const playOpacity = useSharedValue(0);
  const playScale = useSharedValue(0.82);
  const heartOpacity = useSharedValue(0);
  const heartScale = useSharedValue(0.45);
  const videoOpacity = useSharedValue(0);
  const sourceAspectRatio = sourceWidth > 0 && sourceHeight > 0
    ? sourceWidth / sourceHeight
    : 9 / 16;
  const isReelAspectRatio = sourceAspectRatio >= 0.46 && sourceAspectRatio <= 0.72;
  const contentFit = isReelAspectRatio ? "cover" : "contain";

  const hasValidSource = typeof uri === "string" && VALID_URI.test(uri.trim());

  // Fixed bucket, deliberately NOT derived from the rendered width/DPR —
  // see CLIP_VIDEO_DELIVERY. Every viewer requesting the same transformation
  // string is what lets Cloudinary's derivative cache actually help.
  const deliveryUri = useMemo(() => {
    if (!hasValidSource) return null;
    return cloudinaryVideoDeliveryUrl(uri, {
      width: CLIP_VIDEO_DELIVERY.width,
      height: CLIP_VIDEO_DELIVERY.height,
      crop: "limit",
      quality: Platform.OS === "web"
        ? CLIP_VIDEO_DELIVERY.webQuality as any
        : CLIP_VIDEO_DELIVERY.nativeQuality as any,
    });
  }, [hasValidSource, uri]);

  const posterUri = useMemo(() => {
    if (!thumbnailUrl) return thumbnailUrl;
    const dpr = Math.min(2, Math.max(1, PixelRatio.get()));
    return cloudinaryDeliveryUrl(thumbnailUrl, {
      width: width && width > 0 ? width : undefined,
      height: height && height > 0 ? height : undefined,
      crop: "fill",
      dpr,
      quality: "auto",
    });
  }, [thumbnailUrl, width, height]);

  const source = useMemo(() => (
    deliveryUri ? { uri: deliveryUri, useCaching: Platform.OS !== "web" } : null
  ), [deliveryUri]);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = muted || !active;
    instance.bufferOptions = {
      preferredForwardBufferDuration: 6,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 1,
      maxBufferBytes: 14 * 1024 * 1024,
    };
  });
  const status = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    if (!hasValidSource) return;
    player.muted = muted || !active;
  }, [active, hasValidSource, muted, player]);
  useEffect(() => {
    if (!hasValidSource) return;
    if (!active) {
      player.pause();
      setManuallyPaused(false);
      return;
    }
    if (!manuallyPaused) player.play();
  }, [active, hasValidSource, manuallyPaused, player]);
  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (holdReleaseTimer.current) clearTimeout(holdReleaseTimer.current);
    onHoldChange?.(false);
    // Stop playback immediately — the underlying player is released
    // asynchronously by useVideoPlayer's useReleasingSharedObject, but audio
    // must stop the instant this card leaves the viewport/unmounts.
    try {
      player.pause();
    } catch {
      // Player may already be torn down.
    }
  }, [onHoldChange, player]);

  const showPauseState = useCallback((paused: boolean) => {
    playOpacity.value = withTiming(paused ? 1 : 0, { duration: reduced ? 0 : 180 });
    playScale.value = paused ? withSpring(1) : withTiming(0.86, { duration: reduced ? 0 : 180 });
  }, [playOpacity, playScale, reduced]);

  const togglePlayback = useCallback(() => {
    if (!active || !hasValidSource) return;
    setManuallyPaused((current) => {
      const next = !current;
      if (next) player.pause();
      else player.play();
      showPauseState(next);
      return next;
    });
  }, [active, hasValidSource, player, showPauseState]);

  const burstHeart = useCallback(() => {
    if (reduced) {
      heartOpacity.value = withSequence(withTiming(1), withTiming(0, { duration: 220 }));
      return;
    }
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 70 }),
      withTiming(1, { duration: 300 }),
      withTiming(0, { duration: 220 }),
    );
    heartScale.value = withSequence(withSpring(1.2), withSpring(1), withTiming(0.7));
  }, [heartOpacity, heartScale, reduced]);

  const handleTap = useCallback(() => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      lastTap.current = 0;
      burstHeart();
      onDoubleTapLike();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      togglePlayback();
      tapTimer.current = null;
    }, DOUBLE_TAP_MS);
  }, [burstHeart, onDoubleTapLike, togglePlayback]);

  const playStyle = useAnimatedStyle(() => ({
    opacity: playOpacity.value,
    transform: [{ scale: playScale.value }],
  }));
  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));
  const videoStyle = useAnimatedStyle(() => ({ opacity: videoOpacity.value }));
  const failed = hasValidSource && status?.status === "error";
  const unavailable = !hasValidSource;
  // Distinct from the poster (shown before first frame) — this covers
  // mid-playback stalls too, e.g. the player re-buffering on a slow
  // connection after already having played a few seconds.
  const buffering = hasValidSource && !failed && active && !manuallyPaused
    && status?.status === "loading";

  const retry = useCallback(() => {
    if (!deliveryUri) return;
    player.replace({ uri: deliveryUri }, true);
    player.play();
  }, [deliveryUri, player]);

  return <View style={StyleSheet.absoluteFill}>
    {posterUri ? <Image source={{ uri: posterUri }} style={styles.mediaFill} resizeMode={contentFit} /> : null}
    {!failed && !unavailable && <Animated.View pointerEvents="none" style={[styles.mediaFill, videoStyle]}>
      <VideoView
        player={player}
        style={styles.mediaFill}
        contentFit={contentFit}
        nativeControls={false}
        playsInline
        surfaceType={Platform.OS === "android" ? "textureView" : undefined}
        allowsVideoFrameAnalysis={false}
        onFirstFrameRender={() => {
          if (!firstFrameRendered) setFirstFrameRendered(true);
          videoOpacity.value = withTiming(1, { duration: reduced ? 0 : 140 });
        }}
      />
    </Animated.View>}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={manuallyPaused ? "Resume Clip" : "Pause Clip"}
      onPress={handleTap}
      delayLongPress={260}
      onLongPress={() => {
        longPressed.current = true;
        onHoldChange?.(true);
      }}
      onPressOut={() => {
        if (!longPressed.current) return;
        onHoldChange?.(false);
        if (holdReleaseTimer.current) clearTimeout(holdReleaseTimer.current);
        holdReleaseTimer.current = setTimeout(() => {
          longPressed.current = false;
          holdReleaseTimer.current = null;
        }, 80);
      }}
      style={styles.mediaFill}
    />
    {failed && <View style={styles.center}><Text style={styles.errorTitle}>This Clip couldn&apos;t play</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={retry} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View>}
    {unavailable && <View style={styles.center}><TriangleAlert size={28} color="#FFB0CD" /><Text style={styles.errorTitle}>This Clip is unavailable</Text></View>}
    {buffering && <View pointerEvents="none" style={styles.buffering}><ActivityIndicator size="small" color="#FFFFFF" /></View>}
    <Animated.View pointerEvents="none" style={[styles.playBurst, playStyle]}><Play size={44} color="#FFF" fill="#FFF" /></Animated.View>
    <Animated.View pointerEvents="none" style={[styles.heartBurst, heartStyle]}><Heart size={94} color="#FFF" fill="#E91E63" strokeWidth={1.5} /></Animated.View>
    {showMuteControl && manuallyPaused && !unavailable ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? "Turn Clip sound on" : "Mute Clip"}
      onPress={onToggleMuted}
      style={styles.muteState}
    >
      {muted ? <VolumeX size={17} color="#FFF" /> : <Volume2 size={17} color="#FFF" />}
    </Pressable> : null}
  </View>;
});

const styles = StyleSheet.create({
  mediaFill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  center: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,7,9,.48)", alignItems: "center", justifyContent: "center", gap: 10 },
  errorTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  retry: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(233,30,99,.9)" },
  retryText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  playBurst: { position: "absolute", alignSelf: "center", top: "43%", width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", paddingLeft: 5, backgroundColor: "rgba(8,5,7,.58)", borderWidth: 1, borderColor: "rgba(255,255,255,.25)" },
  heartBurst: { position: "absolute", alignSelf: "center", top: "38%" },
  muteState: { position: "absolute", alignSelf: "center", top: "55%", width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,5,7,.62)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.32)", zIndex: 6 },
  buffering: { position: "absolute", alignSelf: "center", top: "43%", width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,5,7,.4)" },
});
