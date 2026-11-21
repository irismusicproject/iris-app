import "server-only";
import { createClient } from "@supabase/supabase-js";

// Uses the Supabase SECRET key, which skips every RLS rule. Server-only:
// the "server-only" import makes the build fail if a browser bundle uses it.
// Use it only for sign-in administration (invites, blocking sign-in), and
// only after checking the caller is an admin (see requireAdmin in lib/auth).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SECRET_KEY is not set. See README → Deploying.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
