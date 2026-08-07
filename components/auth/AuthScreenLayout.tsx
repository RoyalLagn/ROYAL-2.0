import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Href } from "expo-router";
import RoyalLagnLogo from "@/components/RoyalLagnLogo";
import { AuthBackButton } from "@/components/auth/AuthBackButton";

type AuthScreenLayoutProps = {
  /** Where the back arrow (and Android hardware back) goes from this screen. */
  backRoute: Href;
  /** Small label above the logo, e.g. "Vendor Portal". */
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Rendered under the form card, outside its padding. */
  footer?: React.ReactNode;
};

const CONTENT_MAX_WIDTH = 440;

/**
 * Shared shell for every auth screen: safe areas, keyboard-aware scrolling and
 * a centred, width-capped column that becomes a card on tablet/desktop.
 *
 * The ScrollView is what keeps inputs and the submit button reachable when the
 * on-screen keyboard is up — every auth screen must go through this component
 * rather than centring content in a bare View.
 */
export function AuthScreenLayout({
  backRoute,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthScreenLayoutProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right", "bottom"]}>
      <AuthBackButton fallbackRoute={backRoute} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: wide ? 24 : 20,
            paddingTop: 68,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{ width: "100%", maxWidth: CONTENT_MAX_WIDTH }}
            className={wide ? "bg-card border border-border rounded-3xl px-7 py-8" : ""}
          >
            <View className="items-center mb-7">
              <RoyalLagnLogo width={340} height={102} scale={2.2} />
              {eyebrow ? (
                <Text className="text-primary text-[11px] font-bold uppercase tracking-[2px] mt-3">
                  {eyebrow}
                </Text>
              ) : null}
              <Text className="text-foreground text-[22px] font-bold text-center mt-3">
                {title}
              </Text>
              {subtitle ? (
                <Text className="text-muted-foreground text-[13px] leading-5 text-center mt-2">
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {children}
          </View>

          {footer ? (
            <View style={{ width: "100%", maxWidth: CONTENT_MAX_WIDTH }} className="mt-5">
              {footer}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
