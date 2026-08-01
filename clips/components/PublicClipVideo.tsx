import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Heart, Play, RefreshCw, Volume2, VolumeX } from "lucide-react-native";

const DOUBLE_TAP_MS = 260;

export const PublicClipVideo = React.memo(function PublicClipVideo({
  uri, thumbnailUrl, sourceWidth, sourceHeight, active, muted, onToggleMuted, onDoubleTapLike,
  onHoldChange, showMuteControl = true,
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
  const source = React.useMemo(() => ({
    uri,
    useCaching: Platform.OS !== "web",
  }), [uri]);
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
    player.muted = muted || !active;
  }, [active, muted, player]);
  useEffect(() => {
    if (!active) {
      player.pause();
      setManuallyPaused(false);
      return;
    }
    if (!manuallyPaused) player.play();
  }, [active, manuallyPaused, player]);
  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (holdReleaseTimer.current) clearTimeout(holdReleaseTimer.current);
    onHoldChange?.(false);
  }, [onHoldChange]);

  const showPauseState = useCallback((paused: boolean) => {
    playOpacity.value = withTiming(paused ? 1 : 0, { duration: reduced ? 0 : 180 });
    playScale.value = paused ? withSpring(1) : withTiming(0.86, { duration: reduced ? 0 : 180 });
  }, [playOpacity, playScale, reduced]);

  const togglePlayback = useCallback(() => {
    if (!active) return;
    setManuallyPaused((current) => {
      const next = !current;
      if (next) player.pause();
      else player.play();
      showPauseState(next);
      return next;
    });
  }, [active, player, showPauseState]);

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
  const failed = status?.status === "error";

  return <View style={StyleSheet.absoluteFill}>
    <Image source={{ uri: thumbnailUrl }} style={styles.mediaFill} resizeMode={contentFit} />
    {!failed && <Animated.View pointerEvents="none" style={[styles.mediaFill, videoStyle]}>
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
    {failed && <View style={styles.center}><Text style={styles.errorTitle}>This Clip couldn&apos;t play</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={() => { player.replace(uri); player.play(); }} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View>}
    <Animated.View pointerEvents="none" style={[styles.playBurst, playStyle]}><Play size={44} color="#FFF" fill="#FFF" /></Animated.View>
    <Animated.View pointerEvents="none" style={[styles.heartBurst, heartStyle]}><Heart size={94} color="#FFF" fill="#E91E63" strokeWidth={1.5} /></Animated.View>
    {showMuteControl && manuallyPaused ? <Pressable
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
});
