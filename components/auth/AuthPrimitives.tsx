import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CircleCheckBig, TriangleAlert } from "lucide-react-native";

type AuthSubmitButtonProps = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/** Full-width primary action with an inline spinner while the request runs. */
export function AuthSubmitButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onPress,
  accessibilityLabel,
}: AuthSubmitButtonProps) {
  const inactive = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      className={`h-14 rounded-2xl flex-row items-center justify-center gap-2 ${
        inactive ? "bg-primary/45" : "bg-primary active:opacity-90"
      }`}
    >
      {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
      <Text className="text-primary-foreground font-semibold text-[15px]">
        {loading ? loadingLabel ?? label : label}
      </Text>
    </Pressable>
  );
}

type AuthAlertProps = {
  tone: "error" | "success";
  message: string;
};

/** Form-level feedback banner. Errors use role="alert" so screen readers announce them. */
export function AuthAlert({ tone, message }: AuthAlertProps) {
  const error = tone === "error";
  return (
    <View
      accessibilityRole={error ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      className={`flex-row items-start gap-2.5 rounded-2xl px-4 py-3 border ${
        error
          ? "bg-destructive/10 border-destructive/25"
          : "bg-green-500/10 border-green-500/25"
      }`}
    >
      {error
        ? <TriangleAlert size={17} className="text-destructive mt-px" />
        : <CircleCheckBig size={17} color="#16A34A" style={{ marginTop: 1 }} />}
      <Text className={`flex-1 text-[13px] leading-5 ${error ? "text-destructive" : "text-green-600"}`}>
        {message}
      </Text>
    </View>
  );
}

type AuthTabsProps<T extends string> = {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
  disabled?: boolean;
};

/** Segmented Login / Sign Up switcher. */
export function AuthTabs<T extends string>({ tabs, active, onChange, disabled }: AuthTabsProps<T>) {
  return (
    <View className="flex-row bg-muted rounded-2xl p-1">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className={`flex-1 rounded-xl py-3 items-center ${selected ? "bg-card" : ""}`}
            onPress={() => onChange(tab.id)}
            disabled={disabled}
          >
            <Text className={selected ? "text-primary font-bold text-[14px]" : "text-muted-foreground font-semibold text-[14px]"}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type AuthLinkButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
};

export function AuthLinkButton({ onPress, disabled, children, align = "center" }: AuthLinkButtonProps) {
  const alignment = align === "end" ? "self-end" : align === "start" ? "self-start" : "items-center";
  return (
    <Pressable
      accessibilityRole="button"
      className={`${alignment} py-2 active:opacity-70 ${disabled ? "opacity-50" : ""}`}
      onPress={onPress}
      disabled={disabled}
    >
      {children}
    </Pressable>
  );
}
