import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, } from "react-native";
import { useRouter } from "expo-router";
import { Check, ChevronDown, Save } from "lucide-react-native";
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming, } from "react-native-reanimated";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { VendorReadinessLabels, type CompletionState } from "@/hooks/useVendorWorkspace";
import { MotionDuration, MotionEasing } from "@/utils/motion";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

// Shared building blocks for the focused, section-specific vendor profile
// forms (Business information, About the business, Location, Contact
// information, Logo and brand, Search tags). Extracted from the previous
// single all-in-one VendorEditProfile screen so every section form looks
// and behaves consistently without duplicating ~150 lines of boilerplate
// six times over.

type Colors = typeof vendorTheme.light;
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function SectionTitle({
  icon: Icon,
  title,
  detail,
  colors,
}: {
  icon: React.ComponentType<any>;
  title: string;
  detail: string;
  colors: Colors;
}) {
  return (
    <View style={kitStyles.sectionTitle}>
      <View style={[kitStyles.sectionIcon, { backgroundColor: colors.surfaceSoft }]}>
        <Icon size={19} color={colors.pink} />
      </View>
      <View style={kitStyles.flex}>
        <Text style={[kitStyles.sectionHeading, { color: colors.text }]}>{title}</Text>
        <Text style={[kitStyles.sectionDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
    </View>
  );
}

export function Field({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  colors,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  maxLength,
  helper,
  error,
  editable = true,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: Colors;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
  maxLength?: number;
  helper?: string;
  /** Validation message. Occupies the same slot as `helper` (swapped, not
   *  appended) so showing/clearing it never shifts the layout below. */
  error?: string | null;
  editable?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const focusValue = useSharedValue(0);

  useEffect(() => {
    focusValue.value = reducedMotion
      ? (focused ? 1 : 0)
      : withTiming(focused ? 1 : 0, { duration: MotionDuration.fast, easing: MotionEasing.soft });
  }, [focusValue, focused, reducedMotion]);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? "#D33B55"
      : interpolateColor(focusValue.value, [0, 1], [colors.border, colors.pink]),
    borderWidth: 1 + focusValue.value * 0.5,
  }));

  const messageText = error || helper;
  const isError = Boolean(error);

  return (
    <View style={kitStyles.field}>
      <Text style={[kitStyles.label, { color: colors.text }]}>
        {label}
        {required ? <Text style={{ color: colors.pink }}> *</Text> : null}
      </Text>
      <AnimatedTextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          kitStyles.input,
          multiline && kitStyles.textarea,
          { backgroundColor: colors.background, color: colors.text },
          animatedBorderStyle,
          !editable && { opacity: 0.6 },
        ]}
      />
      {messageText ? (
        <ValidationMessage text={messageText} isError={isError} colors={colors} />
      ) : null}
    </View>
  );
}

/**
 * Fades/slides a helper or validation message in place -- never appends a
 * new line, so a field growing an error message never pushes the rest of
 * the form down.
 */
function ValidationMessage({ text, isError, colors }: { text: string; isError: boolean; colors: Colors }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(reducedMotion ? 0 : -3);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: MotionDuration.fast, easing: MotionEasing.standard });
    translateY.value = reducedMotion ? 0 : withTiming(0, { duration: MotionDuration.fast, easing: MotionEasing.standard });
    // Re-trigger the fade whenever the message text itself changes (e.g.
    // one validation error replaced by another) so it still reads as a
    // fresh, noticeable update -- not just on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={[kitStyles.helper, { color: isError ? "#D33B55" : colors.muted }, isError && kitStyles.helperError, animatedStyle]}>
      {text}
    </Animated.Text>
  );
}

/**
 * A chevron that rotates 180° when its owning dropdown/picker is open --
 * shared by every "choose a category / choose a city" trigger instead of
 * each screen hand-rolling its own rotation transform.
 */
export function DropdownArrow({ open, color, size = 18 }: { open: boolean; color: string; size?: number }) {
  const reducedMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = reducedMotion
      ? (open ? 1 : 0)
      : withTiming(open ? 1 : 0, { duration: MotionDuration.fast, easing: MotionEasing.standard });
  }, [open, reducedMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <ChevronDown size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Renders the section form's children only once a vendor record is
 * confirmed loaded. Otherwise shows a loading spinner or a clear
 * "not connected / session expired" recovery state with a retry and a
 * sign-in action -- the same safe-state handling every section form needs,
 * centralized once instead of copy-pasted six times.
 */
export function VendorWorkspaceGate({
  colors,
  loading,
  vendor,
  error,
  onRetry,
  children,
}: {
  colors: Colors;
  loading: boolean;
  vendor: any | null;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  if (loading && !vendor) {
    return <ActivityIndicator color={colors.pink} style={{ marginTop: 40 }} />;
  }
  if (!vendor) {
    return (
      <View style={[kitStyles.workspaceError, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[kitStyles.workspaceErrorTitle, { color: colors.text }]}>Vendor business not connected</Text>
        <Text style={[kitStyles.workspaceErrorText, { color: colors.muted }]}>
          {error ?? "Sign in with the Vendor account connected to this business before editing its live profile."}
        </Text>
        <View style={kitStyles.workspaceErrorActions}>
          <Pressable onPress={onRetry} style={[kitStyles.workspaceErrorButton, { backgroundColor: colors.surfaceSoft }]}>
            <Text style={[kitStyles.workspaceErrorButtonText, { color: colors.text }]}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/VendorAuth")} style={[kitStyles.workspaceErrorButton, { backgroundColor: colors.pink }]}>
            <Text style={[kitStyles.workspaceErrorButtonText, { color: "#FFF" }]}>Vendor sign in</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return <>{children}</>;
}

/**
 * Small readiness chip a section form can show next to its heading, using
 * the same VendorReadinessRules/VendorReadinessLabels the checklist itself
 * reads -- so a form never claims a different completion state than the
 * card that opened it.
 */
export function ReadinessBadge({ colors, state }: { colors: Colors; state: CompletionState }) {
  const tint = state === "complete" ? colors.success : state === "attention" ? colors.warning : colors.pink;
  return (
    <View style={[kitStyles.readinessBadge, { backgroundColor: `${tint}16` }]}>
      <Text style={[kitStyles.readinessBadgeText, { color: tint }]}>{VendorReadinessLabels[state]}</Text>
    </View>
  );
}

type SaveButtonState = "idle" | "saving" | "saved" | "error";

export function SaveBar({
  colors,
  saving,
  disabled,
  saved,
  saveError,
  savedLabel = "Saved",
  hint = "Changes update your public vendor profile.",
  onPress,
  buttonLabel = "Save",
}: {
  colors: Colors;
  saving: boolean;
  disabled?: boolean;
  saved: boolean;
  saveError: string;
  savedLabel?: string;
  hint?: string;
  onPress: () => void;
  buttonLabel?: string;
}) {
  const reducedMotion = useReducedMotion();
  const state: SaveButtonState = saveError ? "error" : saving ? "saving" : saved ? "saved" : "idle";
  const messageOpacity = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const [displayState, setDisplayState] = useState(state);

  useEffect(() => {
    if (displayState === state) return;
    if (reducedMotion) {
      setDisplayState(state);
      return;
    }
    messageOpacity.value = withTiming(0, { duration: 110 }, (finished) => {
      if (finished) messageOpacity.value = withTiming(1, { duration: 160 });
    });
    const timer = setTimeout(() => setDisplayState(state), 110);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state !== "saved") return;
    // A short, single pulse -- not a bounce loop -- on the moment a save
    // actually lands, then the button returns to its resting scale.
    buttonScale.value = reducedMotion
      ? 1
      : withSequence(
        withTiming(1.06, { duration: 120, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }),
      );
  }, [buttonScale, reducedMotion, state]);

  const messageStyle = useAnimatedStyle(() => ({ opacity: messageOpacity.value }));
  const buttonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

  return (
    <View style={[kitStyles.saveBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Animated.View style={[kitStyles.saveMessage, messageStyle]}>
        {displayState === "error" ? (
          <Text style={kitStyles.saveErrorText}>{saveError}</Text>
        ) : displayState === "saved" ? (
          <>
            <Check size={16} color={colors.success} />
            <Text style={[kitStyles.savedText, { color: colors.success }]}>{savedLabel}</Text>
          </>
        ) : displayState === "saving" ? (
          <Text style={[kitStyles.saveHint, { color: colors.muted }]}>Saving…</Text>
        ) : (
          <Text style={[kitStyles.saveHint, { color: colors.muted }]}>{hint}</Text>
        )}
      </Animated.View>
      <Animated.View style={buttonAnimatedStyle}>
        <Pressable
          disabled={saving || disabled}
          onPress={onPress}
          style={({ pressed }) => [
            kitStyles.save,
            { backgroundColor: state === "saved" ? colors.success : colors.pink },
            pressed && kitStyles.pressed,
            (saving || disabled) && { opacity: 0.6 },
          ]}
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : state === "saved"
              ? <><Check size={17} color="#FFF" /><Text style={kitStyles.saveText}>Saved</Text></>
              : <><Save size={17} color="#FFF" /><Text style={kitStyles.saveText}>{buttonLabel}</Text></>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const kitStyles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 780, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 38 },
  heading: { marginBottom: 19 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  readinessBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  readinessBadgeText: { fontSize: typeScale.caption, fontWeight: "700" },
  eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.6, fontWeight: "700", marginBottom: 6 },
  title: { ...typeStyles.pageTitle },
  subtitle: { fontSize: typeScale.metadata, lineHeight: typeLeading.bodyCompact, marginTop: 5, maxWidth: 680 },
  section: { borderWidth: 1, borderRadius: 23, padding: 17, marginBottom: 12 },
  workspaceError: { borderWidth: 1, borderRadius: 23, padding: 22, marginTop: 10 },
  workspaceErrorTitle: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  workspaceErrorText: { fontSize: typeScale.metadata, lineHeight: typeLeading.bodyCompact, marginTop: 7 },
  workspaceErrorActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 },
  workspaceErrorButton: { minHeight: 44, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  workspaceErrorButtonText: { fontSize: typeScale.caption, fontWeight: "700" },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 17 },
  sectionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionHeading: { fontSize: typeScale.body, fontWeight: "700" },
  sectionDetail: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
  flex: { flex: 1, minWidth: 0 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { marginBottom: 13 },
  label: { fontSize: typeScale.caption, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: typeScale.body },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  textarea: { minHeight: 126, paddingTop: 13 },
  helper: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 5 },
  helperError: { fontWeight: "700" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -3 },
  tag: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, fontSize: typeScale.caption, fontWeight: "700" },
  saveBar: { borderWidth: 1, borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 3 },
  saveMessage: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  saveHint: { fontSize: typeScale.caption },
  savedText: { fontSize: typeScale.caption, fontWeight: "700" },
  saveErrorText: { color: "#D33B55", fontSize: typeScale.caption, lineHeight: typeLeading.label, fontWeight: "700" },
  save: { minWidth: 130, minHeight: 47, paddingHorizontal: 18, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#FFF", fontSize: typeScale.metadata, fontWeight: "700" },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
