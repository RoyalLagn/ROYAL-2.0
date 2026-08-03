import React, { useCallback, useEffect } from "react";
import { BackHandler, Pressable, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

type AuthBackButtonProps = {
  fallbackRoute?: Href;
};

export function AuthBackButton({
  fallbackRoute: _fallbackRoute = "/DashboardCenter",
}: AuthBackButtonProps) {
  const router = useRouter();

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/(tabs)");
  }, [router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  return (
    <View className="absolute top-2 left-5 z-10">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={goBack}
        android_ripple={{ color: "rgba(17,24,39,0.10)", borderless: true }}
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <ArrowLeft size={24} className="text-foreground" strokeWidth={2} />
      </Pressable>
    </View>
  );
}
