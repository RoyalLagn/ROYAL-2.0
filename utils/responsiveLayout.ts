import type { Breakpoint, ResponsiveLayout } from "@/types/responsive";

export const BREAKPOINTS = {
  smallPhone: 360,
  normalPhone: 480,
  smallTablet: 768,
  largeTablet: 900,
  desktop: 1024,
  largeDesktop: 1440,
  ultrawide: 1920,
} as const;

export function breakpointFor(width: number): Breakpoint {
  if (width < BREAKPOINTS.smallPhone) return "xs";
  if (width < BREAKPOINTS.normalPhone) return "sm";
  if (width < BREAKPOINTS.smallTablet) return "phone";
  if (width < BREAKPOINTS.largeTablet) return "tablet";
  if (width < BREAKPOINTS.desktop) return "tabletLarge";
  if (width < BREAKPOINTS.largeDesktop) return "desktop";
  if (width < BREAKPOINTS.ultrawide) return "desktopLarge";
  return "ultrawide";
}

export function createResponsiveLayout(
  width: number,
  height: number,
): ResponsiveLayout {
  const breakpoint = breakpointFor(width);
  const isPhone = width < BREAKPOINTS.smallTablet;
  const isTablet = width >= BREAKPOINTS.smallTablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const statisticColumns =
    breakpoint === "xs" ? 1
      : isPhone ? 2
        : isTablet ? 3
          : breakpoint === "desktop" ? 4
            : breakpoint === "ultrawide" ? 6
              : 5;

  return {
    width,
    height,
    breakpoint,
    isPhone,
    isTablet,
    isDesktop,
    isLandscape: width > height,
    contentPadding: breakpoint === "xs" ? 12 : isPhone ? 16 : isTablet ? 24 : 32,
    sectionGap: isPhone ? 14 : isTablet ? 18 : 20,
    cardPadding: breakpoint === "xs" ? 14 : isPhone ? 16 : 20,
    cardRadius: isPhone ? 20 : 24,
    iconSize: isPhone ? 18 : isTablet ? 20 : 22,
    titleSize: isPhone ? 17 : isTablet ? 18 : 20,
    bodySize: isPhone ? 12 : 14,
    statisticColumns,
    widgetColumns: isPhone ? 1 : 2,
  };
}
