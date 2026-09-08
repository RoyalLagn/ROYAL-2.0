import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  createClient,
  processLock,
  type Session,
  type SupportedStorage,
} from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env."
  );
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL must be the Supabase project base URL, for example https://project-ref.supabase.co, without /rest/v1/."
  );
}

const secureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

// Web sessions belong to the browser profile, not to one individual tab.
// localStorage keeps the authenticated account available across reloads,
// newly opened tabs and ordinary tab visibility changes. Supabase also uses
// its storage events to keep refreshed tokens synchronized between tabs.
// Native continues to use encrypted SecureStore below.
const webStorageAdapter: SupportedStorage = {
  getItem: (key) => {
    try {
      if (typeof localStorage === "undefined") return null;
      const persistedValue = localStorage.getItem(key);
      if (persistedValue) return persistedValue;

      // Preserve a session created by older builds that used per-tab
      // sessionStorage, then remove the legacy copy after migration.
      const legacyValue = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
      if (legacyValue) {
        localStorage.setItem(key, legacyValue);
        sessionStorage.removeItem(key);
      }
      return legacyValue;
    } catch {
      // localStorage can throw in privacy modes / sandboxed frames.
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
    } catch {
      // Best-effort: a failed write must not crash authentication.
    }
  },
  removeItem: (key) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(key);
      }
    } catch {
      // Nothing else to clean up.
    }
  },
};

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? webStorageAdapter : secureStoreAdapter,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Browsers use Supabase's navigator-lock implementation so tabs can
    // coordinate refreshes. processLock is the React Native fallback and can
    // time out immediately when used by multiple web auth operations.
    ...(Platform.OS === "web" ? {} : { lock: processLock }),
  },
});

let sessionRestorePromise: Promise<Session | null> | null = null;

function waitForSessionRetry(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function isInvalidStoredSessionError(error: unknown) {
  if (!error) return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = error instanceof Error
    ? error.message
    : typeof candidate.message === "string"
      ? candidate.message
      : String(error);

  return status === 400
    || /refresh[_ ]token|invalid[_ ]grant|session.*(invalid|expired|missing)/i.test(`${code} ${message}`)
    || error instanceof SyntaxError;
}

/**
 * Removes only this Supabase project's persisted auth session. This is used
 * after a non-retryable refresh failure; unrelated local application data is
 * deliberately left untouched.
 */
export async function clearInvalidSupabaseSession() {
  const storage = Platform.OS === "web" ? webStorageAdapter : secureStoreAdapter;

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // A malformed stored value can make signOut throw before cleanup.
  } finally {
    // Supabase auth methods can return an error instead of throwing. Always
    // remove the rejected credential so it cannot trigger another refresh
    // request on the next render or page reload.
    await storage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  }
}

/**
 * One shared startup restore prevents every role provider from independently
 * attempting to refresh the same stale token. Retryable network errors still
 * surface to callers; revoked/expired/malformed refresh sessions are cleared
 * locally and resolve as signed out.
 */
export function restoreSupabaseSession(): Promise<Session | null> {
  if (sessionRestorePromise) return sessionRestorePromise;

  sessionRestorePromise = (async () => {
    const retryDelays = [0, 350, 900];
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt]) await waitForSessionRetry(retryDelays[attempt]);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session;
      } catch (error) {
        if (isInvalidStoredSessionError(error)) {
          await clearInvalidSupabaseSession();
          return null;
        }
        if (attempt === retryDelays.length - 1) throw error;
      }
    }
    return null;
  })().finally(() => {
    sessionRestorePromise = null;
  });

  return sessionRestorePromise;
}

if (Platform.OS !== "web") {
  // The first AppState change may not occur until after the app has already
  // been foregrounded. Start refresh immediately for a restored native
  // session, then pause it only while the app is actually backgrounded.
  if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
