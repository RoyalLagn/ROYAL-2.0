import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SUPPORT_SETTINGS,
  loadSupportSettings,
  subscribeToSupportSettings,
  type SupportSettings,
} from "@/services/supportSettings";

export function useSupportSettings(enabled = true) {
  const [settings, setSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await loadSupportSettings();
      setSettings(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Support details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const next = await loadSupportSettings();
        if (active) {
          setSettings(next);
          setError(null);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Support details could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const unsubscribe = subscribeToSupportSettings(() => { if (active) void load(); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  return { settings, loading, error, refresh, setSettings };
}
