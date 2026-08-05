import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Check, CircleAlert, RefreshCw, X } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ClipQueueItem } from "../types";
import { MotionDuration, MotionEasing } from "@/utils/motion";

const STAGE_LABEL: Record<string, string> = {
  idle: "Queued",
  validating: "Validating",
  compressing: "Compressing video",
  thumbnail: "Generating thumbnail",
  uploading: "Uploading",
  saving: "Saving",
  complete: "Uploaded",
  failed: "Failed",
};

function ProgressRow({
  item, colors, onRetry, onCancel, onRemove,
}: {
  item: ClipQueueItem;
  colors: any;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const percent = Math.round(item.progress.progress * 100);
  const active = !["completed", "failed", "cancelled"].includes(item.status);
  const failed = item.status === "failed";
  const completed = item.status === "completed";
  const fillWidth = useSharedValue(percent);

  useEffect(() => {
    fillWidth.value = reducedMotion ? percent : withTiming(percent, { duration: MotionDuration.fast, easing: MotionEasing.soft });
  }, [fillWidth, percent, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillWidth.value}%` }));

  const stageLabel = failed
    ? item.error
    : completed
      ? "Uploaded"
      : `${STAGE_LABEL[item.progress.stage] ?? item.status} · ${percent}%`;

  return (
    <View style={[styles.item, { borderTopColor: colors.border }]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{item.draft.title}</Text>
          <Text numberOfLines={1} style={[styles.status, { color: failed ? "#DC2626" : colors.muted }]}>{stageLabel}</Text>
        </View>
        {completed ? (
          <View style={[styles.badge, { backgroundColor: `${colors.success}18` }]}>
            <Check size={15} color={colors.success} />
          </View>
        ) : failed ? (
          <View style={[styles.badge, { backgroundColor: "#DC262618" }]}>
            <CircleAlert size={15} color="#DC2626" />
          </View>
        ) : null}
        {failed && <Pressable accessibilityLabel="Retry upload" onPress={() => onRetry(item.id)} style={styles.action}><RefreshCw size={16} color={colors.pink} /></Pressable>}
        {active && <Pressable accessibilityLabel="Cancel upload" onPress={() => onCancel(item.id)} style={styles.action}><X size={17} color={colors.warning} /></Pressable>}
        {["completed", "cancelled"].includes(item.status) && <Pressable accessibilityLabel="Dismiss" onPress={() => onRemove(item.id)} style={styles.action}><X size={17} color={colors.muted} /></Pressable>}
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceSoft }]}>
        <Animated.View style={[styles.fill, { backgroundColor: failed ? "#DC2626" : completed ? colors.success : colors.pink }, fillStyle]} />
      </View>
    </View>
  );
}

export const UploadQueuePanel = React.memo(function UploadQueuePanel({
  items, colors, onRetry, onCancel, onRemove,
}: {
  items: ClipQueueItem[];
  colors: any;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.heading, { color: colors.text }]}>Upload queue</Text>
    {items.map((item) => (
      <ProgressRow key={item.id} item={item} colors={colors} onRetry={onRetry} onCancel={onCancel} onRemove={onRemove} />
    ))}
  </View>;
});

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 4 },
  heading: { fontSize: 15, fontWeight: "800", marginBottom: 4 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 }, title: { fontSize: 12, fontWeight: "700" },
  status: { fontSize: 10, marginTop: 3 }, action: { padding: 7 },
  badge: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 9 },
  fill: { height: "100%", borderRadius: 3 },
});
