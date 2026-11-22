import fs from "node:fs";

// In CI these come from `supabase status -o env` (.github/workflows/e2e.yml).
// Locally, `npm run dev:local` writes them to .env.development.local.
const LOCAL_FILE = ".env.development.local";
if (fs.existsSync(LOCAL_FILE)) {
  for (const line of fs.readFileSync(LOCAL_FILE, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "";
export const MAIL_URL = process.env.MAIL_URL ?? "http://127.0.0.1:54324";

if (!SUPABASE_URL.startsWith("http://127.0.0.1") && !SUPABASE_URL.startsWith("http://localhost")) {
  throw new Error(`End-to-end tests only run against a local Supabase, not ${SUPABASE_URL}`);
}
