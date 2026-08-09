// theme.ts
import { vars } from "nativewind";

// ============================================================================
// FONT CONFIGURATION
// ============================================================================
// Each theme can define its own font families. Fonts are loaded in _layout.tsx
// using expo-font and referenced via CSS variables in tailwind.config.js.
//
// Font families:
// - heading: Used for h1-h4 headings
// - body: Used for body text, labels, captions
// - mono: Used for code snippets
// ============================================================================

export interface ThemeFonts {
heading: {
family: string;
weights: Record<string, string>; // weight name -> font file key
};
body: {
family: string;
weights: Record<string, string>;
};
mono: {
family: string;
weights: Record<string, string>;
};
}

// Headings: Playfair Display (loaded in app/_layout.tsx).
// Body/UI: Inter. Mono stays declared for future code surfaces.
export const themeFonts: ThemeFonts = {
heading: {
family: 'PlayfairDisplay',
weights: {
normal: 'PlayfairDisplay_400Regular',
medium: 'PlayfairDisplay_500Medium',
semibold: 'PlayfairDisplay_600SemiBold',
bold: 'PlayfairDisplay_700Bold',
},
},
body: {
family: 'Inter',
weights: {
normal: 'Inter_400Regular',
medium: 'Inter_500Medium',
semibold: 'Inter_600SemiBold',
bold: 'Inter_700Bold',
},
},
mono: {
family: 'JetBrainsMono',
weights: {
normal: 'JetBrainsMono_400Regular',
medium: 'JetBrainsMono_500Medium',
},
},
};


// Helper to convert oklch to RGB space-separated values for Tailwind
// Note: These are approximate RGB conversions from the oklch values
export const lightTheme = vars({
"--radius": "12", // 0.75rem = 12px

// Core semantic colors - Wedding Pink Theme
"--background": "255 255 255", // Clean white canvas
"--foreground": "31 25 28", // Dark warm gray

"--card": "253 242 248", // Pink-50 tinted cards
"--card-foreground": "31 25 28", // Dark text

"--popover": "255 255 255", // White
"--popover-foreground": "31 25 28", // Dark text

"--primary": "233 30 99", // Pink-600 #E91E63
"--primary-foreground": "255 255 255", // White text on pink

"--secondary": "252 231 243", // Pink-100 soft pink background
"--secondary-foreground": "190 24 93", // Pink-700

"--muted": "253 242 248", // Pink-50 very soft pink
"--muted-foreground": "120 113 120", // Warm gray

"--accent": "252 231 243", // Pink-100
"--accent-foreground": "190 24 93", // Pink-700

"--destructive": "220 38 38", // Red

"--border": "251 207 232", // Pink-200
"--input": "252 231 243", // Pink-100
"--ring": "233 30 99", // Pink-600

// Chart colors
"--chart-1": "231 111 81", // oklch(0.646 0.222 41.116)
"--chart-2": "42 157 143", // oklch(0.6 0.118 184.704)
"--chart-3": "38 70 83", // oklch(0.398 0.07 227.392)
"--chart-4": "233 196 106", // oklch(0.828 0.189 84.429)
"--chart-5": "244 162 97", // oklch(0.769 0.188 70.08)

// Sidebar colors
"--sidebar": "250 250 250", // oklch(0.985 0 0)
"--sidebar-foreground": "23 23 23", // oklch(0.145 0 0)
"--sidebar-primary": "24 24 27", // oklch(0.205 0 0)
"--sidebar-primary-foreground": "250 250 250", // oklch(0.985 0 0)
"--sidebar-accent": "244 244 245", // oklch(0.97 0 0)
"--sidebar-accent-foreground": "24 24 27", // oklch(0.205 0 0)
"--sidebar-border": "228 228 231", // oklch(0.922 0 0)
"--sidebar-ring": "161 161 170", // oklch(0.708 0 0)
});

export const darkTheme = vars({
"--radius": "12", // 0.75rem = 12px

// Core semantic colors - Midnight Black
"--background": "7 11 20", // Midnight black #070B14
"--foreground": "245 245 245", // Near white

"--card": "14 20 31", // Raised midnight surface #0E141F
"--card-foreground": "245 245 245", // Light text

"--popover": "17 24 39", // Slightly lighter midnight surface
"--popover-foreground": "245 245 245", // Light text

"--primary": "236 72 153", // Pink-500
"--primary-foreground": "255 255 255", // White

"--secondary": "22 30 46", // Midnight secondary
"--secondary-foreground": "251 207 232", // Pink-200

"--muted": "16 23 36", // Dark midnight muted
"--muted-foreground": "160 160 165", // Muted text

"--accent": "22 30 46", // Midnight accent
"--accent-foreground": "251 207 232", // Pink-200

"--destructive": "248 113 113", // Red

"--border": "35 44 61", // Midnight border
"--input": "24 32 48", // Midnight input
"--ring": "236 72 153", // Pink-500

// Chart colors
"--chart-1": "99 102 241", // oklch(0.488 0.243 264.376)
"--chart-2": "34 197 94", // oklch(0.696 0.17 162.48)
"--chart-3": "244 162 97", // oklch(0.769 0.188 70.08)
"--chart-4": "168 85 247", // oklch(0.627 0.265 303.9)
"--chart-5": "239 68 68", // oklch(0.645 0.246 16.439)

// Sidebar colors
"--sidebar": "14 20 31",
"--sidebar-foreground": "250 250 250", // oklch(0.985 0 0)
"--sidebar-primary": "99 102 241", // oklch(0.488 0.243 264.376)
"--sidebar-primary-foreground": "250 250 250", // oklch(0.985 0 0)
"--sidebar-accent": "22 30 46",
"--sidebar-accent-foreground": "250 250 250", // oklch(0.985 0 0)
"--sidebar-border": "35 44 61",
"--sidebar-ring": "82 82 82", // oklch(0.439 0 0)
});

// Admin workspaces intentionally use a calmer SaaS palette than the
// media-forward customer and vendor surfaces. These values remap the existing
// semantic tokens inside AdminWorkspaceShell; they do not create a parallel
// component theme or change the RoyalLagn brand action color.
export const adminLightTheme = vars({
"--background": "248 249 251", // Neutral workspace #F8F9FB
"--foreground": "24 27 35", // Charcoal #181B23
"--card": "255 255 255",
"--card-foreground": "24 27 35",
"--popover": "255 255 255",
"--popover-foreground": "24 27 35",
"--primary": "233 30 99",
"--primary-foreground": "255 255 255",
"--secondary": "244 246 248",
"--secondary-foreground": "45 50 60",
"--muted": "244 246 248",
"--muted-foreground": "103 110 124",
"--accent": "253 242 248",
"--accent-foreground": "190 24 93",
"--destructive": "220 38 38",
"--border": "226 229 234",
"--input": "226 229 234",
"--ring": "233 30 99",
"--chart-1": "233 30 99",
"--chart-2": "37 99 235",
"--chart-3": "22 163 74",
"--chart-4": "217 119 6",
"--chart-5": "124 58 237",
});

export const adminDarkTheme = vars({
"--background": "7 11 20",
"--foreground": "245 245 245",
"--card": "14 20 31",
"--card-foreground": "245 245 245",
"--popover": "17 24 39",
"--popover-foreground": "245 245 245",
"--primary": "236 72 153",
"--primary-foreground": "255 255 255",
"--secondary": "22 30 46",
"--secondary-foreground": "229 231 235",
"--muted": "16 23 36",
"--muted-foreground": "160 160 165",
"--accent": "37 22 32",
"--accent-foreground": "251 207 232",
"--destructive": "248 113 113",
"--border": "35 44 61",
"--input": "35 44 61",
"--ring": "236 72 153",
"--chart-1": "236 72 153",
"--chart-2": "96 165 250",
"--chart-3": "74 222 128",
"--chart-4": "251 191 36",
"--chart-5": "167 139 250",
});

export const adminPalette = {
  canvas: "#F8F9FB",
  surface: "#FFFFFF",
  surfaceSubtle: "#F4F6F8",
  border: "#E2E5EA",
  text: "#181B23",
  textSecondary: "#676E7C",
  textMuted: "#6F7785",
  brand: "#E91E63",
  brandSubtle: "#FDF2F8",
  success: "#168A5B",
  successSubtle: "#ECFDF5",
  warning: "#B76A00",
  warningSubtle: "#FFF7E6",
  error: "#DC2626",
  errorSubtle: "#FEF2F2",
  info: "#2563EB",
  infoSubtle: "#EFF6FF",
} as const;
