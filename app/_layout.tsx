import { Stack, usePathname, useRouter } from 'expo-router';
import '@/global.css';
import { ThemeProvider, useAppTheme } from '@/components/ThemeProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, View, Text, StyleSheet } from 'react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { typeScale } from "@/constants/typography";
import { brandPalette } from "@/constants/brandPalette";
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
import { LocationProvider } from '@/context/LocationContext';
import { ReviewRatingsProvider } from '@/context/ReviewRatingsContext';
import { PublicAuthProvider } from '@/context/PublicAuthContext';
import { VendorSessionProvider } from '@/context/VendorSessionContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { AdminRouteGuard } from '@/components/auth/AdminRouteGuard';
import { VendorAuthProvider, useVendorAuth } from '@/context/VendorAuthContext';
import { VendorRouteGuard } from '@/components/auth/VendorRouteGuard';
import { ResponsiveLayoutProvider } from '@/context/ResponsiveLayoutContext';
import { CategoryProvider } from '@/context/CategoryContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { VendorNotificationProvider } from '@/context/VendorNotificationContext';
import { AdminWorkspaceShell } from '@/components/admin/AdminWorkspaceShell';
import { VendorWorkspaceShell } from '@/components/vendor/VendorWorkspaceShell';
import PushTokenRegistrar from '@/components/notifications/PushTokenRegistrar';
import ReferralAttributionTracker from '@/components/referral/ReferralAttributionTracker';
import { SCREEN_TRANSITION } from '@/utils/motion';
import { useWebNavigationFocusSafety } from '@/hooks/useWebNavigationFocusSafety';
import { installAppAlert } from '@/utils/webAlert';
import AppDialogProvider from '@/components/dialogs/AppDialogProvider';
import PageLoader, { PageLoaderProvider } from '@/components/loading/PageLoader';
import { StartupSplash } from '@/components/loading/StartupSplash';
import { AppFeedbackProvider } from '@/context/AppFeedbackContext';
import PublicDocumentMeta from '@/components/seo/PublicDocumentMeta';

// Web gets the RoyalLagn dialog; native platforms retain their system alert.
installAppAlert();

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
        <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error.message || 'Unknown error'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try loading the app again"
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

function ThemeAwareStatusBar() {
  return (
    <StatusBar
      style="dark"
      backgroundColor={Platform.OS === 'android' ? 'transparent' : brandPalette.light.background}
      translucent={Platform.OS === 'android'}
    />
  );
}

/**
 * Expo Router always boots the native app through the public tabs route.
 * Once the persisted Supabase session has been resolved, move an approved
 * vendor back into their workspace. This is deliberately a one-time startup
 * decision and only applies to the default home route, so notification links
 * and other explicit deep links keep their own destination.
 */
function VendorStartupRedirect({ onReady }: { onReady: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, isVendorAuthenticated } = useVendorAuth();
  const startupDecisionMade = React.useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || loading || startupDecisionMade.current) return;
    startupDecisionMade.current = true;
    if (isVendorAuthenticated && (pathname === '/' || pathname === '/index')) {
      router.replace('/vendor-dashboard');
    }
    onReady();
  }, [isVendorAuthenticated, loading, onReady, pathname, router]);

  return null;
}

function AppNavigator() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: SCREEN_TRANSITION,
        gestureEnabled: true,
        contentStyle: { backgroundColor: brandPalette.light.background },
      }}
    />
  );
}

export default function RootLayout() {
  const [startupSplashVisible, setStartupSplashVisible] = useState(
    () => Platform.OS !== 'web',
  );
  const [startupSplashMinimumElapsed, setStartupSplashMinimumElapsed] = useState(
    () => Platform.OS === 'web',
  );
  const [startupRoutingReady, setStartupRoutingReady] = useState(
    () => Platform.OS === 'web',
  );
  const [webBootLoading, setWebBootLoading] = useState(
    () => Platform.OS === 'web',
  );
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

  const revealStartupSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  const finishStartupSplash = useCallback(() => {
    setStartupSplashMinimumElapsed(true);
  }, []);

  const finishStartupRouting = useCallback(() => {
    setStartupRoutingReady(true);
  }, []);

  useEffect(() => {
    if (startupSplashMinimumElapsed && startupRoutingReady) {
      setStartupSplashVisible(false);
    }
  }, [startupRoutingReady, startupSplashMinimumElapsed]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !fontsReady) return;
    SplashScreen.hideAsync().catch(() => undefined);
    const frame = requestAnimationFrame(() => setWebBootLoading(false));
    return () => cancelAnimationFrame(frame);
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <PageLoaderProvider suppressed={startupSplashVisible}>
      <ErrorBoundary>
          <WebNavigationFocusSafety />
          <PublicDocumentMeta />
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
                                <AppDialogProvider>
                                  <SafeAreaProvider>
                                    <AppFeedbackProvider>
                                      <ResponsiveLayoutProvider>
                                        <PushTokenRegistrar />
                                        <ReferralAttributionTracker />
                                        <VendorStartupRedirect onReady={finishStartupRouting} />
                                        <ThemeAwareStatusBar />
                                        <View className="bg-background" style={styles.app}>
                                          <AdminWorkspaceShell>
                                            <VendorWorkspaceShell>
                                              <View style={styles.stack}>
                                                <AdminRouteGuard>
                                                  <VendorRouteGuard>
                                                  <AppNavigator />
                                                  </VendorRouteGuard>
                                                </AdminRouteGuard>
                                              </View>
                                            </VendorWorkspaceShell>
                                          </AdminWorkspaceShell>
                                        </View>
                                      </ResponsiveLayoutProvider>
                                    </AppFeedbackProvider>
                                  </SafeAreaProvider>
                                </AppDialogProvider>
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
      {startupSplashVisible ? (
        <StartupSplash
          onReady={revealStartupSplash}
          onFinish={finishStartupSplash}
        />
      ) : null}
      {webBootLoading ? <PageLoader /> : null}
    </PageLoaderProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  stack: { flex: 1, minHeight: 0, zIndex: 0 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: brandPalette.light.background,
  },
  errorTitle: {
    fontSize: typeScale.sectionTitle,
    fontWeight: 'bold',
    marginBottom: 10,
    color: brandPalette.light.foreground,
  },
  errorText: {
    fontSize: typeScale.body,
    color: brandPalette.light.mutedForeground,
    textAlign: 'center',
  },
  errorRetry: {
    minHeight: 48,
    marginTop: 20,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandPalette.light.primary,
  },
  errorRetryText: {
    color: brandPalette.light.primaryForeground,
    fontSize: typeScale.body,
    fontWeight: '700',
  },
});
