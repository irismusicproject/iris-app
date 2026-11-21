// Local prototyping helpers. A private Supabase runs in Docker on this
// computer, with every migration, the fake data in supabase/seed.sql, and
// two ready-made logins. Nothing here can reach staging or production.
//
//   npm run dev:local   start Supabase (if needed), set up logins, run the app
//   npm run db:reset    wipe the local database and rebuild it from migrations
//   npm run db:stop     stop the local Supabase
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ENV_FILE = ".env.development.local"; // `next dev` reads it before .env.local

export const LOCAL_USERS = [
  { email: "admin@example.com", name: "Ada Admin (local)", roles: ["admin"], employment: "employee_w2" },
  { email: "musician@example.com", name: "Milo Musician (local)", roles: [], employment: "contractor_1099" },
];
export const LOCAL_PASSWORD = "local-only-password"; // local Docker database only

function supabase(...args) {
  return execFileSync("npx", ["supabase", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function dockerRunning() {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function status() {
  try {
    const out = supabase("status", "-o", "env");
    return Object.fromEntries(
      out.split("\n").filter((l) => l.includes("=")).map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      }),
    );
  } catch {
    return null;
  }
}

function ensureStarted() {
  if (!dockerRunning()) {
    console.error("\nDocker isn't running. Open Docker Desktop, wait for it to say it's running, then try again.\n");
    process.exit(1);
  }
  let env = status();
  if (!env?.API_URL) {
    console.log("Starting local Supabase (the first time downloads a few hundred MB)...");
    execFileSync("npx", ["supabase", "start", "-x", "studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,supavisor"], { stdio: "inherit" });
    env = status();
  }
  if (!env?.API_URL?.startsWith("http://127.0.0.1")) throw new Error("Local Supabase didn't start");
  return env;
}

function writeEnv(env) {
  const mail = env.MAILPIT_URL || env.INBUCKET_URL || "http://127.0.0.1:54324";
  fs.writeFileSync(
    ENV_FILE,
    [
      "# Written by scripts/local-supabase.mjs: the LOCAL Supabase in Docker. Safe to delete.",
      `NEXT_PUBLIC_SUPABASE_URL=${env.API_URL}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}`,
      `SUPABASE_SECRET_KEY=${env.SERVICE_ROLE_KEY}`,
      "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
      `# Emails the app "sends" appear here instead: ${mail}`,
      "",
    ].join("\n"),
  );
  return mail;
}

async function ensureUsers(env) {
  const db = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const u of LOCAL_USERS) {
    const { data: list } = await db.auth.admin.listUsers();
    let user = list?.users.find((x) => x.email === u.email);
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({ email: u.email, password: LOCAL_PASSWORD, email_confirm: true });
      if (error) throw new Error(`creating ${u.email}: ${error.message}`);
      user = data.user;
    }
    const { error } = await db.from("person").upsert({
      id: user.id, name: u.name, email: u.email, employment_type: u.employment, system_roles: u.roles, active: true,
    });
    if (error) throw new Error(`person ${u.email}: ${error.message}`);
  }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "stop") return void execFileSync("npx", ["supabase", "stop"], { stdio: "inherit" });

  let env = ensureStarted();
  if (cmd === "reset") {
    execFileSync("npx", ["supabase", "db", "reset"], { stdio: "inherit" });
    env = status();
  }
  const mail = writeEnv(env);
  await ensureUsers(env);

  console.log(`
Local Supabase is ready (nothing here touches staging or production).
  App:          http://localhost:3000
  Log in as:    admin@example.com     or  musician@example.com
  Password:     ${LOCAL_PASSWORD}
  Emails:       ${mail}   (invites, codes and resets land here)
  Rebuild DB:   npm run db:reset
`);
  if (cmd === "dev") spawn("npx", ["next", "dev"], { stdio: "inherit" }).on("exit", (c) => process.exit(c ?? 0));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
