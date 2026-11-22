"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { readImportFile } from "@/lib/import-workbook";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkImport, type ImportPlan, type ImportProblem } from "@/shared/domain/import";

// Admin import (v0.30): check the spreadsheet, then apply it. Everything is
// written with the admin's own session (Row Level Security decides), except
// creating sign-in accounts for new people, which needs the server key and
// sends no email. Running the same file again adds only what's missing.

export type ImportCheck = {
  status: "checked" | "applied" | "error";
  message?: string;
  errors: ImportProblem[];
  warnings: ImportProblem[];
  counts?: Record<string, number>;
  log?: string[];
};

const MAX_BYTES = 5 * 1024 * 1024;
const k = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

async function load(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a spreadsheet (.xlsx) first." };
  if (file.size > MAX_BYTES) return { error: "That file is too big (over 5 MB)." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Use an Excel .xlsx file (in Google Sheets: File → Download → .xlsx)." };
  try {
    const { raw, missingTabs } = await readImportFile(Buffer.from(await file.arrayBuffer()));
    const supabase = await createClient();
    const { data: people } = await supabase.from("person").select("name, email");
    const checked = checkImport(raw, (people ?? []) as { name: string; email: string }[]);
    for (const t of missingTabs) checked.warnings.unshift({ tab: t, row: 0, message: `No "${t}" tab; nothing from it will be imported.` });
    return { checked };
  } catch (e) {
    console.error("import read failed:", e instanceof Error ? e.message : e);
    return { error: "We couldn't read that file. Is it an .xlsx spreadsheet?" };
  }
}

const countsOf = (plan: ImportPlan) => ({
  People: plan.people.length,
  Buildings: plan.sites.length,
  Programs: plan.programs.length,
  "Roster entries": plan.roster.length,
  "Weekly programs": plan.weekly.length,
});

export async function checkImportFile(_prev: ImportCheck | null, form: FormData): Promise<ImportCheck> {
  await requireAdmin();
  const r = await load(form);
  if ("error" in r) return { status: "error", message: r.error, errors: [], warnings: [] };
  const { plan, errors, warnings } = r.checked;
  return { status: "checked", errors, warnings, counts: countsOf(plan) };
}

export async function applyImportFile(_prev: ImportCheck | null, form: FormData): Promise<ImportCheck> {
  await requireAdmin();
  const r = await load(form);
  if ("error" in r) return { status: "error", message: r.error, errors: [], warnings: [] };
  const { plan, errors, warnings } = r.checked;
  if (errors.length) return { status: "error", message: "Fix the problems below first; nothing was imported.", errors, warnings };

  const supabase = await createClient();
  const log: string[] = [];
  const fail = (what: string, e: { message: string }) => {
    console.error("import failed:", what, e.message);
    throw new Error(`${what}: ${e.message}`);
  };

  try {
    // 1. People: create quietly (no invite email) unless they're already in the app.
    const admin = createAdminClient();
    const { data: existing } = await supabase.from("person").select("id, name, email");
    const people = new Map<string, string>(); // key(name) → id
    for (const p of existing ?? []) people.set(k(p.name), p.id);
    for (const p of plan.people) {
      const found = (existing ?? []).find((e) => e.email === p.email);
      if (found) {
        people.set(k(p.name), found.id);
        continue;
      }
      const { data: created, error } = await admin.auth.admin.createUser({ email: p.email, email_confirm: true });
      if (error || !created.user) fail(`${p.name} (${p.email}) sign-in account`, error ?? { message: "not created" });
      const { error: insErr } = await supabase.from("person").insert({
        id: created.user!.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        instruments: p.instruments,
        employment_type: p.employment,
        job_title: p.jobTitle,
        system_roles: p.admin ? ["admin"] : [],
        invited_at: null,
      });
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user!.id);
        fail(`${p.name}`, insErr);
      }
      people.set(k(p.name), created.user!.id);
      log.push(`Added ${p.name} (not invited yet)`);
    }
    const personId = (n: string) => people.get(k(n))!;

    // 2. Partners, buildings and rooms.
    const { data: partnerRows } = await supabase.from("partner").select("id, display_name");
    const partners = new Map((partnerRows ?? []).map((p) => [k(p.display_name), p.id as string]));
    const siteIds = new Map<string, string>();
    const roomIds = new Map<string, string>();
    for (const s of plan.sites) {
      let partnerId = partners.get(k(s.partner));
      if (!partnerId) {
        const { data, error } = await supabase.from("partner").insert({ legal_name: s.partner, display_name: s.partner }).select("id").single();
        if (error) fail(`Partner ${s.partner}`, error);
        partnerId = data!.id as string;
        partners.set(k(s.partner), partnerId);
        log.push(`Added partner ${s.partner}`);
      }
      const { data: siteRow } = await supabase.from("site").select("id").eq("partner_id", partnerId).ilike("name", s.building).maybeSingle();
      let siteId = siteRow?.id as string | undefined;
      if (!siteId) {
        const { data, error } = await supabase
          .from("site")
          .insert({ partner_id: partnerId, name: s.building, display_name: s.building, city: s.city, state: s.state, timezone: s.timezone })
          .select("id")
          .single();
        if (error) fail(`Building ${s.building}`, error);
        siteId = data!.id as string;
        log.push(`Added building ${s.building}`);
      }
      siteIds.set(`${k(s.partner)}|${k(s.building)}`, siteId);
      const { data: rooms } = await supabase.from("location").select("id, name").eq("site_id", siteId);
      const roomNames = new Set([...s.rooms, ...plan.weekly.filter((w) => k(w.building) === k(s.building)).map((w) => w.room)]);
      for (const room of roomNames) {
        let id = (rooms ?? []).find((x) => k(x.name) === k(room))?.id as string | undefined;
        if (!id) {
          const { data, error } = await supabase.from("location").insert({ site_id: siteId, name: room, display_name: room }).select("id").single();
          if (error) fail(`Room ${room} at ${s.building}`, error);
          id = data!.id as string;
        }
        roomIds.set(`${siteId}|${k(room)}`, id);
      }
    }

    // 3. Programs, seasons, point people, rosters.
    const seasonOf = new Map<string, { residencyId: string; seasonId: string; startsOn: string; endsOn: string; partner: string }>();
    for (const p of plan.programs) {
      const partnerId = partners.get(k(p.partner));
      if (!partnerId) fail(`Program ${p.program}`, { message: `partner ${p.partner} isn't on the Buildings tab` });
      const { data: resRow } = await supabase.from("residency").select("id").eq("partner_id", partnerId!).ilike("name", p.program).maybeSingle();
      let residencyId = resRow?.id as string | undefined;
      if (!residencyId) {
        const { data, error } = await supabase.from("residency").insert({ partner_id: partnerId, name: p.program, display_name: p.program, status: "active" }).select("id").single();
        if (error) fail(`Program ${p.program}`, error);
        residencyId = data!.id as string;
        log.push(`Added program ${p.program}`);
      }
      for (const b of p.buildings) {
        const siteId = siteIds.get(`${k(p.partner)}|${k(b)}`)!;
        await supabase.from("residency_site").upsert({ residency_id: residencyId, site_id: siteId }, { onConflict: "residency_id,site_id", ignoreDuplicates: true });
      }
      const { data: seasonRow } = await supabase.from("season").select("id").eq("residency_id", residencyId).ilike("name", p.season).maybeSingle();
      let seasonId = seasonRow?.id as string | undefined;
      if (!seasonId) {
        const { data, error } = await supabase
          .from("season")
          .insert({ residency_id: residencyId, name: p.season, kind: "semester", starts_on: p.startsOn, ends_on: p.endsOn })
          .select("id")
          .single();
        if (error) fail(`Season ${p.season} for ${p.program}`, error);
        seasonId = data!.id as string;
        log.push(`Added season ${p.season} for ${p.program}`);
      }
      seasonOf.set(k(p.program), { residencyId: residencyId!, seasonId: seasonId!, startsOn: p.startsOn, endsOn: p.endsOn, partner: p.partner });
      if (p.pointPerson) {
        const pid = personId(p.pointPerson);
        const { data: current } = await supabase.from("staff_assignment").select("id, person_id").eq("residency_id", residencyId).eq("role", "point_person").is("ends_on", null);
        if (!(current ?? []).some((c) => c.person_id === pid)) {
          const { error } = await supabase.from("staff_assignment").insert({ residency_id: residencyId, person_id: pid, role: "point_person", starts_on: p.startsOn });
          if (error) fail(`Point person for ${p.program}`, error);
          log.push(`${p.pointPerson} is point person for ${p.program}`);
        }
      }
    }
    for (const r of plan.roster) {
      const s = seasonOf.get(k(r.program))!;
      const pid = personId(r.musician);
      const { data: m } = await supabase.from("roster_member").select("id").eq("season_id", s.seasonId).eq("person_id", pid).maybeSingle();
      if (!m) {
        const { error } = await supabase.from("roster_member").insert({ season_id: s.seasonId, person_id: pid, is_core: r.core, is_admin_lead: r.adminLead, joined_on: s.startsOn });
        if (error) fail(`${r.musician} on ${r.program}'s roster`, error);
      }
    }

    // 4. Weekly and monthly programs. A row counts as already imported when one
    // with the same title, room, day, week and time exists; identical rows in
    // the file (e.g. two musicians at once) are matched one for one.
    const seen = new Map<string, number>();
    for (const w of plan.weekly) {
      const s = seasonOf.get(k(w.program))!;
      const siteId = siteIds.get(`${k(s.partner)}|${k(w.building)}`)!;
      const locationId = roomIds.get(`${siteId}|${k(w.room)}`)!;
      const { data: same } = await supabase
        .from("series")
        .select("id, weekdays, start_time, default_location_id, recurrence, week_of_month")
        .eq("residency_id", s.residencyId)
        .ilike("title", w.title);
      const sameKey = `${s.residencyId}|${k(w.title)}|${locationId}|${w.weekdays.join(",")}|${w.recurrence}|${w.weekOfMonth ?? ""}|${w.startTime}`;
      const nth = seen.get(sameKey) ?? 0;
      seen.set(sameKey, nth + 1);
      const already = (same ?? []).filter(
        (x) =>
          (x.start_time as string)?.slice(0, 5) === w.startTime &&
          JSON.stringify(x.weekdays) === JSON.stringify(w.weekdays) &&
          x.default_location_id === locationId &&
          x.recurrence === w.recurrence &&
          (x.week_of_month ?? null) === w.weekOfMonth,
      ).length;
      if (already > nth) continue;
      const { data, error } = await supabase
        .from("series")
        .insert({
          residency_id: s.residencyId,
          kind: "group_session",
          title: w.title,
          default_location_id: locationId,
          weekdays: w.weekdays,
          start_time: w.startTime,
          minutes: w.minutes,
          active_from: s.startsOn,
          active_until: s.endsOn,
          recurrence: w.recurrence,
          week_of_month: w.weekOfMonth,
          default_leader_id: w.leader ? personId(w.leader) : null,
        })
        .select("id")
        .single();
      if (error) fail(`Weekly program ${w.title} (${w.program})`, error);
      if (w.musicians.length) {
        const { error: e2 } = await supabase.from("series_default_person").insert(w.musicians.map((n) => ({ series_id: data!.id, person_id: personId(n) })));
        if (e2) fail(`Usual musicians for ${w.title}`, e2);
      }
      log.push(`Added ${w.title} (${w.program})`);
    }
  } catch (e) {
    revalidatePath("/admin/people");
    return {
      status: "error",
      message: `Stopped partway: ${e instanceof Error ? e.message : "something went wrong"}. What was added before this stays; fix the problem and run the same file again to add the rest.`,
      errors: [],
      warnings,
      log,
    };
  }

  revalidatePath("/admin/people");
  revalidatePath("/residencies");
  return { status: "applied", errors: [], warnings, counts: countsOf(plan), log };
}
