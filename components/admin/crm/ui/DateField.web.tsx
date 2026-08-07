import React, { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Calendar } from "lucide-react-native";
import type { DateFieldProps } from "./DateField";

// Web build of DateField (Metro/webpack pick this file automatically for
// web, DateField.tsx for iOS/Android). react-native-web renders host
// elements as real DOM nodes, so a plain <input type="date"> gives a proper
// browser calendar picker — no manual typing, same "YYYY-MM-DD" value the
// rest of the form already expects, no extra dependency needed.
export function DateField({ label, value, onChange, minimumDate }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker() opens the browser's native calendar UI programmatically
    // (supported in Chrome/Edge/Safari); older browsers fall back to their
    // default click-to-open behavior via the native .focus()/click().
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); } catch { el.focus(); }
    } else {
      el.focus();
    }
  };

  return (
    <View className="mb-3">
      <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text>
      <Pressable
        onPress={openPicker}
        className="h-12 border border-border rounded-2xl px-4 flex-row items-center justify-between bg-background"
      >
        <input
          ref={inputRef}
          type="date"
          value={value}
          min={minimumDate || undefined}
          onChange={(event) => onChange(event.target.value)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            font: "inherit",
            color: "inherit",
            padding: 0,
            colorScheme: "light dark",
          }}
        />
        <Pressable accessibilityLabel={`Open ${label.toLowerCase()} picker`} onPress={openPicker} hitSlop={8}>
          <Calendar size={18} className="text-muted-foreground" />
        </Pressable>
      </Pressable>
    </View>
  );
}
