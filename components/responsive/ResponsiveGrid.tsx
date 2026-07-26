import React, { useCallback, useState } from "react";
import { View, type LayoutChangeEvent, type ViewProps } from "react-native";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

type Props = ViewProps & {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
};

export function ResponsiveGrid({
  children,
  columns,
  gap,
  style,
  ...props
}: Props) {
  const layout = useResponsiveLayout();
  const [availableWidth, setAvailableWidth] = useState(0);
  const columnCount = Math.max(1, columns ?? layout.statisticColumns);
  const spacing = gap ?? layout.sectionGap;
  const itemWidth = availableWidth
    ? Math.max(0, (availableWidth - spacing * (columnCount - 1)) / columnCount)
    : undefined;
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setAvailableWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View
      {...props}
      onLayout={onLayout}
      style={[{ flexDirection: "row", flexWrap: "wrap", gap: spacing }, style]}
    >
      {React.Children.map(children, (child) => (
        <View style={{ width: itemWidth, minWidth: 0 }}>{child}</View>
      ))}
    </View>
  );
}
