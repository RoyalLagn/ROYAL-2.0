const configuredPlayStoreUrl =
  process.env.EXPO_PUBLIC_PLAY_STORE_URL?.trim() ?? "";
const configuredAppUrl =
  process.env.EXPO_PUBLIC_APP_URL?.trim() ?? "";

export const APP_SHARE_CONFIG = {
  title: "RoyalLagn",
  playStoreUrl: configuredPlayStoreUrl,
  appUrl: configuredPlayStoreUrl || configuredAppUrl,
  message: [
    "RoyalLagn",
    "Wedding Marketplace",
    "Download RoyalLagn",
  ].join("\n"),
} as const;
