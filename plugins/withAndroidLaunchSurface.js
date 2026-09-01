const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Android 12+ always shows a system launch surface before React Native starts.
 * Keep that surface on-brand, but omit its centered icon because the app
 * immediately presents the full-screen StartupSplash artwork.
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
      icon._ = "@android:color/transparent";
    }

    return config;
  });
};
