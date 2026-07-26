import React, { createContext, useContext, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { createResponsiveLayout } from "@/utils/responsiveLayout";
import type { ResponsiveLayout } from "@/types/responsive";

const ResponsiveLayoutContext = createContext<ResponsiveLayout | null>(null);

export function ResponsiveLayoutProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const value = useMemo(
    () => createResponsiveLayout(width, height),
    [height, width],
  );
  return (
    <ResponsiveLayoutContext.Provider value={value}>
      {children}
    </ResponsiveLayoutContext.Provider>
  );
}

export function useResponsiveLayout() {
  const value = useContext(ResponsiveLayoutContext);
  if (!value) {
    throw new Error("useResponsiveLayout must be used inside ResponsiveLayoutProvider.");
  }
  return value;
}

export function useBreakpoint() {
  return useResponsiveLayout().breakpoint;
}
