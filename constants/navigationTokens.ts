import { brandPalette } from "@/constants/brandPalette";

/**
 * Shared visual tokens for RoyalLagn's floating customer and vendor bottom
 * navigation. The two bars keep their own routes and interaction behavior;
 * only their intentionally identical geometry and chrome live here.
 */
export const floatingNavigationTokens = {
  baseHeight: 58,
  tabletMaxWidth: 720,
  horizontalInset: 10,
  barRadius: 31,
  indicatorInset: 5,
  indicatorRadius: 25,
  centerInactiveLight: "#E93370",
  centerInactiveDark: "#D92B69",
  shadow: "#573341",
  light: {
    canvas: brandPalette.light.background,
    surface: brandPalette.light.background,
    border: "#F3D4DF",
    indicator: "#FFF0F6",
  },
  dark: {
    canvas: brandPalette.dark.background,
    surface: brandPalette.dark.card,
    border: "#5A2B3F",
    indicator: "rgba(236,72,153,.13)",
  },
  admin: {
    lightCanvas: brandPalette.light.background,
    darkCanvas: "#1C1917",
  },
  customerTabs: {
    light: {
      active: brandPalette.light.primaryStrong,
      inactive: "#52525B",
    },
    dark: {
      active: brandPalette.dark.primaryStrong,
      inactive: brandPalette.dark.mutedForeground,
    },
  },
  vendorTabs: {
    light: {
      active: brandPalette.light.primary,
      inactive: "#6B6B73",
    },
    dark: {
      active: "#EC4899",
      inactive: "#AAA0A5",
    },
  },
} as const;

export function floatingNavigationColors(_dark?: boolean) {
  return floatingNavigationTokens.light;
}

