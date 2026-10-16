import type { Breakpoint, ResponsiveLayout } from "@/types/responsive";
import { typeScale } from "@/constants/typography";
import { Platform } from "react-native";

export const BREAKPOINTS = {
  smallPhone: 360,
  normalPhone: 480,
  smallTablet: 768,
  largeTablet: 900,
  desktop: 1024,
  largeDesktop: 1440,
  ultrawide: 1920,
} as const;

/**
 * Public discovery pages use their wide editorial composition on desktop web
 * and on genuine native tablet windows. Requiring a 600dp short edge keeps a
 * rotated phone on the existing phone layout.
 */
export function isNativeTabletDevice(width: number, height: number) {
  return Platform.OS !== "web" && Math.min(width, height) >= 600;
}

export function isNativeTabletWindow(width: number, height: number) {
  return isNativeTabletDevice(width, height) && width >= BREAKPOINTS.smallTablet;
}

export function isPublicWideLayout(width: number, height: number) {
  return Platform.OS === "web"
    ? width >= 1100
    : isNativeTabletWindow(width, height);
}

/** Workspace sidebar width at tablet and up. Phone keeps the existing full-width layout. */
export function adminSidebarWidth(windowWidth: number) {
  if (windowWidth < BREAKPOINTS.smallTablet) return 0;
  if (windowWidth < 1040) return 76;
  return 286;
}

export function adminContentWidth(windowWidth: number) {
  return Math.max(0, windowWidth - adminSidebarWidth(windowWidth));
}

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
    // Admin/operational cards use DESIGN.md's compact "card-sm" radius (16px)
    // rather than the public/editorial "card"/"card-lg" scale (20-24px):
    // restrained geometry reads as business software, not a marketing surface.
    cardRadius: 16,
    iconSize: isPhone ? 18 : isTablet ? 20 : 22,
    titleSize: typeScale.cardTitle,
    bodySize: typeScale.bodyCompact,
    statisticColumns,
    widgetColumns: isPhone ? 1 : 2,
  };
}
