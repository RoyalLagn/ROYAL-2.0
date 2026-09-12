import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { captureRef } from "react-native-view-shot";
import { Check, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";
import { PROFILE_IMAGE_SIZE, type ProfileImageAsset } from "@/services/media";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

type Offset = { x: number; y: number };

type Props = {
  asset: ProfileImageAsset | null;
  busy?: boolean;
  kind?: "logo" | "profile";
  onCancel: () => void;
  onSave: (asset: ProfileImageAsset) => void | Promise<void>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[1].pageX - touches[0].pageX, touches[1].pageY - touches[0].pageY);
}

type WebSquareRender = {
  uri: string;
  release: () => void;
};

async function renderWebSquare({
  uri,
  frameSize,
  renderedWidth,
  renderedHeight,
  offset,
}: {
  uri: string;
  frameSize: number;
  renderedWidth: number;
  renderedHeight: number;
  offset: Offset;
}): Promise<WebSquareRender> {
  // Yield immediately so the click completes before image decoding begins.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const image = document.createElement("img");
  image.decoding = "async";
  if (/^https?:/i.test(uri)) image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Image decoding timed out.")), 6000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("The selected image could not be decoded."));
    };
    image.src = uri;
  });

  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_IMAGE_SIZE;
  canvas.height = PROFILE_IMAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");

  const outputScale = PROFILE_IMAGE_SIZE / frameSize;
  context.fillStyle = brandPalette.light.background;
  context.fillRect(0, 0, PROFILE_IMAGE_SIZE, PROFILE_IMAGE_SIZE);
  context.drawImage(
    image,
    ((frameSize - renderedWidth) / 2 + offset.x) * outputScale,
    ((frameSize - renderedHeight) / 2 + offset.y) * outputScale,
    renderedWidth * outputScale,
    renderedHeight * outputScale,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("The square image could not be encoded."));
    }, "image/png");
  });
  const outputUri = URL.createObjectURL(blob);
  return { uri: outputUri, release: () => URL.revokeObjectURL(outputUri) };
}

export default function SquareImageEditor({ asset, busy = false, kind = "logo", onCancel, onSave }: Props) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const frameSize = Math.min(width - 40, 360);
  const [uri, setUri] = useState("");
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const panStart = useRef<Offset>({ x: 0, y: 0 });
  const zoomStart = useRef(MIN_ZOOM);
  const pinchStartDistance = useRef(0);
  const offsetRef = useRef<Offset>({ x: 0, y: 0 });
  const zoomRef = useRef(MIN_ZOOM);
  const canvasRef = useRef<View>(null);
  const noun = kind === "logo" ? "logo" : "profile photo";

  useEffect(() => {
    if (!asset) return;
    setUri(asset.uri);
    setImageSize({ width: Math.max(1, asset.width), height: Math.max(1, asset.height) });
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, [asset]);

  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Start with the complete source visible. The user may then zoom into a
  // crop, but nothing is discarded automatically on first open.
  const baseScale = Math.min(frameSize / imageSize.width, frameSize / imageSize.height);
  const renderedWidth = imageSize.width * baseScale * zoom;
  const renderedHeight = imageSize.height * baseScale * zoom;
  const limitsForZoom = useCallback((nextZoom: number) => {
    const nextWidth = imageSize.width * baseScale * nextZoom;
    const nextHeight = imageSize.height * baseScale * nextZoom;
    return {
      // When the image is smaller than the frame, it can move within the
      // available whitespace without being clipped. Once larger, movement
      // exposes every possible crop while keeping the frame covered.
      x: Math.abs(nextWidth - frameSize) / 2,
      y: Math.abs(nextHeight - frameSize) / 2,
    };
  }, [baseScale, frameSize, imageSize.height, imageSize.width]);
  const applyOffset = useCallback((next: Offset, nextZoom = zoomRef.current) => {
    const nextLimits = limitsForZoom(nextZoom);
    const clamped = {
      x: clamp(next.x, -nextLimits.x, nextLimits.x),
      y: clamp(next.y, -nextLimits.y, nextLimits.y),
    };
    offsetRef.current = clamped;
    setOffset(clamped);
  }, [limitsForZoom]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !busy && !processing,
    onMoveShouldSetPanResponder: (event, gesture) => event.nativeEvent.touches.length >= 2 || Math.abs(gesture.dx) + Math.abs(gesture.dy) > 2,
    onPanResponderGrant: (event) => {
      panStart.current = offsetRef.current;
      zoomStart.current = zoomRef.current;
      pinchStartDistance.current = touchDistance(event.nativeEvent.touches);
    },
    onPanResponderMove: (event, gesture) => {
      if (event.nativeEvent.touches.length >= 2) {
        const distance = touchDistance(event.nativeEvent.touches);
        if (!pinchStartDistance.current) pinchStartDistance.current = distance;
        const nextZoom = clamp(zoomStart.current * (distance / Math.max(1, pinchStartDistance.current)), MIN_ZOOM, MAX_ZOOM);
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        applyOffset(offsetRef.current, nextZoom);
        return;
      }
      applyOffset({
        x: panStart.current.x + gesture.dx,
        y: panStart.current.y + gesture.dy,
      });
    },
    onPanResponderRelease: () => { pinchStartDistance.current = 0; },
    onPanResponderTerminate: () => { pinchStartDistance.current = 0; },
  }), [applyOffset, busy, processing]);

  const changeZoom = (next: number) => {
    const normalized = clamp(next, MIN_ZOOM, MAX_ZOOM);
    zoomRef.current = normalized;
    setZoom(normalized);
    applyOffset(offsetRef.current, normalized);
  };

  const rotate = async (degrees: -90 | 90) => {
    if (!uri || processing || busy) return;
    setProcessing(true);
    try {
      const result = await manipulateAsync(uri, [{ rotate: degrees }], {
        compress: 1,
        format: SaveFormat.PNG,
      });
      setUri(result.uri);
      setImageSize({ width: result.width, height: result.height });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    } catch {
      Alert.alert(`Couldn’t rotate ${noun}`, "Try the rotation again or choose another image.");
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    if (!asset || processing || busy) return;
    setUri(asset.uri);
    setImageSize({ width: Math.max(1, asset.width), height: Math.max(1, asset.height) });
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  const save = async () => {
    if (!asset || !uri || !canvasRef.current || processing || busy) return;
    setProcessing(true);
    let releaseOutput: (() => void) | undefined;
    try {
      // Web renders the same preview geometry directly to canvas. DOM capture
      // was both slow and unreliable for local/uploaded image URLs.
      let resultUri: string;
      if (Platform.OS === "web") {
        const result = await renderWebSquare({ uri, frameSize, renderedWidth, renderedHeight, offset });
        resultUri = result.uri;
        releaseOutput = result.release;
      } else {
        // Native capture preserves the exact visible square, including
        // deliberate whitespace around a fitted logo.
        resultUri = await captureRef(canvasRef, {
          format: "png",
          quality: 1,
          width: PROFILE_IMAGE_SIZE,
          height: PROFILE_IMAGE_SIZE,
          result: "tmpfile",
        });
      }
      await onSave({
        uri: resultUri,
        width: PROFILE_IMAGE_SIZE,
        height: PROFILE_IMAGE_SIZE,
        fileName: `${kind === "logo" ? "vendor-logo" : "profile-photo"}-${Date.now()}.png`,
        mimeType: "image/png",
      });
    } catch (error) {
      if (__DEV__) console.warn(`[SquareImageEditor] Couldn’t prepare ${noun}:`, error);
      Alert.alert(`Couldn’t prepare ${noun}`, "The image could not be processed. Try another JPG, PNG or WebP image.");
    } finally {
      releaseOutput?.();
      setProcessing(false);
    }
  };

  const unavailable = busy || processing;

  return (
    <Modal visible={Boolean(asset)} animationType="slide" onRequestClose={() => { if (!unavailable) onCancel(); }}>
      <SafeAreaView style={[styles.page, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cancel ${noun} editing`}
            disabled={unavailable}
            onPress={onCancel}
            style={[styles.iconButton, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
          >
            <X size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Adjust your {noun}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Drag or pinch to adjust · saved at 1024 × 1024</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.stage}>
          <View
            {...panResponder.panHandlers}
            style={[styles.cropFrame, { width: frameSize, height: frameSize, backgroundColor: colors.surfaceSoft, borderColor: colors.pink }]}
          >
            <View ref={canvasRef} collapsable={false} style={[styles.captureCanvas, { width: frameSize, height: frameSize }]}>
              {uri ? (
                <Image
                  source={{ uri }}
                  resizeMode="contain"
                  style={{
                    position: "absolute",
                    width: renderedWidth,
                    height: renderedHeight,
                    left: (frameSize - renderedWidth) / 2 + offset.x,
                    top: (frameSize - renderedHeight) / 2 + offset.y,
                  }}
                />
              ) : null}
            </View>
            <View pointerEvents="none" style={styles.cropGuide}>
              <View style={[styles.guideVertical, styles.guideVerticalOne]} />
              <View style={[styles.guideVertical, styles.guideVerticalTwo]} />
              <View style={[styles.guideHorizontal, styles.guideHorizontalOne]} />
              <View style={[styles.guideHorizontal, styles.guideHorizontalTwo]} />
            </View>
            {processing ? <View style={styles.processing}><ActivityIndicator color="#FFFFFF" /></View> : null}
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>The full image starts visible. Position and scale it until this square shows exactly what you want saved.</Text>
        </View>

        <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <EditorAction label="Rotate left" disabled={unavailable} onPress={() => void rotate(-90)} icon={<RotateCcw size={19} color={colors.text} />} />
          <EditorAction label="Zoom out" disabled={unavailable || zoom <= MIN_ZOOM} onPress={() => changeZoom(zoom - 0.2)} icon={<ZoomOut size={19} color={colors.text} />} />
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${kind === "logo" ? "Logo" : "Profile photo"} zoom`}
            accessibilityValue={{ min: 100, max: 500, now: Math.round(zoom * 100) }}
            style={styles.zoomTrack}
          >
            <View style={[styles.zoomFill, { width: `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%`, backgroundColor: colors.pink }]} />
          </View>
          <EditorAction label="Zoom in" disabled={unavailable || zoom >= MAX_ZOOM} onPress={() => changeZoom(zoom + 0.2)} icon={<ZoomIn size={19} color={colors.text} />} />
          <EditorAction label="Rotate right" disabled={unavailable} onPress={() => void rotate(90)} icon={<RotateCw size={19} color={colors.text} />} />
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={unavailable}
            onPress={reset}
            style={[styles.secondary, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Reset</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Save square ${noun}`}
            disabled={unavailable}
            onPress={() => void save()}
            style={[styles.primary, { backgroundColor: colors.pink }, unavailable && styles.disabled]}
          >
            {unavailable ? <ActivityIndicator color="#FFFFFF" /> : <Check size={18} color="#FFFFFF" />}
            <Text style={styles.primaryText}>{busy ? "Uploading…" : processing ? "Preparing…" : `Use this ${kind === "logo" ? "logo" : "photo"}`}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function EditorAction({ label, disabled, onPress, icon }: { label: string; disabled: boolean; onPress: () => void; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.toolButton, disabled && styles.disabled]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center" },
  headerSpacer: { width: 44 },
  title: { ...typeStyles.cardTitle, textAlign: "center" },
  subtitle: { ...typeStyles.caption, textAlign: "center", marginTop: 2 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  cropFrame: { overflow: "hidden", borderWidth: 2, borderRadius: 24 },
  captureCanvas: { overflow: "hidden", backgroundColor: brandPalette.light.background },
  cropGuide: { ...StyleSheet.absoluteFillObject },
  guideVertical: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,.46)" },
  guideHorizontal: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,.46)" },
  guideVerticalOne: { left: "33.333%" },
  guideVerticalTwo: { left: "66.666%" },
  guideHorizontalOne: { top: "33.333%" },
  guideHorizontalTwo: { top: "66.666%" },
  processing: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: brandPalette.light.overlayInk },
  hint: { ...typeStyles.metadata, maxWidth: 360, textAlign: "center", marginTop: 14 },
  toolbar: { minHeight: 64, marginHorizontal: 16, paddingHorizontal: 10, borderWidth: 1, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  toolButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  zoomTrack: { flex: 1, height: 4, borderRadius: 999, backgroundColor: "rgba(120,105,112,.22)", overflow: "hidden" },
  zoomFill: { height: "100%", borderRadius: 999 },
  actions: { padding: 16, flexDirection: "row", gap: 10 },
  secondary: { minWidth: 104, minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  secondaryText: { ...typeStyles.button },
  primary: { flex: 1, minHeight: 48, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryText: { color: "#FFFFFF", ...typeStyles.button },
  disabled: { opacity: 0.46 },
});
