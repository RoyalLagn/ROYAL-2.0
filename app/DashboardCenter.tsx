import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { ArrowRight, Building2, Shield, User } from "lucide-react-native";
import { AuthAlert } from "@/components/auth/AuthPrimitives";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import {
  resolveSelectedRole,
  type AuthenticationRole,
} from "@/services/authNavigation";

type LoginOption = {
  id: AuthenticationRole;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  /** Where "New here? Sign Up" opens for this role. Admin accounts are
   * created by another admin, not self-service, so admin has none. */
  signup?: { pathname: "/Login" | "/VendorAuth"; label: string };
};

const loginOptions: LoginOption[] = [
  {
    id: "public",
    title: "Public Login",
    description: "Browse vendors, explore categories, and plan your wedding",
    icon: User,
    color: "#E91E63",
    signup: { pathname: "/Login", label: "New here? Sign Up" },
  },
  {
    id: "vendor",
    title: "Vendor Login",
    description: "Manage your business, profile, and services",
    icon: Building2,
    color: "#F59E0B",
    signup: { pathname: "/VendorAuth", label: "New vendor? Sign Up" },
  },
  {
    id: "admin",
    title: "Admin Login",
    description: "Platform administration and analytics",
    icon: Shield,
    color: "#3B82F6",
  },
];

// This is only the role-selection page. It must never resolve or redirect
// a Vendor session on its own -- Vendor Login always opens /VendorAuth
// (see resolveSelectedRole below, which short-circuits role === "vendor"),
// and every other Vendor destination is decided exactly once by
// resolveVendorDestination(), called from VendorAuth / BecomeVendor /
// VendorAuthStatus / the Vendor route guard -- never from here.
export default function DashboardCenter() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const [resolvingRole, setResolvingRole] = useState<AuthenticationRole | null>(null);
  const [error, setError] = useState("");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const selectRole = async (role: AuthenticationRole) => {
    if (resolvingRole) return;
    setResolvingRole(role);
    setError("");
    try {
      const destination = await resolveSelectedRole(role);
      if (router.canDismiss()) router.dismissAll();
      router.replace(destination as never);
    } catch {
      setError("We couldn’t check your session. Check your connection and try again.");
    } finally {
      setResolvingRole(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <AuthBackButton fallbackRoute="/(tabs)" />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 68,
          paddingBottom: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 440 }}>
          <View className="items-center mb-9">
            <RoyalLagnLogo width={340} height={102} scale={2.2} />
            <Text className="text-foreground text-[22px] font-bold mt-3">Choose your login</Text>
            <Text className="text-muted-foreground text-[13px] text-center mt-2">
              Select how you want to continue on RoyalLagn.
            </Text>
          </View>

          {error ? (
            <View className="mb-4">
              <AuthAlert tone="error" message={error} />
            </View>
          ) : null}

          <View className="gap-4">
            {loginOptions.map((option) => {
              const Icon = option.icon;
              const busy = resolvingRole === option.id;
              return (
                <View
                  key={option.id}
                  className={`rounded-2xl border border-border overflow-hidden ${isDark ? "bg-card" : "bg-white"}`}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={option.title}
                    accessibilityState={{ disabled: Boolean(resolvingRole), busy }}
                    className={`p-5 flex-row items-center ${
                      resolvingRole && !busy ? "opacity-60" : "active:opacity-90"
                    }`}
                    onPress={() => void selectRole(option.id)}
                    disabled={Boolean(resolvingRole)}
                  >
                    <View
                      className={`${wide ? "w-16 h-16" : "w-14 h-14"} rounded-2xl items-center justify-center mr-4`}
                      style={{ backgroundColor: `${option.color}15` }}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color={option.color} />
                        : <Icon size={wide ? 28 : 25} color={option.color} strokeWidth={2} />}
                    </View>

                    <View className="flex-1">
                      <Text className="text-foreground font-bold text-base mb-1">
                        {busy ? "Checking session…" : option.title}
                      </Text>
                      <Text className="text-muted-foreground text-[12.5px] leading-tight" numberOfLines={2}>
                        {option.description}
                      </Text>
                    </View>

                    <ArrowRight size={20} className="text-muted-foreground ml-2" strokeWidth={2} />
                  </Pressable>

                  {option.signup ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={option.signup.label}
                      className="border-t border-border px-5 py-3 items-center active:opacity-70"
                      disabled={Boolean(resolvingRole)}
                      onPress={() => {
                        if (resolvingRole) return;
                        if (router.canDismiss()) router.dismissAll();
                        router.replace({ pathname: option.signup!.pathname, params: { tab: "signup" } });
                      }}
                    >
                      <Text className="text-primary font-semibold text-[13px]">{option.signup.label}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
