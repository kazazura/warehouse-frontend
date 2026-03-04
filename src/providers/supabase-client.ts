import { createClient } from "@refinedev/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./constants";

const AUTH_STORAGE_KEY = "warehouse-auth-storage";
const AUTH_PERSISTENCE_KEY = "warehouse-auth-persistence";
const PERSISTENCE_LOCAL = "local";
const PERSISTENCE_SESSION = "session";

const isBrowser = () => typeof window !== "undefined";

const safeGetStorage = (type: "local" | "session"): Storage | null => {
  if (!isBrowser()) return null;

  try {
    return type === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const getPreferredPersistence = (): string => {
  const localStorageRef = safeGetStorage("local");
  const value = localStorageRef?.getItem(AUTH_PERSISTENCE_KEY);
  return value === PERSISTENCE_SESSION ? PERSISTENCE_SESSION : PERSISTENCE_LOCAL;
};

export const setRememberSessionPreference = (rememberMe: boolean) => {
  const localStorageRef = safeGetStorage("local");
  localStorageRef?.setItem(
    AUTH_PERSISTENCE_KEY,
    rememberMe ? PERSISTENCE_LOCAL : PERSISTENCE_SESSION
  );
};

const authStorage = {
  getItem: (key: string): string | null => {
    const preferredMode = getPreferredPersistence();
    const preferredStorage =
      preferredMode === PERSISTENCE_SESSION
        ? safeGetStorage("session")
        : safeGetStorage("local");
    const fallbackStorage =
      preferredMode === PERSISTENCE_SESSION
        ? safeGetStorage("local")
        : safeGetStorage("session");

    const preferredValue = preferredStorage?.getItem(key) ?? null;
    if (preferredValue !== null) return preferredValue;

    return fallbackStorage?.getItem(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    const preferredMode = getPreferredPersistence();
    const preferredStorage =
      preferredMode === PERSISTENCE_SESSION
        ? safeGetStorage("session")
        : safeGetStorage("local");
    const otherStorage =
      preferredMode === PERSISTENCE_SESSION
        ? safeGetStorage("local")
        : safeGetStorage("session");

    preferredStorage?.setItem(key, value);
    otherStorage?.removeItem(key);
  },
  removeItem: (key: string) => {
    safeGetStorage("local")?.removeItem(key);
    safeGetStorage("session")?.removeItem(key);
  },
};

export const supabaseClient: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    db: {
      schema: "public",
    },
    auth: {
      persistSession: true,
      storageKey: AUTH_STORAGE_KEY,
      storage: authStorage,
    },
  }
);
