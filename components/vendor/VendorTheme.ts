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

const lightVendorColors: VendorThemeColors = {
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
};

export const vendorTheme: Record<"light" | "dark", VendorThemeColors> = {
  light: lightVendorColors,
  dark: lightVendorColors,
};

