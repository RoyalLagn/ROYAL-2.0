import React from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock3, XCircle } from "lucide-react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";

export default function VendorAuthStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string; reason?: string }>();
  const rejected = params.status === "rejected";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <AuthBackButton fallbackRoute="/VendorLogin" />
      <View className="flex-1 px-6 items-center justify-center">
        <View className={`w-20 h-20 rounded-full items-center justify-center mb-6 ${rejected ? "bg-destructive/10" : "bg-primary/10"}`}>
          {rejected
            ? <XCircle size={38} className="text-destructive" />
            : <Clock3 size={38} className="text-primary" />}
        </View>
        <Text className="text-foreground text-2xl font-bold text-center mb-3">
          {rejected ? "Application Rejected" : "Approval Pending"}
        </Text>
        <Text className="text-muted-foreground text-center leading-6 mb-8">
          {rejected
            ? params.reason || "Your Vendor application was not approved."
            : "Your Vendor application is being reviewed. We’ll notify you when it is approved."}
        </Text>
        <Pressable
          className="bg-primary rounded-2xl py-4 px-8 items-center active:opacity-90"
          onPress={() => rejected ? router.replace("/BecomeVendor") : router.replace("/(tabs)")}
        >
          <Text className="text-primary-foreground font-semibold">
            {rejected ? "Edit and Resubmit" : "Back to Home"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
