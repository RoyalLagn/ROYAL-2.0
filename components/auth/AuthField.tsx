import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from "react-native";
import { useColorScheme } from "nativewind";
import { useKeyboardAwareForm } from "@/components/keyboard/KeyboardAwareScrollView";

export type AuthFieldProps = {
  label: string;
  icon?: React.ElementType;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Field-level message shown under the input in destructive colour. */
  error?: string;
  hint?: string;
  required?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  returnKeyType?: ReturnKeyTypeOptions;
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  onSubmitEditing?: () => void;
  onFocus?: TextInputProps["onFocus"];
  /** Rendered at the right edge of the input (e.g. a password visibility toggle). */
  accessory?: React.ReactNode;
  secureTextEntry?: boolean;
  variant?: "default" | "soft";
};

export function authPlaceholderColor(dark: boolean) {
  return dark ? "#6F6A74" : "#A8A29E";
}

export const AuthField = forwardRef(function AuthField(
  {
    label,
    icon: Icon,
    value,
    onChangeText,
    placeholder,
    error,
    hint,
    required,
    editable = true,
    autoFocus,
    keyboardType,
    maxLength,
    returnKeyType = "done",
    textContentType,
    autoComplete,
    autoCapitalize = "none",
    onSubmitEditing,
    onFocus,
    accessory,
    secureTextEntry,
    variant = "default",
  }: AuthFieldProps,
  ref: React.Ref<TextInput>,
) {
  const { colorScheme } = useColorScheme();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardForm = useKeyboardAwareForm();
  useImperativeHandle(ref, () => inputRef.current as TextInput);

  const borderClass = error
    ? "border-destructive"
    : focused
      ? "border-primary"
      : "border-border";

  return (
    <View>
      <Text className="text-foreground text-body font-semibold mb-1.5">
        {label}
        {required ? <Text className="text-primary"> *</Text> : null}
      </Text>
      <View
        className={`flex-row items-center bg-card border rounded-2xl px-4 ${borderClass} ${
          editable ? "" : "opacity-60"
        }`}
        style={variant === "soft" ? [styles.softField, focused && styles.softFieldFocused, error && styles.softFieldError] : undefined}
      >
        {Icon ? <Icon size={19} className="text-muted-foreground" /> : null}
        <TextInput
          ref={inputRef}
          className={`flex-1 text-foreground text-body py-3.5 ${Icon ? "ml-3" : ""}`}
          placeholder={placeholder}
          placeholderTextColor={authPlaceholderColor(colorScheme === "dark")}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          textContentType={textContentType}
          autoComplete={autoComplete}
          secureTextEntry={secureTextEntry}
          submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          onFocus={(event) => {
            setFocused(true);
            keyboardForm?.revealInput(inputRef.current);
            onFocus?.(event);
          }}
          onBlur={() => setFocused(false)}
        />
        {accessory}
      </View>
      {error ? (
        <Text className="text-destructive text-xs mt-1.5">{error}</Text>
      ) : hint ? (
        <Text className="text-muted-foreground text-xs mt-1.5">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  softField: {
    minHeight: 62,
    borderWidth: 1,
    borderColor: "#F2E6EA",
    backgroundColor: "#FEFDFE",
    shadowColor: "#B77F91",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 3,
  },
  softFieldFocused: {
    borderColor: "#E91E63",
    shadowColor: "#E91E63",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 5,
  },
  softFieldError: { borderColor: "#DC2626" },
});
