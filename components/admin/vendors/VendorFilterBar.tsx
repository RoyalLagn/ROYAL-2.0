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
  categories = [],
}: {
  filters: VendorFilters;
  onChange: (changes: Partial<VendorFilters>) => void;
  onMore: () => void;
  categories?: { id: string; name: string }[];
}) {
  const { colorScheme } = useColorScheme();
  const [query, setQuery] = useState(filters.query);
  useEffect(() => setQuery(filters.query), [filters.query]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== filters.query) {
        const tokens = query.trim().split(/\s+/).filter(Boolean);
        let status = filters.status;
        let plan = filters.plan;
        let categoryId = filters.categoryId;
        const remaining = tokens.filter((token) => {
          const normalized = token.toLowerCase();
          if (["pending", "approved", "rejected", "suspended", "archived"].includes(normalized)) {
            status = normalized as typeof status;
            return false;
          }
          if (["premium", "gold"].includes(normalized)) { plan = "premium"; return false; }
          if (normalized === "free") { plan = "free"; return false; }
          const category = categories.find((item) => {
            const name = item.name.toLowerCase();
            return name.startsWith(normalized.slice(0, Math.min(5, normalized.length)))
              || normalized.startsWith(name.slice(0, Math.min(5, name.length)));
          });
          if (category) { categoryId = category.id; return false; }
          return true;
        });
        onChange({ query: remaining.join(" "), status, plan, categoryId });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [categories, filters.categoryId, filters.plan, filters.query, filters.status, onChange, query]);
  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <CompactSearchBar
          value={query}
          placeholder="Search vendors, owners, email, city or ID…"
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
