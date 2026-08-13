import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Check, ChevronDown, Search, X } from "lucide-react-native";

type SelectOption = { id: string; name: string };

export function HierarchySelect({
  label,
  value,
  options,
  selectedId,
  onSelect,
  disabled = false,
  loading = false,
}: {
  label: string;
  value?: string;
  options: SelectOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View>
      <Text className="text-foreground text-label font-inter-semibold mb-2">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose ${label}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="min-h-12 px-4 rounded-xl border border-border bg-background flex-row items-center justify-between"
        style={({ pressed }) => ({ opacity: disabled ? 0.45 : pressed ? 0.86 : 1, transform: [{ scale: pressed && !disabled ? 0.99 : 1 }] })}
      >
        <Text className={value ? "text-foreground text-body font-inter-semibold flex-1" : "text-muted-foreground text-body flex-1"} numberOfLines={1}>
          {loading ? `Loading ${label}s…` : value ?? `Select ${label}`}
        </Text>
        {loading ? <ActivityIndicator size="small" color="#E91E63" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => { setOpen(false); setQuery(""); }}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center p-4" onPress={() => { setOpen(false); setQuery(""); }}>
          <Pressable
            accessibilityRole="menu"
            className="w-full max-w-lg max-h-[72%] bg-card rounded-2xl overflow-hidden"
            onPress={(event) => event.stopPropagation()}
          >
            <View className="min-h-16 px-4 flex-row items-center justify-between border-b border-border">
              <View>
                <Text className="text-foreground text-title font-inter-bold">Select {label}</Text>
                <Text className="text-muted-foreground text-caption mt-0.5">
                  {query ? `${filteredOptions.length} of ${options.length}` : `${options.length} available`}
                </Text>
              </View>
              <Pressable accessibilityLabel="Close dropdown" onPress={() => { setOpen(false); setQuery(""); }} className="w-11 h-11 rounded-xl items-center justify-center">
                <X size={19} className="text-foreground" />
              </Pressable>
            </View>

            <View className="px-4 pt-3 pb-2 border-b border-border flex-row items-center gap-2 bg-background">
              <Search size={16} className="text-muted-foreground" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${label}s…`}
                placeholderTextColor="#91898D"
                autoFocus
                className="flex-1 h-10 text-foreground text-body"
                style={{ outlineStyle: "none" } as never}
              />
              {query ? (
                <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")} className="w-7 h-7 items-center justify-center">
                  <X size={15} className="text-muted-foreground" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={{ padding: 8 }} keyboardShouldPersistTaps="handled">
              {!filteredOptions.length ? (
                <Text className="text-muted-foreground text-body text-center py-8">No {label} matches “{query}”.</Text>
              ) : filteredOptions.map((option) => {
                const selected = option.id === selectedId;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="menuitem"
                    onPress={() => { onSelect(option.id); setOpen(false); setQuery(""); }}
                    className={`min-h-12 px-3 rounded-xl flex-row items-center justify-between ${selected ? "bg-primary/10" : "bg-transparent"}`}
                    style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}
                  >
                    <Text className={selected ? "text-primary text-body font-inter-semibold flex-1" : "text-foreground text-body flex-1"}>{option.name}</Text>
                    {selected ? <Check size={18} className="text-primary" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
