import { Stack } from 'expo-router';
import '@/global.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Pressable, View, Text, StyleSheet } from 'react-native';
import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { typeScale } from "@/constants/typography";
// Import each weight from its own submodule rather than the package barrel
// (`@expo-google-fonts/inter`/`@expo-google-fonts/playfair-display`). The
// barrel's index.js unconditionally `require()`s every weight file it
// exports, so destructuring from it still bundles all 18 Inter + 12
// Playfair .ttf assets into production output even though only 9 weights
// are ever used. Per-weight imports pull in only the files below.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { PlayfairDisplay_400Regular } from '@expo-google-fonts/playfair-display/400Regular';
import { PlayfairDisplay_500Medium } from '@expo-google-fonts/playfair-display/500Medium';
import { PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display/600SemiBold';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display/700Bold';
import { PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display/700Bold_Italic';
import * as SplashScreen from 'expo-splash-screen';
import { FavoritesProvider } from '@/context/FavoritesContext';
import VendorBottomNav from '@/components/vendor/VendorBottomNav';
import { LocationProvider } from '@/context/LocationContext';
import { ReviewRatingsProvider } from '@/context/ReviewRatingsContext';
import { PublicAuthProvider } from '@/context/PublicAuthContext';
import { VendorSessionProvider } from '@/context/VendorSessionContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { AdminRouteGuard } from '@/components/auth/AdminRouteGuard';
import { VendorAuthProvider } from '@/context/VendorAuthContext';
import { VendorRouteGuard } from '@/components/auth/VendorRouteGuard';
import { ResponsiveLayoutProvider } from '@/context/ResponsiveLayoutContext';
import { CategoryProvider } from '@/context/CategoryContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { VendorNotificationProvider } from '@/context/VendorNotificationContext';
import { AdminWorkspaceShell } from '@/components/admin/AdminWorkspaceShell';
import PushTokenRegistrar from '@/components/notifications/PushTokenRegistrar';
import { SCREEN_TRANSITION } from '@/utils/motion';
import { useWebNavigationFocusSafety } from '@/hooks/useWebNavigationFocusSafety';
import { installWebAlert } from '@/utils/webAlert';

// react-native-web leaves Alert unimplemented, which silences every
// Alert.alert in the app on web. Supply it before any screen renders.
installWebAlert();

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Caught application error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error.message || 'Unknown error'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ error: null })}
            style={styles.errorRetry}
          >
            <Text style={styles.errorRetryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function WebNavigationFocusSafety() {
  useWebNavigationFocusSafety();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_500Medium,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
  });
  // Web loads these 9 weights as separate network requests (~1.1MB combined);
  // blocking first paint on all of them was confirmed via a production
  // Lighthouse trace to be the dominant contributor to LCP (font requests
  // saturating the connection ahead of the hero image). Render immediately
  // on web with the platform fallback font stack -- text re-renders with the
  // real family the moment each FontFace resolves, the same trade-off
  // `font-display: swap` makes. Native bundles these fonts locally (no
  // network cost, near-instant), so the original blocking wait is kept
  // there to avoid any visible flash of the fallback font.
  const fontsReady = Platform.OS === 'web' || fontsLoaded || fontError;

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsReady]);

  if (!fontsReady) {
    return (
      <View style={styles.fontLoading}>
        <ActivityIndicator color="#E91E63" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <WebNavigationFocusSafety />
      <PublicAuthProvider>
          <CategoryProvider>
            <AdminAuthProvider>
              <VendorAuthProvider>
                <NotificationProvider>
                  <VendorSessionProvider>
                    <VendorNotificationProvider>
                      <SubscriptionProvider>
                        <FavoritesProvider>
                          <ReviewRatingsProvider>
                            <LocationProvider>
                              <ThemeProvider>
                                <SafeAreaProvider>
                                  <ResponsiveLayoutProvider>
                                    <PushTokenRegistrar />
                                    <StatusBar style="dark" backgroundColor="#FFFFFF" translucent={false} />
                                    <View className="bg-background" style={styles.app}>
                                      <AdminWorkspaceShell>
                                        <View style={styles.stack}>
                                          <AdminRouteGuard>
                                            <VendorRouteGuard>
                                              {/* A single, app-wide transition preset instead of
                                                  per-screen configuration -- see utils/motion.ts
                                                  for why `fade_from_bottom` (soft fade + small
                                                  upward settle, native-driven) was chosen over a
                                                  custom reanimated screen wrapper. Every one of the
                                                  ~90 screens under app/ inherits this automatically;
                                                  back navigation reverses it natively. */}
                                              <Stack screenOptions={{ headerShown: false, animation: SCREEN_TRANSITION }} />
                                            </VendorRouteGuard>
                                          </AdminRouteGuard>
                                        </View>
                                      </AdminWorkspaceShell>
                                      <VendorBottomNav />
                                    </View>
                                  </ResponsiveLayoutProvider>
                                </SafeAreaProvider>
                              </ThemeProvider>
                            </LocationProvider>
                          </ReviewRatingsProvider>
                        </FavoritesProvider>
                      </SubscriptionProvider>
                    </VendorNotificationProvider>
                  </VendorSessionProvider>
                </NotificationProvider>
              </VendorAuthProvider>
            </AdminAuthProvider>
          </CategoryProvider>
        </PublicAuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  stack: { flex: 1, minHeight: 0, zIndex: 0 },
  fontLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: typeScale.sectionTitle,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000',
  },
  errorText: {
    fontSize: typeScale.body,
    color: '#666',
    textAlign: 'center',
  },
  errorRetry: {
    minHeight: 44,
    marginTop: 20,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
  },
  errorRetryText: {
    color: '#fff',
    fontSize: typeScale.body,
    fontWeight: '700',
  },
});
