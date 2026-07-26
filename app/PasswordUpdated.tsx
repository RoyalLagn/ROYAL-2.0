import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check } from "lucide-react-native";

export default function PasswordUpdatedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ audience?: string }>();
  const audience = Array.isArray(params.audience) ? params.audience[0] : params.audience;
  const loginRoute = audience === "vendor"
    ? "/VendorLogin" as const
    : audience === "admin"
      ? "/AdminLogin" as const
      : "/Login" as const;

  const goToLogin = () => {
    if (router.canDismiss()) router.dismissAll();
    router.replace(loginRoute);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <View className="flex-1 justify-center items-center px-6">
        <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-6">
          <Check size={42} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        <Text className="text-primary font-bold text-4xl mb-8">
          Royal<Text className="text-foreground">Lagn</Text>
        </Text>
        <Text className="text-foreground text-2xl font-bold text-center">
          Password Updated Successfully
        </Text>
        <Text className="text-muted-foreground text-sm leading-6 text-center mt-3 max-w-md">
          Your password has been updated successfully.{"\n"}
          Please sign in using your new password.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="w-full max-w-md bg-primary rounded-2xl py-4 items-center mt-9 active:opacity-90"
          onPress={goToLogin}
        >
          <Text className="text-primary-foreground font-semibold text-base">Go To Login</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
