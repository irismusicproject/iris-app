#!/usr/bin/env node
// Creates or updates the overnight-test accounts ("personas") on STAGING.
//
//   SUPABASE_URL=... SUPABASE_SECRET_KEY=... STAGING_TEST_PASSWORD=... \
//     node scripts/staging-accounts.mjs --staging
//
// Run by .github/workflows/staging-accounts.yml (environment "staging"), which
// holds staging's keys only. Never point it at production. See README,
// "Overnight testing".
//
// What it does, for each persona in e2e/overnight/personas.json:
//   1. sign-in account: created if missing, password reset to
//      STAGING_TEST_PASSWORD, email confirmed. Deactivated persona: sign-in
//      blocked, the same way the People screen deactivates someone.
//   2. person row: name, employment type, admin role, active flag.
//   3. if the scheduling tables exist: the point person becomes Iris staff
//      (point_person) on the FIRST residency, and the musicians join that
//      residency's current season roster (Admin Lead, core musician,
//      non-core substitute).
// It changes nothing else, except one case: if the season's Admin Lead is a
// fake seed person (an @example.com address), the Admin Lead persona takes
// over that role, because a season has at most one Admin Lead.
// Safe to run again: it only ever brings the personas back to this state.

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BLOCKED = "876000h"; // same as src/app/admin/people/actions.ts

const { SUPABASE_URL, SUPABASE_SECRET_KEY, STAGING_TEST_PASSWORD } = process.env;
const fail = (msg) => {
  console.error(`x ${msg}`);
  process.exit(1);
};

if (!process.argv.includes("--staging")) {
  fail("Refusing to run without --staging (this script is for the staging database only).");
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) fail("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (staging's).");
if (!STAGING_TEST_PASSWORD || STAGING_TEST_PASSWORD.length < 12) {
  fail("STAGING_TEST_PASSWORD must be set and at least 12 characters (the app's minimum).");
}

const personas = JSON.parse(
  fs.readFileSync(new URL("../e2e/overnight/personas.json", import.meta.url), "utf8"),
).personas;
const emailFor = (key) => `persona+${key}@example.com`;

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Safety check: is this really staging? ----------------------------------
// Production holds real people only; staging's seed holds fake ones with
// example.com / example.org addresses. If none are found, stop.
async function looksLikeStaging() {
  const fakePeople = await db.from("person").select("id", { count: "exact", head: true }).like("email", "%@example.com");
  if (fakePeople.error) fail(`Can't read person table: ${fakePeople.error.message}`);
  if ((fakePeople.count ?? 0) > 0) return true;
  const fakePartners = await db
    .from("partner")
    .select("id", { count: "exact", head: true })
    .like("billing_email", "%@example.org");
  return !fakePartners.error && (fakePartners.count ?? 0) > 0;
}

async function tableExists(name) {
  const { error } = await db.from(name).select("*", { head: true, count: "exact" }).limit(1);
  if (!error) return true;
  // PostgREST: PGRST205 / 42P01 = no such table.
  if (error.code === "PGRST205" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return false;
  fail(`Can't check table ${name}: ${error.message}`);
}

// All auth users, page by page (staging is small).
async function allAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`listUsers failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureAuthUser(existing, email, persona) {
  const attrs = {
    password: STAGING_TEST_PASSWORD,
    email_confirm: true,
    ban_duration: persona.active ? "none" : BLOCKED,
  };
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, attrs);
    if (error) fail(`update sign-in for ${email}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email, ...attrs });
  if (error || !data.user) fail(`create sign-in for ${email}: ${error?.message}`);
  return data.user.id;
}

async function ensurePerson(id, email, persona) {
  const { error } = await db.from("person").upsert(
    {
      id,
      name: persona.name,
      email,
      employment_type: persona.employment_type,
      instruments: persona.instruments ?? [],
      system_roles: persona.system_roles ?? [],
      active: persona.active,
    },
    { onConflict: "id" },
  );
  if (error) fail(`save person row for ${email}: ${error.message}`);
}

// The first residency (oldest), preferring an active one, and its current season.
async function firstResidencyAndSeason() {
  const { data: residencies, error } = await db
    .from("residency")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) fail(`read residencies: ${error.message}`);
  if (!residencies?.length) return null;
  const residency = residencies.find((r) => r.status === "active") ?? residencies[0];
  const today = new Date().toISOString().slice(0, 10);
  const { data: seasons, error: sErr } = await db
    .from("season")
    .select("id, name, starts_on, ends_on")
    .eq("residency_id", residency.id)
    .gte("ends_on", today)
    .order("starts_on", { ascending: true });
  if (sErr) fail(`read seasons: ${sErr.message}`);
  const season = seasons?.find((s) => s.starts_on <= today) ?? seasons?.[0] ?? null;
  return { residency, season };
}

async function ensureStaff(residencyId, personId, role) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("staff_assignment")
    .select("id, starts_on, ends_on")
    .eq("residency_id", residencyId)
    .eq("person_id", personId)
    .eq("role", role);
  if (error) fail(`read staff assignments: ${error.message}`);
  const current = data?.find((a) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today));
  if (current) return "already";
  const { error: insErr } = await db
    .from("staff_assignment")
    .insert({ residency_id: residencyId, person_id: personId, role, starts_on: today });
  if (insErr) fail(`add staff assignment: ${insErr.message}`);
  return "added";
}

async function ensureRoster(seasonId, personId, roster) {
  let isAdminLead = roster.is_admin_lead;
  if (isAdminLead) {
    const { data: lead, error } = await db
      .from("roster_member")
      .select("id, person_id, person:person_id (email)")
      .eq("season_id", seasonId)
      .eq("is_admin_lead", true)
      .maybeSingle();
    if (error) fail(`read Admin Lead: ${error.message}`);
    if (lead && lead.person_id !== personId) {
      const leadEmail = lead.person?.email ?? "";
      if (leadEmail.endsWith("@example.com")) {
        const { error: e2 } = await db.from("roster_member").update({ is_admin_lead: false }).eq("id", lead.id);
        if (e2) fail(`hand over Admin Lead: ${e2.message}`);
        console.log(`  (took Admin Lead over from fake seed person ${leadEmail})`);
      } else {
        console.warn(
          `::warning::This season's Admin Lead is a real staging account, so the Admin Lead persona joins as a plain musician. Make it Admin Lead by hand if you need that row of the matrix.`,
        );
        isAdminLead = false;
      }
    }
  }
  const { error } = await db.from("roster_member").upsert(
    { season_id: seasonId, person_id: personId, is_core: roster.is_core, is_admin_lead: isAdminLead, left_on: null },
    { onConflict: "season_id,person_id" },
  );
  if (error) fail(`save roster row: ${error.message}`);
}

// --- Main --------------------------------------------------------------------
if (!(await looksLikeStaging())) {
  fail("This database has no fake (example.com / example.org) data, so it may not be staging. Stopping.");
}

const users = await allAuthUsers();
const scheduling = (await tableExists("residency")) && (await tableExists("roster_member")) && (await tableExists("staff_assignment"));
const target = scheduling ? await firstResidencyAndSeason() : null;

if (!scheduling) console.log("Scheduling tables not on staging yet: creating accounts only (run again after they arrive).");
else if (!target) console.log("No residency on staging yet: creating accounts only.");
else {
  console.log(`First residency: ${target.residency.name}`);
  console.log(target.season ? `Current season: ${target.season.name}` : "No current season: roster links skipped.");
}

for (const persona of personas) {
  const email = emailFor(persona.key);
  const existing = users.find((u) => u.email?.toLowerCase() === email);
  const id = await ensureAuthUser(existing, email, persona);
  await ensurePerson(id, email, persona);
  const notes = [existing ? "updated" : "created", persona.active ? "active" : "deactivated (sign-in blocked)"];
  if (target && persona.staff_role) {
    notes.push(`staff ${persona.staff_role}: ${await ensureStaff(target.residency.id, id, persona.staff_role)}`);
  }
  if (target?.season && persona.roster) {
    await ensureRoster(target.season.id, id, persona.roster);
    notes.push(persona.roster.is_admin_lead ? "roster: Admin Lead" : persona.roster.is_core ? "roster: core" : "roster: non-core (sub)");
  }
  console.log(`✓ ${persona.label.padEnd(20)} ${email}  ${notes.join(", ")}`);
}
console.log("Done. Passwords are the STAGING_TEST_PASSWORD secret.");
