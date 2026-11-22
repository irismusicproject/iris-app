// Loads every migration and then supabase/seed.sql TWICE into an in-memory
// Postgres (PGlite), and prints how many rows each table has. Use it after
// changing scripts/generate-seed.mjs. Nothing touches a real database.
//
//   node scripts/check-seed.mjs                    # this checkout's migrations
//   node scripts/check-seed.mjs path/to/migrations # another set (e.g. a branch)
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "supabase", "migrations");
const seed = fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8");

const db = new PGlite();
// A stand-in for Supabase's auth schema, with the auth.users columns the
// seed fills in.
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
console.log(`${migrations.length} migrations from ${dir}`);

async function counts() {
  const { rows } = await db.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const out = {};
  for (const { table_name } of rows) {
    out[table_name] = (await db.query(`select count(*)::int as n from public."${table_name}"`)).rows[0].n;
  }
  out["auth.users"] = (await db.query(`select count(*)::int as n from auth.users`)).rows[0].n;
  return out;
}

async function run(label) {
  try { await db.exec(seed); }
  catch (e) { console.error(`seed failed (${label}): ${e.message}${e.where ? `\n  at ${e.where}` : ""}`); process.exit(1); }
}
await run("first run");
const first = await counts();
await run("second run");
const second = await counts();

let changed = 0;
for (const [t, n] of Object.entries(second)) {
  const note = first[t] === n ? "" : `  (first run ${first[t]})`;
  if (note && t !== "audit_log") changed++;
  console.log(`${t.padEnd(32)} ${String(n).padStart(6)}${note}`);
}
if (changed) {
  console.error(`\n${changed} table(s) grew on the second run: the seed isn't safe to repeat.`);
  process.exit(1);
}
console.log("\nSeed loaded twice with the same counts.");
