import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

export default function PortfolioVideoPlayer({ uri }: { uri: string }) {
  if (Platform.OS === "web") {
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
  webVideo: { width: "100%", height: "100%", objectFit: "contain", backgroundColor: "#000" } as any,
});
