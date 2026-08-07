import React, { forwardRef, useState } from "react";
import {
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type TextInputProps,
} from "react-native";
import { useColorScheme } from "nativewind";

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
  returnKeyType?: ReturnKeyTypeOptions;
  textContentType?: TextInputProps["textContentType"];
  autoComplete?: TextInputProps["autoComplete"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  onSubmitEditing?: () => void;
  onFocus?: TextInputProps["onFocus"];
  /** Rendered at the right edge of the input (e.g. a password visibility toggle). */
  accessory?: React.ReactNode;
  secureTextEntry?: boolean;
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
    returnKeyType = "done",
    textContentType,
    autoComplete,
    autoCapitalize = "none",
    onSubmitEditing,
    onFocus,
    accessory,
    secureTextEntry,
  }: AuthFieldProps,
  ref: React.Ref<TextInput>,
) {
  const { colorScheme } = useColorScheme();
  const [focused, setFocused] = useState(false);

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
      >
        {Icon ? <Icon size={19} className="text-muted-foreground" /> : null}
        <TextInput
          ref={ref}
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
          returnKeyType={returnKeyType}
          textContentType={textContentType}
          autoComplete={autoComplete}
          secureTextEntry={secureTextEntry}
          submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          onFocus={(event) => {
            setFocused(true);
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
