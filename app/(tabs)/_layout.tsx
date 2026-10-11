import { Tabs } from 'expo-router';
import { Gift, Heart, Home, Grid3X3, Ticket, User } from 'lucide-react-native';
import { cssInterop, useColorScheme } from 'nativewind';
import { MobileTabBar } from '@/components/MobileTabBar';

cssInterop(Home,     { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Grid3X3,  { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Gift,     { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Heart, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Ticket,   { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(User,     { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function TabsLayout() {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <Tabs
            backBehavior="firstRoute"
            initialRouteName="index"
            tabBar={(props) => <MobileTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                tabBarHideOnKeyboard: true,
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
                name="referral"
                options={{
                    title: 'Referral',
                    tabBarIcon: ({ focused }) => (
                        <Gift
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="bookings"
                options={{
                    title: 'Bookings',
                    tabBarIcon: ({ focused }) => (
                        <Ticket
                            className={focused ? 'text-primary' : 'text-muted-foreground'}
                            size={22}
                            strokeWidth={focused ? 2.5 : 2}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="favorites"
                options={{ href: null }}
            />
            <Tabs.Screen
                name="enquiry"
                options={{ href: null }}
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
