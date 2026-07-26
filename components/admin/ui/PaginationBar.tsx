import React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
export function PaginationBar({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return <View className="flex-row items-center justify-center gap-3 mt-5"><Pressable accessibilityLabel="Previous page" className="min-w-11 min-h-11 bg-card border border-border rounded-xl items-center justify-center" disabled={page <= 1} onPress={() => onPage(page - 1)}><ChevronLeft size={18} className="text-foreground" /></Pressable><Text className="text-foreground text-sm">Page {page} of {pages}</Text><Pressable accessibilityLabel="Next page" className="min-w-11 min-h-11 bg-card border border-border rounded-xl items-center justify-center" disabled={page >= pages} onPress={() => onPage(page + 1)}><ChevronRight size={18} className="text-foreground" /></Pressable></View>;
}
