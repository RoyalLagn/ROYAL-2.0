import { Platform, Pressable } from 'react-native';
import { Sun, Moon } from 'lucide-react-native';
import { useAppTheme } from './ThemeProvider';

export function ThemeToggle({ size = 24 }: { size?: number }) {
  const { colorScheme, toggleColorScheme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Dark mode"
      accessibilityState={{ checked: colorScheme === 'dark' }}
      className="w-12 h-12 rounded-full items-center justify-center hover:bg-muted active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors duration-200"
      style={{ backgroundColor: colorScheme === 'dark' ? '#151D2A' : '#FFF5F8' }}
      android_ripple={Platform.OS === 'android' ? { color: 'rgba(233,30,99,0.12)', borderless: true, radius: 24 } : undefined}
      onPress={toggleColorScheme}
    >
      {colorScheme === 'dark' ? (
        <Sun color="#F8F2F5" size={size} />
      ) : (
        <Moon color="#17111D" size={size} />
      )}
    </Pressable>
  );
}
