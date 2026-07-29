import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Heart, Play, RefreshCw, Volume2, VolumeX } from "lucide-react-native";

const DOUBLE_TAP_MS = 260;

export const PublicClipVideo = React.memo(function PublicClipVideo({
  uri, thumbnailUrl, active, muted, onToggleMuted, onDoubleTapLike,
}: {
  uri: string;
  thumbnailUrl: string;
  active: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onDoubleTapLike: () => void;
}) {
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [firstFrameRendered, setFirstFrameRendered] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const longPressed = useRef(false);
  const reduced = useReducedMotion();
  const playOpacity = useSharedValue(0);
  const playScale = useSharedValue(0.82);
  const heartOpacity = useSharedValue(0);
  const heartScale = useSharedValue(0.45);
  const videoOpacity = useSharedValue(0);
  const source = React.useMemo(() => ({
    uri,
    useCaching: Platform.OS !== "web",
  }), [uri]);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.bufferOptions = {
      preferredForwardBufferDuration: 6,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 1,
      maxBufferBytes: 14 * 1024 * 1024,
    };
  });
  const status = useEvent(player, "statusChange", { status: player.status });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (!active) {
      player.pause();
      setManuallyPaused(false);
      return;
    }
    if (!manuallyPaused) player.play();
    return () => player.pause();
  }, [active, manuallyPaused, player]);
  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

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
  const loading = !firstFrameRendered && !failed;

  return <View style={StyleSheet.absoluteFill}>
    <Image source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
    {!failed && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, videoStyle]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        playsInline
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
      delayLongPress={420}
      onLongPress={() => {
        longPressed.current = true;
        onToggleMuted();
      }}
      style={StyleSheet.absoluteFill}
    />
    {active && loading && <View pointerEvents="none" style={styles.center}><ActivityIndicator color="#FFFFFF" size="large" /><Text style={styles.loading}>Preparing inspiration…</Text></View>}
    {failed && <View style={styles.center}><Text style={styles.errorTitle}>This Clip couldn&apos;t play</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry video" onPress={() => { player.replace(uri); player.play(); }} style={styles.retry}><RefreshCw size={17} color="#FFF" /><Text style={styles.retryText}>Retry</Text></Pressable></View>}
    <Animated.View pointerEvents="none" style={[styles.playBurst, playStyle]}><Play size={44} color="#FFF" fill="#FFF" /></Animated.View>
    <Animated.View pointerEvents="none" style={[styles.heartBurst, heartStyle]}><Heart size={94} color="#FFF" fill="#E91E63" strokeWidth={1.5} /></Animated.View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={muted ? "Turn Clip sound on" : "Mute Clip"}
      onPress={onToggleMuted}
      style={styles.muteState}
    >
      {muted ? <VolumeX size={14} color="#FFF" /> : <Volume2 size={14} color="#FFF" />}
      <Text style={styles.muteText}>{muted ? "Tap for sound" : "Sound on"}</Text>
    </Pressable>
  </View>;
});

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,7,9,.48)", alignItems: "center", justifyContent: "center", gap: 10 },
  loading: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  errorTitle: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  retry: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(233,30,99,.9)" },
  retryText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  playBurst: { position: "absolute", alignSelf: "center", top: "43%", width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", paddingLeft: 5, backgroundColor: "rgba(8,5,7,.58)", borderWidth: 1, borderColor: "rgba(255,255,255,.25)" },
  heartBurst: { position: "absolute", alignSelf: "center", top: "38%" },
  muteState: { position: "absolute", top: 154, right: 14, height: 28, borderRadius: 14, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(8,5,7,.48)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.2)" },
  muteText: { color: "#FFF", fontSize: 9, fontWeight: "700" },
});
