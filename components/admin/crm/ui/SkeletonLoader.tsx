import React, { useEffect, useRef } from "react";
import { Animated, useWindowDimensions, View } from "react-native";
import { adminContentWidth } from "@/utils/responsiveLayout";

function ShimmerBlock({ className }: { className: string }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View className={`bg-muted rounded-xl ${className}`} style={{ opacity }} />;
}

export function CrmCardSkeleton() {
  return (
    <View className="bg-card border border-border rounded-3xl p-4">
      <ShimmerBlock className="w-9 h-9 rounded-xl" />
      <ShimmerBlock className="h-6 w-16 mt-3" />
      <ShimmerBlock className="h-3 w-24 mt-2" />
    </View>
  );
}

export function CrmSkeletonGrid({ count = 4 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const basis = adminContentWidth(width) >= 1100 ? "31.5%" : "48%";
  return (
    <View className="flex-row flex-wrap gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={{ flexGrow: 0, flexBasis: basis, width: basis, maxWidth: basis, minWidth: 160 }}>
          <CrmCardSkeleton />
        </View>
      ))}
    </View>
  );
}
