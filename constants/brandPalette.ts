/**
 * Hex mirrors of the CSS-variable palette in theme.ts for StyleSheet usage
 * (NativeWind className already reads --primary etc.; StyleSheet cannot).
 * Prefer these over local hex literals on Home and shared listing chrome.
 */
export const brandPalette = {
  light: {
    background: "#FFFBFC",
    foreground: "#1F191C",
    card: "#FFFFFF",
    cardForeground: "#1F191C",
    primary: "#E91E63",
    /** Darker pink for small text / AA contrast on light backgrounds (~5.1:1 on white). */
    primaryStrong: "#BE185D",
    primaryForeground: "#FFFFFF",
    secondary: "#FCE7F3",
    secondaryForeground: "#BE185D",
    muted: "#FDF2F8",
    mutedForeground: "#787178",
    accent: "#FCE7F3",
    accentForeground: "#BE185D",
    destructive: "#DC2626",
    border: "#FBCFE8",
    input: "#FCE7F3",
    ring: "#E91E63",
    /** Soft pink frame fill for category tiles */
    frameFill: "#FFF5F8",
    /** Soft pink frame border — one tone for the whole category row */
    frameBorder: "#F2D9E1",
    rating: "#FACC15",
    ratingForeground: "#B45309",
    overlayInk: "rgba(27,25,27,0.72)",
  },
  dark: {
    background: "#070B14",
    foreground: "#F5F5F5",
    card: "#0E141F",
    cardForeground: "#F5F5F5",
    primary: "#E91E63",
    primaryStrong: "#F9A8D4",
    primaryForeground: "#FFFFFF",
    secondary: "#161E2E",
    secondaryForeground: "#FBCFE8",
    muted: "#101724",
    mutedForeground: "#A0A0A5",
    accent: "#161E2E",
    accentForeground: "#FBCFE8",
    destructive: "#F87171",
    border: "#232C3D",
    input: "#182030",
    ring: "#E91E63",
    frameFill: "#201B23",
    frameBorder: "#5A3A48",
    rating: "#FACC15",
    ratingForeground: "#FACC15",
    overlayInk: "rgba(27,25,27,0.72)",
  },
} as const;

export type BrandScheme = keyof typeof brandPalette;

export function brandColors(dark: boolean) {
  return dark ? brandPalette.dark : brandPalette.light;
}
