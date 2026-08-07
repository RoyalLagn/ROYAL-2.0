/**
 * Loaded via useFonts in app/_layout.tsx.
 * Use the weight-specific PostScript name as fontFamily and avoid pairing
 * with a conflicting fontWeight (Android often fails to resolve that combo).
 */
export const fonts = {
  sans: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
  serif: {
    regular: "PlayfairDisplay_400Regular",
    medium: "PlayfairDisplay_500Medium",
    semibold: "PlayfairDisplay_600SemiBold",
    bold: "PlayfairDisplay_700Bold",
    boldItalic: "PlayfairDisplay_700Bold_Italic",
  },
} as const;
