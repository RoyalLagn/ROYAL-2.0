import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  type ImageProps,
  type ImageURISource,
} from "react-native";
import {
  remoteImageUri,
  resolveImageSource,
  retryImageUri,
  type SafeImageCandidate,
} from "@/utils/imageResolver";

type SafeImageProps = Omit<ImageProps, "source" | "defaultSource"> & {
  source: SafeImageCandidate;
  fallbackSource: number | ImageURISource;
  debugLabel?: string;
  retryCount?: number;
};

function SafeImage({
  source,
  fallbackSource,
  debugLabel = "image",
  retryCount = 1,
  onError,
  onLoad,
  ...props
}: SafeImageProps) {
  const remoteUri = remoteImageUri(source);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [remoteUri]);

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
      }
      onError?.(event);
    },
    [debugLabel, remoteUri, attempt, retryCount, onError],
  );

  return (
    <Image
      {...props}
      source={resolvedSource}
      defaultSource={fallbackSource}
      onLoad={onLoad}
      onError={handleError}
    />
  );
}

export default React.memo(SafeImage);
