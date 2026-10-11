import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export default function PortfolioVideoPlayer({ uri }: { uri: string }) {
  const bunnyVideoId = uri.match(/\.b-cdn\.net\/([^/]+)\/playlist\.m3u8/i)?.[1];
  const bunnyLibraryId = process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID?.trim();

  if (Platform.OS === "web") {
    if (bunnyVideoId && bunnyLibraryId) {
      return React.createElement("iframe" as any, {
        src: `https://player.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}?autoplay=false&preload=true&responsive=true`,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        allowFullScreen: true,
        style: styles.webPlayer,
      });
    }
    return React.createElement("video" as any, {
      src: uri,
      controls: true,
      playsInline: true,
      preload: "metadata",
      style: styles.webVideo,
    });
  }

  return <NativePortfolioVideo uri={uri} />;
}

function NativePortfolioVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", height: "100%" },
  webPlayer: { width: "100%", height: "100%", borderWidth: 0 } as any,
  webVideo: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" } as any,
});
