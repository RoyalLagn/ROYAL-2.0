import { Tabs } from 'expo-router';
import { Home, Grid3X3, Heart, MessageSquareText, User } from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import { MobileTabBar } from '@/components/MobileTabBar';

cssInterop(Home,     { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3,  { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Heart,    { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageSquareText, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(User,     { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function TabsLayout() {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <Tabs
            tabBar={(props) => <MobileTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: isDark ? '#EC4899' : '#E91E63',
                tabBarInactiveTintColor: isDark ? '#AAA0A5' : '#787178',
                tabBarLabelPosition: 'below-icon',
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ focused }) => (
                        <Home
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="Categories"
                options={{
                    title: 'Category',
                    tabBarIcon: ({ focused }) => (
                        <Grid3X3
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="enquiry"
                options={{
                    title: 'Enquiry',
                    tabBarIcon: ({ focused }) => (
                        <MessageSquareText
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="favorites"
                options={{
                    title: 'Favorites',
                    tabBarIcon: ({ focused }) => (
                        <Heart
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                            fill={focused ? 'currentColor' : 'none'}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarIcon: ({ focused }) => (
                        <User
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}
