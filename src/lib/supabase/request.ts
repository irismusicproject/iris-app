import "server-only";
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";

// The database client for an API request: the phone app sends its sign-in as
// "Authorization: Bearer <access token>"; the website sends its cookie. Either
// way every query runs as that person, under Row Level Security.
export async function clientForRequest(request: Request): Promise<SupabaseClient | null> {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const client = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    return error || !data.user ? null : client;
  }
  const client = await createCookieClient();
  const { data } = await client.auth.getUser();
  return data.user ? (client as unknown as SupabaseClient) : null;
}
