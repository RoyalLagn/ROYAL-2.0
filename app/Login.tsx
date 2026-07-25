import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Lock, Mail } from "lucide-react-native";
import { supabase } from "@/services/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const finishCustomerLogin = async (userId: string, userEmail: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      const fallbackName = fullName.trim() || userEmail.split("@")[0] || "RoyalLagn Customer";
      const { error: insertError } = await supabase.from("profiles").insert({
        id: userId,
        email: userEmail,
        full_name: fallbackName,
        role: "public_user",
        is_active: true,
      });
      if (insertError) throw insertError;
    } else if (profile.role !== "public_user" || !profile.is_active) {
      throw new Error("Use an active Customer account to write reviews.");
    }
    const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
    router.replace((returnTo || "/(tabs)") as never);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Enter your customer email and password.");
      return;
    }
    setLoading(true);
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (signInError || !data.user) {
      setError(signInError?.message || "Unable to sign in.");
      setLoading(false);
      return;
    }
    try {
      await finishCustomerLogin(data.user.id, data.user.email || normalizedEmail);
    } catch (caught) {
      await supabase.auth.signOut();
      setError(caught instanceof Error ? caught.message : "Unable to connect this customer account.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!fullName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: { data: { full_name: fullName.trim(), role: "public_user" } },
    });
    if (signUpError || !data.user) {
      setError(signUpError?.message || "Unable to create your account.");
      setLoading(false);
      return;
    }
    if (!data.session) {
      setError("Check your email and confirm your account, then return here to sign in.");
      setCreating(false);
      setLoading(false);
      return;
    }
    try {
      await finishCustomerLogin(data.user.id, data.user.email || normalizedEmail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to finish account setup.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1 justify-center px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="items-center mb-10">
          <Text className="text-primary font-bold text-4xl mb-2">
            Royal<Text className="text-foreground">Lagn</Text>
          </Text>
          <Text className="text-muted-foreground text-base">{creating ? "Create your customer account" : "Sign in to continue"}</Text>
        </View>

        <View className="gap-4">
          {creating ? (
            <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
              <TextInput
                className="flex-1 text-foreground py-4"
                placeholder="Your full name"
                placeholderTextColor="#A8A29E"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>
          ) : null}
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
            <Mail size={20} className="text-muted-foreground" />
            <TextInput
              className="flex-1 text-foreground py-4 ml-3"
              placeholder="Email address"
              placeholderTextColor="#A8A29E"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
          </View>

          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4">
            <Lock size={20} className="text-muted-foreground" />
            <TextInput
              className="flex-1 text-foreground py-4 ml-3"
              placeholder="Password"
              placeholderTextColor="#A8A29E"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
            />
          </View>

          <Pressable
            className="bg-primary rounded-2xl py-4 items-center active:opacity-90"
            onPress={creating ? handleCreateAccount : handleLogin}
            disabled={loading}
          >
            <Text className="text-primary-foreground font-semibold text-base">
              {loading ? "Please wait…" : creating ? "Create Customer Account" : "Login"}
            </Text>
          </Pressable>
          <Pressable
            className="border border-primary rounded-2xl py-4 items-center active:opacity-80"
            onPress={() => {
              setCreating((current) => !current);
              setError("");
            }}
            disabled={loading}
          >
            <Text className="text-primary font-semibold text-base">
              {creating ? "I already have an account" : "Create Customer Account"}
            </Text>
          </Pressable>
          {error ? <Text className="text-red-500 text-sm text-center">{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
