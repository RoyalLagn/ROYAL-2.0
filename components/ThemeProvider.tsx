// ThemeProvider.tsx
import { useColorScheme } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { lightTheme, darkTheme } from '../theme';

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
  const [colorScheme, setColorScheme] = useState<AppColorScheme>('light');

  useEffect(() => {
    const restoreTheme = async () => {
      const saved = Platform.OS === 'web'
        ? globalThis.localStorage?.getItem(THEME_KEY)
        : await SecureStore.getItemAsync(THEME_KEY);
      if (saved === 'light' || saved === 'dark') setColorScheme(saved);
    };
    restoreTheme().catch(() => undefined);
  }, []);

  useEffect(() => {
    setNativeWindColorScheme(colorScheme);
  }, [colorScheme, setNativeWindColorScheme]);

  const toggleColorScheme = useCallback(() => {
    setColorScheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(THEME_KEY, next);
      else SecureStore.setItemAsync(THEME_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const contextValue = useMemo(
    () => ({ colorScheme, toggleColorScheme }),
    [colorScheme, toggleColorScheme]
  );

  const themeVars = colorScheme === 'dark' ? darkTheme : lightTheme;

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
    root.classList.remove('light', 'dark');
    if (colorScheme) root.classList.add(colorScheme);
    return () => {
      for (const key of Object.keys(vars)) {
        if (prev[key]) root.style.setProperty(key, prev[key]);
        else root.style.removeProperty(key);
      }
    };
  }, [themeVars, colorScheme]);

  return (
    <AppThemeContext.Provider value={contextValue}>
      <View
        style={[
          themeVars,
          { flex: 1, backgroundColor: colorScheme === 'dark' ? '#070B14' : '#FFFBFC' },
        ]}
        className={`${colorScheme} flex-1 bg-background`}
      >
        {children}
      </View>
    </AppThemeContext.Provider>
  );
}
