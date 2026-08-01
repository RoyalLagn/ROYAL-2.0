import { Stack } from 'expo-router';
import '@/global.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import React from 'react';
import { FavoritesProvider } from '@/context/FavoritesContext';
import VendorBottomNav from '@/components/vendor/VendorBottomNav';
import { LocationProvider } from '@/context/LocationContext';
import { ReviewRatingsProvider } from '@/context/ReviewRatingsContext';
import { PublicAuthProvider } from '@/context/PublicAuthContext';
import { VendorSessionProvider } from '@/context/VendorSessionContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { AdminRouteGuard } from '@/components/auth/AdminRouteGuard';
import { ResponsiveLayoutProvider } from '@/context/ResponsiveLayoutContext';
import { CategoryProvider } from '@/context/CategoryContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { VendorNotificationProvider } from '@/context/VendorNotificationContext';
import { AdminWorkspaceShell } from '@/components/admin/AdminWorkspaceShell';

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

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <PublicAuthProvider>
          <CategoryProvider>
            <AdminAuthProvider>
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
                                  <StatusBar style="dark" backgroundColor="#FFFFFF" translucent={false} />
                                  <View className="bg-background" style={styles.app}>
                                    <AdminWorkspaceShell>
                                      <View style={styles.stack}>
                                        <AdminRouteGuard>
                                          <Stack screenOptions={{ headerShown: false }} />
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
            </AdminAuthProvider>
          </CategoryProvider>
        </PublicAuthProvider>
    </ErrorBoundary>
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
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000',
  },
  errorText: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: '700',
  },
});
