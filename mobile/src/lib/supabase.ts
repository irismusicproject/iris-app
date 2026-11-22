import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { secureStorage } from "./secure-storage";

// The phone app talks to Supabase directly. Every read and write goes through
// the same Row Level Security rules and database functions as the website
// (CLAUDE.md: rules live in Supabase). Only the publishable key is here; it
// can do nothing those rules don't allow.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until mobile/.env.local is filled in (see that file). */
export const isConfigured = Boolean(url && key);

export const supabase = createClient(url || "https://not-configured.invalid", key || "not-configured", {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the sign-in fresh only while the app is on screen.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
