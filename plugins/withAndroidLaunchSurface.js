const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Android 12+ always shows a system launch surface before React Native starts.
 * Keep the mandatory Android launch surface on the canonical app icon so it
 * hands directly to the application without a second branded splash screen.
 */
module.exports = function withAndroidLaunchSurface(config) {
  return withAndroidStyles(config, (config) => {
    const splashStyle = config.modResults.resources.style?.find(
      (style) => style.$?.name === "Theme.App.SplashScreen",
    );

    const icon = splashStyle?.item?.find(
      (item) => item.$?.name === "windowSplashScreenAnimatedIcon",
    );

    if (icon) {
      icon._ = "@drawable/splashscreen_logo_inset";
    }

    return config;
  });
};
