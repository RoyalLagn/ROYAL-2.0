import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import CompactSearchBar from "@/components/listing/CompactSearchBar";
import { useColorScheme } from "nativewind";
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
  const { colorScheme } = useColorScheme();
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
        <CompactSearchBar
          value={query}
          placeholder="Search any vendor by name, owner, email, city or ID…"
          dark={colorScheme === "dark"}
          accessibilityLabel="Search vendors"
          onChangeText={setQuery}
          style={{ flex: 1 }}
        />
        <Pressable className="min-w-11 min-h-11 rounded-xl bg-card border border-border items-center justify-center" onPress={onMore}>
          <SlidersHorizontal size={19} className="text-primary" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {statuses.map((status) => (
          <Pressable key={status} className={`min-h-11 px-4 rounded-full items-center justify-center border ${filters.status === status ? "bg-primary border-primary" : "bg-card border-border"}`} onPress={() => onChange({ status })}>
            <Text className={`text-xs font-semibold capitalize ${filters.status === status ? "text-white" : "text-foreground"}`}>{status}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
