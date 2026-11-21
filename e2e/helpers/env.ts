// Values come from `supabase status -o env` (see .github/workflows/e2e.yml).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const MAIL_URL = process.env.MAIL_URL ?? "http://127.0.0.1:54324";

if (!SUPABASE_URL.startsWith("http://127.0.0.1") && !SUPABASE_URL.startsWith("http://localhost")) {
  throw new Error(`End-to-end tests only run against a local Supabase, not ${SUPABASE_URL}`);
}
