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

export const darkTheme = lightTheme;

// Admin workspaces intentionally use a calmer SaaS palette than the
// media-forward customer and vendor surfaces. These values remap the existing
// semantic tokens inside AdminWorkspaceShell; they do not create a parallel
// component theme or change the RoyalLagn brand action color.
export const adminLightTheme = vars({
"--background": "245 248 252", // Royal workspace #F5F8FC
"--foreground": "2 29 70", // Deep royal navy #021D46
"--card": "255 255 255",
"--card-foreground": "2 29 70",
"--popover": "255 255 255",
"--popover-foreground": "2 29 70",
"--primary": "6 43 99",
"--primary-foreground": "255 255 255",
"--secondary": "238 247 255",
"--secondary-foreground": "6 43 99",
"--muted": "241 246 252",
"--muted-foreground": "63 93 130",
"--accent": "255 248 234",
"--accent-foreground": "184 117 0",
"--destructive": "220 38 38",
"--border": "215 225 238",
"--input": "215 225 238",
"--ring": "6 43 99",
"--chart-1": "8 120 232",
"--chart-2": "197 138 24",
"--chart-3": "22 163 74",
"--chart-4": "217 119 6",
"--chart-5": "124 58 237",
});

export const adminDarkTheme = adminLightTheme;

export const adminPalette = {
  canvas: "#F5F8FC",
  surface: "#FFFFFF",
  surfaceSubtle: "#F1F6FC",
  border: "#D7E1EE",
  text: "#021D46",
  textSecondary: "#3F5D82",
  textMuted: "#647B98",
  brand: "#062B63",
  brandSubtle: "#EEF7FF",
  success: "#168A5B",
  successSubtle: "#ECFDF5",
  warning: "#B76A00",
  warningSubtle: "#FFF7E6",
  error: "#DC2626",
  errorSubtle: "#FEF2F2",
  info: "#0878E8",
  infoSubtle: "#EEF7FF",
} as const;
