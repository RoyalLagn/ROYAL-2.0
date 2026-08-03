import React, { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react-native";
import { Pressable, TextInput, View } from "react-native";

type PasswordFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "next" | "go";
  onFocus?: (event: unknown) => void;
};

export const PasswordField = forwardRef(function PasswordField(
  {
    value,
    onChangeText,
    placeholder,
    onSubmitEditing,
    returnKeyType = "done",
    onFocus,
  }: PasswordFieldProps,
  ref: React.Ref<TextInput>
) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
      <Lock size={20} className="text-muted-foreground" />
      <TextInput
        ref={ref}
        className="flex-1 text-foreground py-4 mx-3"
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        autoComplete="password"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        submitBehavior={returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        onFocus={onFocus}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        hitSlop={10}
        onPress={() => setVisible((current) => !current)}
      >
        {visible
          ? <EyeOff size={20} className="text-muted-foreground" />
          : <Eye size={20} className="text-muted-foreground" />}
      </Pressable>
    </View>
  );
});
