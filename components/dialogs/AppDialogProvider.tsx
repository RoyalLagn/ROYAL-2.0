import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
} from "react-native";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeLeading, typeScale } from "@/constants/typography";
import { registerAppAlertPresenter, type AppAlertRequest } from "@/utils/webAlert";
// This provider backs every Alert.alert() call app-wide (see
// utils/webAlert.ts). Its action/close buttons use a function
// `style={(state) => [...]}` prop to react to `pressed`. NativeWind's
// native Pressable interop does not resolve that render-prop form on
// Android -- the whole style silently drops (icon/text children still
// render), which is why the OK button looked like plain white text with no
// pink background. InteropSafePressable resolves the callback style itself
// before handing an already-resolved style to the underlying Pressable.
import Pressable from "@/components/InteropSafePressable";

type QueuedAlert = AppAlertRequest & { id: number };
let nextAlertId = 0;

function dialogTone(request: AppAlertRequest) {
  if (request.buttons.some((button) => button.style === "destructive")) return "destructive" as const;
  const title = request.title?.toLowerCase() ?? "";
  if (/saved|success|complete|updated|sent|created|verified/.test(title)) return "success" as const;
  if (/unable|failed|invalid|error|not |required|missing|delete|remove|clear/.test(title)) return "warning" as const;
  return "info" as const;
}

export default function AppDialogProvider({ children }: React.PropsWithChildren) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const colors = brandColors(dark);
  const [queue, setQueue] = useState<QueuedAlert[]>([]);
  const active = queue[0] ?? null;

  useEffect(() => registerAppAlertPresenter((request) => {
    nextAlertId += 1;
    setQueue((current) => [...current, { ...request, id: nextAlertId }]);
  }), []);

  const dismiss = useCallback((button?: AlertButton) => {
    setQueue((current) => current.slice(1));
    button?.onPress?.();
  }, []);

  const dismissWithoutChoice = useCallback(() => {
    if (!active) return;
    const cancelable = active.options?.cancelable === true
      || active.buttons.some((button) => button.style === "cancel");
    if (!cancelable) return;
    setQueue((current) => current.slice(1));
    active.options?.onDismiss?.();
  }, [active]);

  const tone = active ? dialogTone(active) : "info";
  const toneColor = tone === "destructive" || tone === "warning"
    ? colors.destructive
    : tone === "success"
      ? "#16845B"
      : colors.primaryStrong;
  const ToneIcon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : TriangleAlert;
  const stackActions = (active?.buttons.length ?? 0) > 2;
  const cardStyle = useMemo(() => ({
    backgroundColor: colors.card,
    borderColor: colors.border,
    shadowColor: dark ? "#000000" : "#4A2635",
  }), [colors.border, colors.card, dark]);

  return (
    <>
      {children}
      <Modal
        visible={Boolean(active)}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={dismissWithoutChoice}
      >
        <View style={styles.overlay} accessibilityViewIsModal>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss dialog"
            style={StyleSheet.absoluteFill}
            onPress={dismissWithoutChoice}
          />
          {active ? (
            <View
              accessibilityRole="alert"
              style={[styles.card, cardStyle]}
            >
              <View style={styles.headingRow}>
                <View style={[styles.icon, { backgroundColor: `${toneColor}16` }]}>
                  <ToneIcon size={21} color={toneColor} strokeWidth={2} />
                </View>
                <View style={styles.headingText}>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    {active.title || "RoyalLagn"}
                  </Text>
                </View>
                {(active.options?.cancelable === true || active.buttons.some((button) => button.style === "cancel")) ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close dialog"
                    hitSlop={6}
                    onPress={dismissWithoutChoice}
                    style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                  >
                    <X size={18} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>

              {active.message ? (
                <ScrollView style={styles.messageScroll} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.message, { color: colors.mutedForeground }]}>{active.message}</Text>
                </ScrollView>
              ) : null}

              <View style={[styles.actions, stackActions && styles.actionsStacked]}>
                {active.buttons.map((button, index) => {
                  const destructive = button.style === "destructive";
                  const secondary = button.style === "cancel" || (active.buttons.length > 1 && index < active.buttons.length - 1);
                  return (
                    <Pressable
                      key={`${active.id}-${button.text || "action"}-${index}`}
                      accessibilityRole="button"
                      onPress={() => dismiss(button)}
                      style={({ pressed }) => [
                        styles.action,
                        !stackActions && styles.actionInline,
                        secondary
                          ? { backgroundColor: dark ? colors.muted : colors.background, borderColor: colors.border }
                          : { backgroundColor: destructive ? colors.destructive : colors.primaryStrong, borderColor: destructive ? colors.destructive : colors.primaryStrong },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[
                        styles.actionText,
                        { color: secondary ? (destructive ? colors.destructive : colors.foreground) : "#FFFFFF" },
                      ]}>
                        {button.text || "OK"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 10, 13, 0.56)",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  headingRow: { minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.sans.bold, fontSize: typeScale.cardTitle, lineHeight: typeLeading.cardTitle },
  close: { width: 44, height: 44, marginRight: -8, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  messageScroll: { maxHeight: 220, marginTop: 14 },
  message: { fontFamily: fonts.sans.regular, fontSize: typeScale.body, lineHeight: typeLeading.body },
  actions: { marginTop: 20, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  actionsStacked: { flexDirection: "column" },
  action: { minHeight: Platform.OS === "android" ? 48 : 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  actionInline: { flex: 1 },
  actionText: { fontFamily: fonts.sans.bold, fontSize: typeScale.button, lineHeight: typeLeading.button, textAlign: "center" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
