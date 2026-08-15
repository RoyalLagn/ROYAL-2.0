import React, { useCallback, useEffect } from "react";
import { BackHandler, Platform, Pressable, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

type AuthBackButtonProps = {
  fallbackRoute?: Href;
};

/**
 * Auth screens navigate between each other with `replace`, so the router stack
 * rarely holds the screen the user considers "back". Each screen therefore
 * declares where back should land, and we go there deterministically.
 */
export function AuthBackButton({
  fallbackRoute = "/DashboardCenter",
}: AuthBackButtonProps) {
  const router = useRouter();

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(fallbackRoute);
  }, [fallbackRoute, router]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  return (
    <View className="absolute top-2 left-4 z-10">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={goBack}
        android_ripple={{ color: "rgba(17,24,39,0.10)", borderless: true }}
        className="w-12 h-12 items-center justify-center rounded-full active:opacity-60"
      >
        <ArrowLeft size={24} className="text-foreground" strokeWidth={2} />
      </Pressable>
    </View>
  );
}
