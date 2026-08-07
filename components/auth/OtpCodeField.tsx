import React, { useEffect, useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

type OtpCodeFieldProps = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * Digit boxes backed by a single hidden input so SMS/email autofill and paste
 * still work. Tapping anywhere on the row focuses the input.
 */
export function OtpCodeField({
  length,
  value,
  onChange,
  onSubmit,
  disabled = false,
  autoFocus = true,
}: OtpCodeFieldProps) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Enter the ${length} digit verification code`}
      onPress={() => inputRef.current?.focus()}
      className="flex-row justify-between"
      style={{ gap: 6 }}
    >
      {Array.from({ length }, (_, index) => {
        const filled = Boolean(value[index]);
        const cursor = index === value.length;
        return (
          <View
            key={index}
            className={`flex-1 aspect-square rounded-xl border items-center justify-center bg-card ${
              cursor ? "border-primary" : filled ? "border-primary/40" : "border-border"
            }`}
            style={{ maxWidth: 46, minHeight: 40 }}
          >
            <Text className="text-foreground text-lg font-bold">{value[index] || ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(next) => onChange(next.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        editable={!disabled}
        caretHidden
        onSubmitEditing={onSubmit}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
    </Pressable>
  );
}
