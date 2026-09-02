import React, { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react-native";
import { Pressable, type TextInput, type TextInputProps } from "react-native";
import { AuthField } from "@/components/auth/AuthField";

type PasswordFieldProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "next" | "go";
  onFocus?: TextInputProps["onFocus"];
  error?: string;
  hint?: string;
  /** "current-password" on login, "new-password" when setting one. */
  autoComplete?: "current-password" | "new-password";
  variant?: "default" | "soft";
};

export const PasswordField = forwardRef(function PasswordField(
  {
    label = "Password",
    value,
    onChangeText,
    placeholder,
    onSubmitEditing,
    returnKeyType = "done",
    onFocus,
    error,
    hint,
    autoComplete = "current-password",
    variant = "default",
  }: PasswordFieldProps,
  ref: React.Ref<TextInput>,
) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput);
  return (
    <AuthField
      ref={inputRef}
      label={label}
      icon={Lock}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      error={error}
      hint={hint}
      secureTextEntry={!visible}
      textContentType={autoComplete === "new-password" ? "newPassword" : "password"}
      autoComplete={autoComplete}
      variant={variant}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      onFocus={onFocus}
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          hitSlop={10}
          className="pl-3 active:opacity-60"
          onPress={() => {
            setVisible((current) => !current);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          {visible
            ? <EyeOff size={19} className="text-muted-foreground" />
            : <Eye size={19} className="text-muted-foreground" />}
        </Pressable>
      }
    />
  );
});
