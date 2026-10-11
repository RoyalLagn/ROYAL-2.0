// ThemeProvider.tsx
import { useColorScheme } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightTheme } from '../theme';
import { brandPalette } from '@/constants/brandPalette';

interface ThemeProviderProps {
  children: React.ReactNode;
}

type AppColorScheme = 'light' | 'dark';

type AppThemeContextValue = {
  colorScheme: AppColorScheme;
  toggleColorScheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const THEME_KEY = 'royallagn-color-scheme';

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }

  return context;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { setColorScheme: setNativeWindColorScheme } = useColorScheme();
  const colorScheme: AppColorScheme = 'light';

  useEffect(() => {
    // Purge obsolete theme preference if present to prevent any stale dark mode state
    const cleanupStoredTheme = async () => {
      try {
        if (Platform.OS === 'web') {
          globalThis.localStorage?.removeItem(THEME_KEY);
        } else {
          await SecureStore.deleteItemAsync(THEME_KEY);
        }
      } catch {
        // Silently ignore if not found or restricted
      }
    };
    cleanupStoredTheme().catch(() => undefined);
  }, []);

  useEffect(() => {
    setNativeWindColorScheme('light');
  }, [setNativeWindColorScheme]);

  const toggleColorScheme = useCallback(() => {
    // No-op: Light mode is the permanent theme
  }, []);

  const contextValue = useMemo(
    () => ({ colorScheme, toggleColorScheme }),
    [colorScheme, toggleColorScheme]
  );

  const themeVars = lightTheme;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const root = document.documentElement;
    const vars: Record<string, string> =
      (themeVars as any).__cssVars ?? themeVars;
    const prev: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      prev[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, String(value));
    }
    root.classList.remove('dark');
    root.classList.add('light');
    return () => {
      for (const key of Object.keys(vars)) {
        if (prev[key]) root.style.setProperty(key, prev[key]);
        else root.style.removeProperty(key);
      }
    };
  }, [themeVars]);

  return (
    <AppThemeContext.Provider value={contextValue}>
      <View
        style={[
          themeVars,
          {
            flex: 1,
            backgroundColor: brandPalette.light.background,
          },
        ]}
        className="light flex-1 bg-background"
      >
        {children}
      </View>
    </AppThemeContext.Provider>
  );
}
