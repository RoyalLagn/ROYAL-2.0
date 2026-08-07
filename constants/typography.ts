import type { TextStyle } from "react-native";

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

/**
 * RoyalLagn's restrained typography scale.
 *
 * These are role tokens, not a menu of arbitrary sizes. Public editorial
 * surfaces may use the Playfair variants; functional Public, Vendor, and
 * Admin UI stays in Inter. Prefer spacing, weight, tone, and grouping before
 * moving text to a larger role.
 */
export const typeScale = {
  caption: 10,
  metadata: 11,
  label: 11,
  button: 12,
  tab: 12,
  bodyCompact: 12,
  body: 13,
  cardTitle: 16,
  editorialCardTitle: 18,
  sectionTitle: 20,
  pageTitle: 24,
  editorialPageTitle: 26,
  metric: 22,
} as const;

export const typeLeading = {
  caption: 14,
  label: 15,
  metadata: 16,
  button: 16,
  tab: 17,
  bodyCompact: 18,
  body: 20,
  cardTitle: 21,
  editorialCardTitle: 23,
  sectionTitle: 26,
  metric: 28,
  pageTitle: 30,
  editorialPageTitle: 32,
} as const;

/** Non-content glyph sizing. These initials fill avatar artwork and do not
 * participate in screen hierarchy or the accessible content type scale. */
export const decorativeType = {
  avatarInitial: 42,
  avatarInitialLarge: 70,
} as const;

export const typeStyles = {
  pageTitle: {
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.pageTitle,
    lineHeight: typeLeading.pageTitle,
    letterSpacing: -0.45,
  },
  editorialPageTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.editorialPageTitle,
    lineHeight: typeLeading.editorialPageTitle,
    letterSpacing: -0.55,
  },
  sectionTitle: {
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.sectionTitle,
    lineHeight: typeLeading.sectionTitle,
    letterSpacing: -0.25,
  },
  editorialSectionTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.sectionTitle,
    lineHeight: typeLeading.sectionTitle,
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.cardTitle,
    lineHeight: typeLeading.cardTitle,
  },
  editorialCardTitle: {
    fontFamily: fonts.serif.bold,
    fontSize: typeScale.editorialCardTitle,
    lineHeight: typeLeading.editorialCardTitle,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: fonts.sans.regular,
    fontSize: typeScale.body,
    lineHeight: typeLeading.body,
  },
  bodyCompact: {
    fontFamily: fonts.sans.regular,
    fontSize: typeScale.bodyCompact,
    lineHeight: typeLeading.bodyCompact,
  },
  metadata: {
    fontFamily: fonts.sans.regular,
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.metadata,
  },
  label: {
    fontFamily: fonts.sans.semibold,
    fontSize: typeScale.label,
    lineHeight: typeLeading.label,
  },
  button: {
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.button,
    lineHeight: typeLeading.button,
  },
  tab: {
    fontFamily: fonts.sans.semibold,
    fontSize: typeScale.tab,
    lineHeight: typeLeading.tab,
  },
  caption: {
    fontFamily: fonts.sans.medium,
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
  },
  metric: {
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.metric,
    lineHeight: typeLeading.metric,
    fontVariant: ["tabular-nums"],
  },
} satisfies Record<string, TextStyle>;

export type TypographyRole = keyof typeof typeStyles;
