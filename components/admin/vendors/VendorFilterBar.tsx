import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Funnel, Search, X } from "lucide-react-native";
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
  const advancedFilterCount = [
    filters.verification !== "all",
    filters.plan !== "all",
    Boolean(filters.categoryId),
    Boolean(filters.stateId),
    Boolean(filters.districtId),
    Boolean(filters.talukaId),
    filters.sort !== "newest",
  ].filter(Boolean).length;
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
        <View className="flex-1 h-12 px-3 rounded-xl bg-background border border-border flex-row items-center gap-2 focus-within:border-primary/50 transition-colors duration-200">
          <Search size={18} className="text-muted-foreground" />
          <TextInput
            accessibilityLabel="Search vendors"
            value={query}
            onChangeText={setQuery}
            placeholder="Search by vendor, owner, email, city or ID"
            placeholderTextColor="#7A8190"
            className="flex-1 min-w-0 text-foreground text-body"
          />
          {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" className="w-11 h-11 rounded-xl items-center justify-center hover:bg-muted active:bg-muted transition-colors duration-200" onPress={() => setQuery("")}><X size={15} className="text-muted-foreground" /></Pressable> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={advancedFilterCount ? `Open filters, ${advancedFilterCount} active` : "Open filters"}
          className="h-12 min-w-[108px] px-4 rounded-xl bg-primary border border-primary flex-row items-center justify-center gap-2 shadow-sm hover:opacity-90 active:opacity-80 transition-opacity duration-200"
          style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined}
          onPress={onMore}
        >
          <Funnel size={18} color="#FFFFFF" />
          <Text className="text-white text-sm font-bold">Filters</Text>
          {advancedFilterCount > 0 ? (
            <View className="min-w-5 h-5 px-1 rounded-full bg-white items-center justify-center">
              <Text className="text-primary text-[10px] font-bold">{advancedFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {statuses.map((status) => (
          <Pressable key={status} className={`min-h-11 px-4 rounded-xl border items-center justify-center ${filters.status === status ? "bg-primary border-primary" : "bg-background border-border hover:border-primary/35 hover:bg-primary/5"} transition-colors duration-200`} style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={() => onChange({ status })}>
            <Text className={`text-xs font-semibold capitalize ${filters.status === status ? "text-white" : "text-foreground"}`}>{status}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
