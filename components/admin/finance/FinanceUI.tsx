import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { AlertCircle, CircleCheck, type LucideIcon } from "lucide-react-native";
import { adminPalette } from "@/theme";
import { typeStyles } from "@/constants/typography";

export function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: compact ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function FinanceMetric({ label, value, hint, tone = "neutral", icon: Icon }: { label: string; value: string; hint?: string; tone?: "neutral" | "positive" | "warning" | "negative"; icon?: LucideIcon }) {
  const color = tone === "positive" ? adminPalette.success : tone === "warning" ? adminPalette.warning : tone === "negative" ? adminPalette.error : adminPalette.text;
  const tint = tone === "positive" ? adminPalette.successSubtle : tone === "warning" ? adminPalette.warningSubtle : tone === "negative" ? adminPalette.errorSubtle : adminPalette.surfaceSubtle;
  return <View style={styles.metric}>
    <View style={styles.metricTop}><Text style={styles.metricLabel}>{label}</Text>{Icon ? <View style={[styles.metricIcon, { backgroundColor: tint }]}><Icon size={17} color={color} /></View> : null}</View>
    <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.metricValue, { color }]}>{value}</Text>
    {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
  </View>;
}

export function FinanceSection({ title, description, action, children }: React.PropsWithChildren<{ title: string; description?: string; action?: React.ReactNode }>) {
  return <View style={styles.section}>
    <View style={styles.sectionHeader}><View style={styles.flex}><Text style={styles.sectionTitle}>{title}</Text>{description ? <Text style={styles.sectionDescription}>{description}</Text> : null}</View>{action}</View>
    {children}
  </View>;
}

export function FinanceButton({ label, onPress, icon: Icon, disabled, variant = "primary", accessibilityHint }: { label: string; onPress: () => void; icon?: LucideIcon; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; accessibilityHint?: string }) {
  const foreground = variant === "primary" ? "#FFF" : variant === "danger" ? adminPalette.error : adminPalette.brand;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === "primary" ? styles.buttonPrimary : variant === "danger" ? styles.buttonDanger : styles.buttonSecondary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    {Icon ? <Icon size={16} color={foreground} /> : null}<Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
  </Pressable>;
}

export function FinanceField({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor={adminPalette.textMuted} accessibilityLabel={label} accessibilityState={{ disabled: props.editable === false }} style={[styles.input, props.multiline && styles.multiline, error && styles.inputError, props.style]} />{error ? <Text accessibilityRole="alert" style={styles.fieldError}>{error}</Text> : null}</View>;
}

export function FinanceNotice({ children, tone = "info" }: React.PropsWithChildren<{ tone?: "info" | "success" | "warning" | "error" }>) {
  const color = tone === "success" ? adminPalette.success : tone === "warning" ? adminPalette.warning : tone === "error" ? adminPalette.error : adminPalette.info;
  const background = tone === "success" ? adminPalette.successSubtle : tone === "warning" ? adminPalette.warningSubtle : tone === "error" ? adminPalette.errorSubtle : adminPalette.infoSubtle;
  const Icon = tone === "success" ? CircleCheck : AlertCircle;
  return <View accessibilityRole={tone === "error" ? "alert" : "summary"} style={[styles.notice, { backgroundColor: background }]}><Icon size={17} color={color} /><Text style={[styles.noticeText, { color }]}>{children}</Text></View>;
}

export function FinanceLoading({ label = "Loading finance records…" }: { label?: string }) {
  return <View style={styles.state}><ActivityIndicator color={adminPalette.brand} /><Text style={styles.stateText}>{label}</Text></View>;
}

export function FinanceEmpty({ title, message }: { title: string; message: string }) {
  return <View style={styles.state}><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.stateText}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  metric: { flex: 1, minWidth: 180, minHeight: 126, backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 16, justifyContent: "space-between" },
  metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  metricLabel: { ...typeStyles.label, color: adminPalette.textSecondary },
  metricValue: { ...typeStyles.metric, marginTop: 8, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  metricHint: { ...typeStyles.caption, color: adminPalette.textMuted, marginTop: 4 },
  section: { backgroundColor: adminPalette.surface, borderWidth: 1, borderColor: adminPalette.border, borderRadius: 16, padding: 18, gap: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 },
  sectionTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
  sectionDescription: { ...typeStyles.metadata, color: adminPalette.textSecondary, marginTop: 4, maxWidth: 680 },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonPrimary: { backgroundColor: adminPalette.brand },
  buttonSecondary: { backgroundColor: adminPalette.brandSubtle, borderWidth: 1, borderColor: "#FBCFE8" },
  buttonDanger: { backgroundColor: adminPalette.errorSubtle },
  buttonText: { ...typeStyles.button },
  disabled: { opacity: 0.48 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  field: { flex: 1, minWidth: 160 },
  fieldLabel: { ...typeStyles.label, color: adminPalette.textSecondary, marginBottom: 6 },
  input: { ...typeStyles.bodyCompact, minHeight: 49, borderRadius: 14, borderWidth: 1, borderColor: adminPalette.border, backgroundColor: adminPalette.surface, color: adminPalette.text, paddingHorizontal: 13 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
  inputError: { borderColor: adminPalette.error },
  fieldError: { ...typeStyles.caption, color: adminPalette.error, marginTop: 5 },
  notice: { minHeight: 48, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { ...typeStyles.label, flex: 1 },
  state: { minHeight: 112, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 18 },
  stateText: { ...typeStyles.metadata, color: adminPalette.textSecondary, textAlign: "center", marginTop: 9, maxWidth: 420 },
  emptyTitle: { ...typeStyles.cardTitle, color: adminPalette.text },
});
