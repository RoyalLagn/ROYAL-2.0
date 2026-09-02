const { withAndroidStyles } = require("expo/config-plugins");

/**
 * Android 12+ always shows a system launch surface before React Native starts.
 * Use the same branded artwork as the native splash so the mandatory Android
 * launch surface is never a blank pink frame while React Native boots.
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
      icon._ = "@drawable/splashscreen_logo";
    }

    return config;
  });
};
