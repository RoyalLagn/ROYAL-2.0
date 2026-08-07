import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";

export default function PasswordUpdatedScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 640;
  const params = useLocalSearchParams<{ audience?: string }>();
  const audience = Array.isArray(params.audience) ? params.audience[0] : params.audience;
  const loginRoute = audience === "vendor"
    ? "/VendorAuth" as const
    : audience === "admin"
      ? "/AdminLogin" as const
      : "/Login" as const;

  const goToLogin = () => {
    if (router.canDismiss()) router.dismissAll();
    // The login screens surface a confirmation banner for this flag.
    router.replace({ pathname: loginRoute, params: { reset: "success" } });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="flex-1 justify-center items-center px-5">
        <View
          style={{ width: "100%", maxWidth: 440 }}
          className={`items-center ${wide ? "bg-card border border-border rounded-3xl px-7 py-9" : ""}`}
        >
          <RoyalLagnLogo width={340} height={102} scale={2.2} />
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mt-7 mb-6">
            <Check size={40} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <Text className="text-foreground text-section-title font-bold text-center">
            Password updated
          </Text>
          <Text className="text-muted-foreground text-body leading-5 text-center mt-2">
            Your password has been changed successfully.{"\n"}
            Please sign in using your new password.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="w-full h-14 bg-primary rounded-2xl items-center justify-center mt-8 active:opacity-90"
            onPress={goToLogin}
          >
            <Text className="text-primary-foreground font-semibold text-body">Go to login</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
