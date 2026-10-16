import React, { useMemo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

type PaginationBarProps = {
  page: number;
  pages: number;
  onPage: (page: number) => void;
  total?: number;
  pageSize?: number;
};

export function PaginationBar({ page, pages, onPage, total, pageSize }: PaginationBarProps) {
  const { width } = useWindowDimensions();
  const showNumbers = width >= 640;
  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pages - 4));
    const end = Math.min(pages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, pages]);
  const first = total && pageSize ? (page - 1) * pageSize + 1 : null;
  const last = total && pageSize ? Math.min(page * pageSize, total) : null;

  return (
    <View className="items-center gap-2 mt-6">
      <View className="flex-row items-center justify-center gap-2">
        <PageButton label="Previous page" disabled={page <= 1} onPress={() => onPage(page - 1)}><ChevronLeft size={18} className="text-foreground" /></PageButton>
        {showNumbers ? pageNumbers.map((number) => (
          <PageButton key={number} label={`Page ${number}`} selected={number === page} onPress={() => onPage(number)}>
            <Text className={number === page ? "text-white text-button font-inter-semibold" : "text-foreground text-button font-inter-semibold"} style={{ letterSpacing: -0.08 }}>{number}</Text>
          </PageButton>
        )) : <Text className="text-foreground text-sm px-2">Page {page} of {pages}</Text>}
        <PageButton label="Next page" disabled={page >= pages} onPress={() => onPage(page + 1)}><ChevronRight size={18} className="text-foreground" /></PageButton>
      </View>
      {first !== null && last !== null && total !== undefined ? <Text className="text-muted-foreground text-caption">Showing {first}–{last} of {total.toLocaleString("en-IN")}</Text> : null}
    </View>
  );
}

function PageButton({ children, label, disabled = false, selected = false, onPress }: { children: React.ReactNode; label: string; disabled?: boolean; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      className={`min-w-11 min-h-11 px-3 rounded-xl items-center justify-center ${selected ? "bg-primary" : "bg-card border border-border"}`}
      style={({ pressed }) => ({ opacity: disabled ? 0.35 : pressed ? 0.8 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] })}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}
