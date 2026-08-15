import { brandPalette } from "@/constants/brandPalette";

export type VendorThemeColors = {
  background: string;
  surface: string;
  surfaceSoft: string;
  text: string;
  muted: string;
  border: string;
  pink: string;
  success: string;
  warning: string;
  destructive: string;
  onPrimary: string;
  shadow: string;
};

export const vendorTheme: Record<"light" | "dark", VendorThemeColors> = {
  light: {
    background: brandPalette.light.background,
    surface: brandPalette.light.card,
    surfaceSoft: brandPalette.light.actionTint,
    text: "#191418",
    muted: brandPalette.light.mutedForeground,
    border: brandPalette.light.border,
    pink: brandPalette.light.primary,
    success: brandPalette.light.success,
    warning: brandPalette.light.warning,
    destructive: brandPalette.light.destructive,
    onPrimary: brandPalette.light.primaryForeground,
    shadow: "#7D3D58",
  },
  dark: {
    background: "#171417", surface: "#211D20", surfaceSoft: "#2A2025",
    text: "#FFF8FB", muted: "#B9AEB4", border: "#3D3036", pink: "#FF4F8B",
    success: brandPalette.dark.success,
    warning: brandPalette.dark.warning,
    destructive: brandPalette.dark.destructive,
    onPrimary: brandPalette.dark.primaryForeground,
    shadow: "#000000",
  },
};
