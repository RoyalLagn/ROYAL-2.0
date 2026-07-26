import React from "react";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function ResponsiveColumns({ children }: { children: React.ReactNode }) {
  const { widgetColumns, sectionGap } = useResponsiveLayout();
  return (
    <ResponsiveGrid columns={widgetColumns} gap={sectionGap}>
      {children}
    </ResponsiveGrid>
  );
}
