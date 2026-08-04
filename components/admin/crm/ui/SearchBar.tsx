import React, { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Search, X } from "lucide-react-native";

type CrmSearchBarProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  debounceMs?: number;
};

// Debounced search input styled with the shared admin/CRM theme tokens.
export function CrmSearchBar({ value, placeholder, onChangeText, debounceMs = 300 }: CrmSearchBarProps) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(value), [value]);

  const handleChange = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChangeText(next), debounceMs);
  };

  return (
    <View className="flex-row items-center bg-card border border-border rounded-2xl px-4 h-12">
      <Search size={16} className="text-muted-foreground" />
      <TextInput
        value={draft}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        returnKeyType="search"
        className="flex-1 text-foreground text-sm ml-2"
      />
      {draft ? (
        <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => handleChange("")}>
          <X size={15} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
