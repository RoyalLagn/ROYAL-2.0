import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock3, XCircle } from "lucide-react-native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { supabase } from "@/services/supabase";
import {
  logSupabaseError,
  resolveVendorDestination,
  type VendorResolution,
} from "@/services/vendorAuth";
import PageLoader from "@/components/loading/PageLoader";

/**
 * The ?status= query param is only used for the very first paint (avoids a
 * blank screen while the initial fetch resolves) -- it is never trusted as
 * the source of truth. Every render past that first frame reflects
 * `resolution`, fetched from the database and then kept live over
 * Realtime.
 */
export default function VendorAuthStatusScreen() {
  const router = useRouter();
  const [resolution, setResolution] = useState<VendorResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const teardownRealtime = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      // getSession() (not getUser()) -- matches every other auth context in
      // this app. getUser() resolves its `error` field to an expected
      // "Auth session missing" case whenever there is no session, which is
      // the ordinary, common way to land on this screen (direct link,
      // refresh after logout) and must not read as a load failure.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!mountedRef.current) return;

      const next = await resolveVendorDestination(data.session?.user ?? null);
      if (!mountedRef.current) return;

      // Only this screen's two legitimate resting states (pending /
      // rejected, including "approved but not yet verified" which reads
      // the same as pending) stay here. Every other state has a real
      // destination and must not linger on a stale status page.
      if (next.state === "unauthenticated" || next.state === "not_vendor") {
        teardownRealtime();
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: "/VendorAuth" });
        return;
      }
      if (next.state === "no_application") {
        teardownRealtime();
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: "/BecomeVendor" });
        return;
      }
      if (next.state === "approved_verified") {
        teardownRealtime();
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: "/vendor-dashboard" });
        return;
      }

      setResolution(next);
    } catch (caught) {
      if (!mountedRef.current) return;
      logSupabaseError("VendorAuthStatus.load", caught);
      setError(caught instanceof Error ? caught.message : "Unable to load your application status.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [router, teardownRealtime]);

  useEffect(() => {
    void load();
  }, [load]);

  // Subscribe to live updates on this exact application row only after the
  // first authoritative fetch has resolved one -- Realtime is a live
  // refresh trigger here, never the initial data source. One channel per
  // application id; re-subscribing on a changed id (or tearing down when
  // there is none) prevents duplicate channels across refetches and React
  // Strict Mode's double-invoke.
  useEffect(() => {
    const applicationId = resolution?.application?.id;
    if (!applicationId) return;

    const channel = supabase
      .channel(`vendor-application-status-${applicationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendor_applications", filter: `id=eq.${applicationId}` },
        () => { void load(); },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [resolution?.application?.id, load]);

  // Also stop watching (and let the resolver run again) if the signed-in
  // user changes or signs out while this screen is open.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        teardownRealtime();
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: "/VendorAuth" });
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [router, teardownRealtime]);

  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
        <AuthBackButton fallbackRoute="/" />
        <View className="flex-1 px-6 items-center justify-center">
          <Text className="text-foreground text-lg font-bold text-center mb-3">Unable to load your status</Text>
          <Text className="text-muted-foreground text-center leading-6 mb-8">{error}</Text>
          <Pressable
            className="bg-primary rounded-2xl py-4 px-8 items-center active:opacity-90"
            onPress={() => { setLoading(true); void load(); }}
          >
            <Text className="text-primary-foreground font-semibold">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const rejected = resolution?.state === "rejected";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      {/* Pending/rejected status: header + Android hardware back always go home. */}
      <AuthBackButton fallbackRoute="/" />
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
            ? resolution?.application?.rejection_reason || "Your Vendor application was not approved."
            : "Your Vendor application is being reviewed. We’ll notify you when it is approved."}
        </Text>
        <Pressable
          className="bg-primary rounded-2xl py-4 px-8 items-center active:opacity-90"
          onPress={() => {
            if (rejected) {
              router.replace({ pathname: "/BecomeVendor", params: { source: "rejected" } });
            } else {
              if (router.canDismiss()) router.dismissAll();
              router.replace("/");
            }
          }}
        >
          <Text className="text-primary-foreground font-semibold">
            {rejected ? "Edit and Resubmit" : "Back to Home"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
