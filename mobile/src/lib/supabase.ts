import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/database.types";
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

// Typed with the generated database description: a query on a column that
// doesn't exist (or no longer exists) fails the type check, before it fails on a phone.
export const supabase = createClient<Database>(url || "https://not-configured.invalid", key || "not-configured", {
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
