import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import type { VendorFilters } from "@/types/adminVendors";

const statuses = ["all", "approved", "pending", "rejected", "suspended", "archived"] as const;

export function VendorFilterBar({
  filters,
  onChange,
  onMore,
}: {
  filters: VendorFilters;
  onChange: (changes: Partial<VendorFilters>) => void;
  onMore: () => void;
}) {
  const [query, setQuery] = useState(filters.query);
  useEffect(() => setQuery(filters.query), [filters.query]);
  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 1) return;
    const timer = setTimeout(() => {
      if (query !== filters.query) {
        onChange({ query: trimmedQuery });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.query, onChange, query]);
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <View className="flex-1 h-12 px-3 rounded-xl bg-background border border-border flex-row items-center gap-2">
          <Search size={18} className="text-muted-foreground" />
          <TextInput
            accessibilityLabel="Search vendors"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by vendor, owner, email, city or ID"
            placeholderTextColor="#7A8190"
            className="flex-1 min-w-0 text-foreground text-body"
          />
          {query ? <Pressable accessibilityLabel="Clear search" className="w-11 h-11 rounded-xl items-center justify-center active:bg-muted" onPress={() => setQuery("")}><X size={15} className="text-muted-foreground" /></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open advanced filters" className="w-12 h-12 rounded-xl bg-card border border-border items-center justify-center active:bg-muted" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={onMore}>
          <SlidersHorizontal size={19} className="text-primary" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {statuses.map((status) => (
          <Pressable key={status} className={`min-h-11 px-4 rounded-xl border items-center justify-center ${filters.status === status ? "bg-primary border-primary" : "bg-background border-border"}`} style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={() => onChange({ status })}>
            <Text className={`text-xs font-semibold capitalize ${filters.status === status ? "text-white" : "text-foreground"}`}>{status}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
