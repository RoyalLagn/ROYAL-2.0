import { Stack } from 'expo-router';
import '@/global.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, Platform } from 'react-native';
import React, { useState, useEffect } from 'react';
import { FavoritesProvider } from '@/context/FavoritesContext';
import VendorBottomNav from '@/components/vendor/VendorBottomNav';
import { LocationProvider } from '@/context/LocationContext';

export const unstable_settings = {
  initialRouteName: "DashboardCenter",
};

// Error Boundary Component
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // window.addEventListener is web-only — it does not exist on native and
    // will throw "TypeError: window.addEventListener is not a function".
    if (Platform.OS !== 'web') return;

    const handleError = (error: ErrorEvent) => {
      console.error('Caught error:', error);
      setHasError(true);
      setError(error.error);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error?.message || 'Unknown error'}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <FavoritesProvider>
        <LocationProvider>
          <ThemeProvider>
            <SafeAreaProvider>
              <StatusBar style="auto" />
              <View className="bg-background" style={styles.app}>
                <View style={styles.stack}>
                  <Stack screenOptions={{ headerShown: false }} />
                </View>
                <VendorBottomNav />
              </View>
            </SafeAreaProvider>
          </ThemeProvider>
        </LocationProvider>
      </FavoritesProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  stack: { flex: 1, minHeight: 0 },
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
});
