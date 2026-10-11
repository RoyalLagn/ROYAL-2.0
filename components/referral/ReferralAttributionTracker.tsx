import { useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { usePublicAuth } from "@/context/PublicAuthContext";
import {
  ReferralCommissionService,
  REFERRAL_STORAGE_KEY_CODE,
} from "@/services/referralCommission";

/**
 * Monitors incoming referral links (e.g. ?ref=RL..., ?referral=RL...)
 * and persists attribution in client storage immutably (first-touch).
 * If user is authenticated as a customer, links attribution to their account.
 */
export default function ReferralAttributionTracker() {
  const params = useLocalSearchParams<{ ref?: string; referral?: string }>();
  const { profile } = usePublicAuth();

  useEffect(() => {
    async function trackReferral() {
      let code = "";

      // 1. Check Expo Router params
      if (typeof params.ref === "string" && params.ref.trim()) {
        code = params.ref.trim();
      } else if (typeof params.referral === "string" && params.referral.trim()) {
        code = params.referral.trim();
      }

      // 2. Check window.location on web
      if (!code && Platform.OS === "web" && typeof window !== "undefined") {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const qRef = urlParams.get("ref") || urlParams.get("referral");
          if (qRef) {
            code = qRef.trim();
          }
        } catch {
          // ignore
        }
      }

      if (!code) return;

      const cleanCode = code.toUpperCase();

      try {
        // Enforce first-touch immutable attribution
        const existing = await AsyncStorage.getItem(REFERRAL_STORAGE_KEY_CODE);
        if (!existing) {
          await AsyncStorage.setItem(REFERRAL_STORAGE_KEY_CODE, cleanCode);
        }

        // If user is currently logged in, link attribution on server
        if (profile?.id && profile.role === "public_user") {
          await ReferralCommissionService.attributeCustomer(profile.id, cleanCode, "link");
        }
      } catch (err) {
        console.warn("Could not record referral attribution:", err);
      }
    }

    void trackReferral();
  }, [params.ref, params.referral, profile?.id]);

  return null;
}
