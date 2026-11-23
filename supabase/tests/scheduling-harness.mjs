// Shared harness for scheduling-scenarios.test.mjs and
// scheduling-invariants.test.mjs. Same approach as rls.test.mjs and
// scheduling.test.mjs: an in-memory Postgres (PGlite), a stand-in for
// Supabase's auth schema, every migration in order, and as(personId, sql) to
// run a statement as a signed-in person under Row Level Security.
//
// Findings: a check can carry a tag { kind: "KNOWN BUG" | "QUESTION", id }.
// A tagged check that fails is reported, not counted as a failure, so CI stays
// green while the problem stays visible. A tagged check that PASSES counts as
// a failure (like a strict "expected failure"): the fix must remove the tag. Every tag is described once in
// FINDINGS below with its doc reference and a minimal reproduction.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function createDb() {
  const db = new PGlite();
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`);
  for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  return db;
}

// Run one statement as a person (null = anon) under RLS.
export function runner(db) {
  async function as(uid, sql) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
    await db.exec(uid ? "set role authenticated" : "set role anon");
    try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; }
    catch (e) { return { ok: false, err: e.message }; }
    finally { await db.exec("reset role"); }
  }
  // The database owner, with nobody signed in: setup and "ground truth" reads.
  async function su(sql) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`);
    const res = await db.exec(sql); // may hold several statements; rows of the last
    return res[res.length - 1]?.rows ?? [];
  }
  return { as, su };
}

// Every finding these files can report. `ref` points at the doc rule; `repro`
// is the smallest sequence that shows it.
export const FINDINGS = {
  "K1": { kind: "KNOWN BUG", title: "Usual musicians can be people who aren't on the roster",
    ref: "DOMAIN-MODEL §3 Series.default_personnel: \"Must be on the current roster\"",
    repro: "As the point person: insert into series_default_person (series_id, person_id) values (<series>, <active person on no roster>) → accepted. (Filling a month then silently skips them.)" },
  "K2": { kind: "KNOWN BUG", title: "Filling the whole season creates dates outside the season",
    ref: "DOMAIN-MODEL §3 Season view: \"Fill the whole season\"; §2 RosterMember (D16): only that season's roster can play, so out-of-season dates can't be staffed and block publishing",
    repro: "Season 15th of month M to 14th of month M+2; a weekly series active before it. As the point person: select generate_season(<season>) → sessions dated M 1st–14th and M+2 15th–end are created, with no musicians." },
  "K3": { kind: "KNOWN BUG", title: "canceled_at can be typed in by a musician or the Admin Lead",
    ref: "DOMAIN-MODEL §3 Session.canceled_at: \"When the cancellation was recorded\"; compared with the 9:00 notice time for late partner cancellations (D9, partner invoices)",
    repro: "As a draft date's leader: update session set schedule_state='canceled', cancellation_reason='partner', canceled_at='2000-01-01' → canceled_at stays 2000-01-01. As the Admin Lead on a canceled date: update session set canceled_at=<any time> → accepted. A late partner cancellation can be made to look early (or the reverse), which changes the community invoice." },
  "K4": { kind: "KNOWN BUG", title: "An updated calendar goes out while a published group session has no leader",
    ref: "DOMAIN-MODEL §3 Session invariant: \"A non-canceled group_session has exactly one playing SessionAssignment with role = leader\"; migration 20261207 fixed this for new drafts only",
    repro: "Publish a month. As the point person: update session_assignment set role='participant' where session_id=<published date> and role='leader'. As the Admin Lead: select new_calendar_version(...) → version 2 is created with that date leaderless." },
  "Q1": { kind: "QUESTION", title: "Can a musician name a leader before the point person has set one?",
    ref: "DOMAIN-MODEL §3 Who does what (v0.18): musicians \"pick or swap the leader (after the point person has set it)\"",
    repro: "A draft date with musicians but no leader. As a musician playing it: update session_assignment set role='leader' where person_id=<self> → accepted (also possible by inserting a new assignment with role='leader')." },
  "Q2": { kind: "QUESTION", title: "Any roster musician can staff an empty draft they don't play in",
    ref: "DOMAIN-MODEL §3 Who does what (v0.18): musicians edit \"draft dates they play in\". The code adds an exception for a brand-new date with nobody on it (comment in 20261130), which the docs don't mention",
    repro: "The Admin Lead adds a one-time event with nobody on it. As another roster musician (not on it): insert into session_assignment (session_id, person_id) values (<event>, <self>) → accepted." },
  "Q3": { kind: "QUESTION", title: "Can the Admin Lead make a DRAFT date \"No Program\" for a planned absence?",
    ref: "DOMAIN-MODEL §3 Session \"Planned absences (D11)\": \"the Admin Lead cancels that session in the draft\"; but Who does what (v0.18) gives the Admin Lead \"No Program\" only on published dates (the point person and the date's leader do it on drafts)",
    repro: "As the Admin Lead, not playing a draft date: update session set schedule_state='canceled', cancellation_reason='musician' → 0 rows." },
  "Q5": { kind: "QUESTION", title: "A \"No Program\" date in an unpublished month shows on calendar links",
    ref: "DOMAIN-MODEL §3 CalendarFeed: shows \"published (and canceled, as No Program) sessions … Drafts never appear\"",
    repro: "In a month not yet published, the leader makes a draft date No Program. select * from calendar_feed_events(<their token>) → that date appears as canceled, although the rest of the month (drafts) doesn't." },
  "Q6": { kind: "QUESTION", title: "Removing a musician from a draft leaves no audit trace",
    ref: "DOMAIN-MODEL §6 AuditLog: \"Every create, change or approval of schedules\"; audit_log.action allows only insert/update",
    repro: "As a musician on a draft: delete from session_assignment where … → the row is gone and audit_log has no 'delete' entry for it." },
  "Q7": { kind: "QUESTION", title: "May a published date be left without a leader for a moment (two-step swap)?",
    ref: "DOMAIN-MODEL §3 Session invariant (exactly one leader) vs. how a swap is done: the one-leader index forces \"demote, then promote\", so the database lets a planner leave a published date with no leader",
    repro: "Publish a month. As the point person: update session_assignment set role='participant' where session_id=<published> and role='leader' → accepted; the published date has no leader until someone is promoted." },
  "Q8": { kind: "QUESTION", title: "§7 Permissions still says the Admin Lead edits draft sessions and sets up the schedule",
    ref: "DOMAIN-MODEL §7 row \"Edit draft and published sessions; publish a month…: RosterMember.is_admin_lead\" vs. Who does what (v0.18), which limits the Admin Lead to published dates, one-time events and the drafts they play in",
    repro: "As the Admin Lead, not playing a draft date: update session set title='x' → 0 rows (the code follows v0.18; §7 hasn't been updated)." },
  "Q9": { kind: "QUESTION", title: "A deactivated musician can still be put on (and lead) a date",
    ref: "DOMAIN-MODEL §2 Person: deactivating \"blocks sign-in and hides all data from that person at once\"; SessionAssignment (D11) requires an ACTIVE person only for subs",
    repro: "Deactivate a roster musician. As the point person: insert into session_assignment (session_id, person_id, role) values (<draft>, <deactivated>, 'leader') → accepted, and the month publishes with them as leader." },
  "K5": { kind: "KNOWN BUG", title: "A session's date can move outside every season its musicians are on",
    ref: "DOMAIN-MODEL §2 RosterMember (D16): the roster is everyone who plays that season; session_assignment_guard enforces it only when an assignment is added",
    repro: "As a musician playing a draft special event: update session set starts_at = starts_at + interval '2 years' → accepted; its musicians now play on a date no roster covers." },
};

export function checker() {
  let pass = 0, fail = 0, flagged = 0;
  const seen = new Map(); // id -> [{name, detail}]
  function check(name, cond, detail, tagId) {
    if (cond && tagId) {
      // Strict: a tagged check that now passes means the bug was fixed (or the
      // question answered). Fail, so whoever fixed it removes the tag in the
      // same change and the check starts guarding against a comeback.
      fail++;
      console.log(`FAIL ${name}: ${FINDINGS[tagId].kind} ${tagId} now passes. Remove its tag from this check (and from FINDINGS if no check uses it).`);
      return true;
    }
    if (cond) { pass++; console.log("PASS", name); return true; }
    if (tagId) {
      flagged++;
      const f = FINDINGS[tagId];
      if (!f) throw new Error(`unknown finding ${tagId}`);
      if (!seen.has(tagId)) seen.set(tagId, []);
      seen.get(tagId).push({ name, detail });
      console.log(`${f.kind} [${tagId}]`, name, JSON.stringify(detail ?? null).slice(0, 300));
      return false;
    }
    fail++; console.log("FAIL", name, JSON.stringify(detail ?? null).slice(0, 2000));
    return false;
  }
  // Record a finding that isn't a failing check (e.g. two doc passages that
  // disagree while the code follows one of them).
  function flag(tagId, name, detail) {
    flagged++;
    if (!FINDINGS[tagId]) throw new Error(`unknown finding ${tagId}`);
    if (!seen.has(tagId)) seen.set(tagId, []);
    seen.get(tagId).push({ name, detail });
    console.log(`${FINDINGS[tagId].kind} [${tagId}]`, name);
  }
  function summary(extra = "") {
    console.log(`\n${pass} passed, ${fail} failed, ${flagged} flagged as findings${extra}`);
    if (seen.size) {
      console.log("\nFINDINGS (reported, not failed):");
      for (const [tagId, hits] of seen) {
        const f = FINDINGS[tagId];
        console.log(`- ${f.kind} ${tagId}: ${f.title} (${hits.length} check${hits.length > 1 ? "s" : ""})`);
        console.log(`    doc: ${f.ref}`);
        console.log(`    repro: ${f.repro}`);
      }
    }
    return { pass, fail, flagged, seen };
  }
  return { check, flag, summary, counts: () => ({ pass, fail, flagged }) };
}

// ---- Calendar arithmetic in plain JavaScript, so expectations come from the
// rules in the docs, not from the SQL being tested.
export const ymd = (d) => d.toISOString().slice(0, 10);
export function addMonths(first, k) {
  const d = new Date(first + "T00:00:00Z"); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); return ymd(d);
}
export function addDays(day, k) { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return ymd(d); }
export function lastDay(first) { const d = new Date(first + "T00:00:00Z"); return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
export function monthDays(first) { const out = []; for (let d = first; d <= lastDay(first); d = addDays(d, 1)) out.push(d); return out; }
export function isoDow(day) { const w = new Date(day + "T00:00:00Z").getUTCDay(); return w === 0 ? 7 : w; }
// The dates a Series produces in a month (DOMAIN-MODEL §3 Series.recurrence).
export function seriesDates(s, first) {
  return monthDays(first).filter((d) =>
    s.weekdays.includes(isoDow(d)) && d >= s.from && (!s.until || d <= s.until) &&
    (s.week_of_month == null || Math.floor((Number(d.slice(8)) - 1) / 7) + 1 === s.week_of_month));
}

// Seeded random numbers (mulberry32), for the property test.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
}
