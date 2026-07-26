import React from "react";
import { Pressable, Text, View } from "react-native";
export function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return <View className="absolute left-4 right-4 bottom-24 bg-foreground rounded-2xl p-4 flex-row items-center z-50"><Text className="text-background flex-1 font-semibold" numberOfLines={2}>{message}</Text><Pressable className="min-w-11 min-h-11 items-center justify-center ml-2" onPress={onUndo}><Text className="text-primary font-bold">UNDO</Text></Pressable></View>;
}
