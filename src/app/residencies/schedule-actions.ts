"use server";

// Weekly programs (Series) and a month's sessions. Every write runs with the
// signed-in person's own session, so the database's rules decide who may do
// what (DOMAIN-MODEL v0.12): schedulers do everything on drafts; any roster
// musician edits a draft's title, room and who plays (special events: also
// date and time).

import { revalidatePath } from "next/cache";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deliverSoon } from "@/lib/notify";
import {
  CANCELLATION_REASONS,
  SESSION_KINDS,
  validateSeries,
  type CancellationReason,
  type SessionKind,
} from "@/shared/domain/scheduling";
import { zonedToUtc } from "@/shared/domain/time";

export type ScheduleResult = { status: "idle" | "saved" | "error"; message?: string; errors?: Record<string, string> };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const ok: ScheduleResult = { status: "saved" };

function fail(error: { code?: string; message: string }): ScheduleResult {
  const m = error.message;
  if (error.code === "42501") {
    if (m.includes("musicians can change")) return { status: "error", message: "On drafts you play in, you can change the title, room, notes and musicians (and a special event's date and time). The date's leader can make it “No Program”." };
    return { status: "error", message: "You don't have permission to make that change." };
  }
  if (error.code === "23514") {
    if (m.includes("roster")) return { status: "error", message: "That person isn't on this program's roster for that date." };
    if (m.includes("location")) return { status: "error", message: "Pick a room at one of this program's sites." };
    return { status: "error", message: m };
  }
  if (error.code === "23505") {
    if (m.includes("one_leader")) return { status: "error", message: "This program already has a leader." };
    return { status: "error", message: "That's already there." };
  }
  console.error("schedule change failed:", error.code, m);
  return { status: "error", message: "We couldn't save that. Please try again." };
}

const refresh = (residencyId: string) => revalidatePath(`/residencies/${residencyId}`, "layout");

// ---- Weekly programs (Series) ----

function seriesFromForm(form: FormData) {
  const kind = (String(form.get("kind") ?? "group_session") as SessionKind);
  const start = String(form.get("start_time") ?? "").trim();
  const minutesText = String(form.get("minutes") ?? "").trim();
  const recurrence: "weekly" | "monthly" = form.get("recurrence") === "monthly" ? "monthly" : "weekly";
  return {
    recurrence,
    week_of_month: recurrence === "monthly" ? Number(form.get("week_of_month")) || null : null,
    skip_weeks_of_month: recurrence === "weekly" ? [...new Set(form.getAll("skip_weeks_of_month").map(Number))].sort() : [],
    kind: SESSION_KINDS.includes(kind) ? kind : "group_session",
    title: String(form.get("title") ?? ""),
    default_location_id: String(form.get("default_location_id") ?? ""),
    weekdays: form.getAll("weekdays").map(Number),
    start_time: start || null,
    minutes: minutesText ? Number(minutesText) : null,
    active_from: String(form.get("active_from") ?? ""),
    active_until: String(form.get("active_until") ?? "") || null,
    default_leader_id: isId(String(form.get("default_leader_id") ?? "")) ? String(form.get("default_leader_id")) : null,
    default_interaction_type_id: isId(String(form.get("default_interaction_type_id") ?? "")) ? String(form.get("default_interaction_type_id")) : null,
  };
}

export async function saveSeries(residencyId: string, seriesId: string | null, _prev: ScheduleResult, form: FormData): Promise<ScheduleResult> {
  await requirePerson();
  const input = seriesFromForm(form);
  const errors = validateSeries(input);
  if (Object.keys(errors).length) return { status: "error", errors };
  const row = { ...input, title: input.title.trim() };
  const supabase = await createClient();
  const people = form.getAll("default_person_id").filter(isId);

  let id = seriesId;
  if (id) {
    const { error } = await supabase.from("series").update(row).eq("id", id);
    if (error) return fail(error);
  } else {
    const { data, error } = await supabase.from("series").insert({ ...row, residency_id: residencyId }).select("id").single();
    if (error) return fail(error);
    id = data.id as string;
  }
  // Default musicians: replace the list.
  const { error: delError } = await supabase.from("series_default_person").delete().eq("series_id", id);
  if (delError) return fail(delError);
  if (people.length) {
    const { error } = await supabase.from("series_default_person").insert(people.map((person_id) => ({ series_id: id, person_id })));
    if (error) return fail(error);
  }
  // Skipped weeks and new start or end dates apply to dates already filled in (v0.34).
  if (seriesId) {
    const { data, error } = await supabase.rpc("tidy_series_dates", { p_series: id });
    if (error) return fail(error);
    refresh(residencyId);
    const { removed = 0, skipped = 0 } = (data ?? {}) as { removed?: number; skipped?: number };
    const notes = [
      skipped ? `${skipped} draft date${skipped === 1 ? "" : "s"} on a skipped week ${skipped === 1 ? "is" : "are"} now “No Program”` : null,
      removed ? `${removed} draft date${removed === 1 ? "" : "s"} outside the program's dates removed` : null,
    ].filter(Boolean);
    return { status: "saved", message: notes.length ? `Saved. ${notes.join("; ")}.` : undefined };
  }
  refresh(residencyId);
  return ok;
}

// Ending a weekly program mid-season, and deleting one set up by mistake (v0.34).
export type EndResult = ScheduleResult & { removed?: number; published?: { id: string; starts_at: string }[] };

export async function endSeries(residencyId: string, seriesId: string, _prev: EndResult, form: FormData): Promise<EndResult> {
  await requirePerson();
  const last = String(form.get("last_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return { status: "error", message: "Pick the program's last date." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("end_series", { p_series: seriesId, p_last: last });
  if (error) {
    if (error.message.includes("before the program starts")) return { status: "error", message: "That's before the program starts. To remove it completely, delete it instead." };
    return fail(error);
  }
  refresh(residencyId);
  const r = (data ?? {}) as { removed?: number; published?: { id: string; starts_at: string }[] };
  return { status: "saved", removed: r.removed ?? 0, published: r.published ?? [] };
}

export async function deleteSeries(residencyId: string, seriesId: string): Promise<ScheduleResult & { removed?: number }> {
  await requirePerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_series", { p_series: seriesId });
  if (error) {
    if (error.code === "23514") {
      const why = error.message.includes("documented")
        ? "Some of its dates are already documented"
        : error.message.includes("relationship")
          ? "Relationship building is logged on some of its dates"
          : "Some of its dates are in a week whose hours are approved";
      return { status: "error", message: `${why}, so it can't be deleted. End it instead: its past dates stay and later drafts are removed.` };
    }
    return fail(error);
  }
  refresh(residencyId);
  return { status: "saved", removed: data as number };
}

export async function fillMonth(residencyId: string, month: string): Promise<ScheduleResult & { created?: number }> {
  await requirePerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_residency_month", { p_residency: residencyId, p_month: `${month}-01` });
  if (error) return fail(error);
  refresh(residencyId);
  return { status: "saved", created: data as number };
}

// ---- One session ----

export async function setSessionTitle(residencyId: string, sessionId: string, title: string): Promise<ScheduleResult> {
  await requirePerson();
  const t = title.trim();
  if (!t || t.length > 200) return { status: "error", message: "Enter a title (200 characters or fewer)." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("session").update({ title: t }, { count: "exact" }).eq("id", sessionId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "This program is no longer a draft, so it can't be changed here." };
  refresh(residencyId);
  return ok;
}

/** Internal notes ("Ben off"); never print. Any roster musician on drafts (v0.14). */
export async function setSessionNote(residencyId: string, sessionId: string, note: string): Promise<ScheduleResult> {
  await requirePerson();
  const n = note.trim();
  if (n.length > 2000) return { status: "error", message: "Keep notes under 2,000 characters." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("session").update({ internal_note: n || null }, { count: "exact" }).eq("id", sessionId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "This program is no longer a draft, so it can't be changed here." };
  refresh(residencyId);
  return ok;
}

export async function setSessionRoom(residencyId: string, sessionId: string, locationId: string): Promise<ScheduleResult> {
  await requirePerson();
  if (!isId(locationId)) return { status: "error", message: "Pick a room." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("session").update({ location_id: locationId }, { count: "exact" }).eq("id", sessionId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "This program is no longer a draft, so it can't be changed here." };
  refresh(residencyId);
  return ok;
}

/** Special events: any roster musician may move the date and time (v0.12). */
export async function setSessionWhen(residencyId: string, sessionId: string, date: string, time: string, timeZone: string): Promise<ScheduleResult> {
  await requirePerson();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { status: "error", message: "Enter a date and time." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("session")
    .update({ starts_at: zonedToUtc(date, time, timeZone) }, { count: "exact" })
    .eq("id", sessionId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "This program can't be moved here." };
  refresh(residencyId);
  return ok;
}

export async function addMusician(residencyId: string, sessionId: string, personId: string): Promise<ScheduleResult> {
  await requirePerson();
  if (!isId(personId)) return { status: "error", message: "Pick a musician." };
  const supabase = await createClient();
  const { error } = await supabase.from("session_assignment").insert({ session_id: sessionId, person_id: personId });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

/** Delete a one-time date (special event or other one-time program), v0.37. */
export async function deleteOneTimeSession(residencyId: string, sessionId: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_one_time_session", { p_session: sessionId });
  if (error) {
    if (error.code === "23514") {
      const why = error.message.includes("documented")
        ? "It's already documented"
        : error.message.includes("relationship")
          ? "Relationship building is logged on it"
          : error.message.includes("approved")
            ? "It's in a week whose hours are approved"
            : "It belongs to a weekly program";
      return { status: "error", message: `${why}, so it can't be deleted. Make it “No Program” instead.` };
    }
    return fail(error);
  }
  refresh(residencyId);
  return ok;
}

export async function removeMusician(residencyId: string, assignmentId: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error, count } = await supabase.from("session_assignment").delete({ count: "exact" }).eq("id", assignmentId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "Only drafts can change who plays this way. On a published date, mark the musician absent or record a sub instead." };
  refresh(residencyId);
  return ok;
}

/** Point person first, then the Admin Lead may swap; admins always (v0.12). */
export async function setLeader(residencyId: string, sessionId: string, personId: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error: e1 } = await supabase
    .from("session_assignment")
    .update({ role: "participant" })
    .eq("session_id", sessionId)
    .eq("role", "leader")
    .neq("person_id", personId);
  if (e1) return fail(e1);
  if (isId(personId)) {
    const { error, count } = await supabase
      .from("session_assignment")
      .update({ role: "leader" }, { count: "exact" })
      .eq("session_id", sessionId)
      .eq("person_id", personId);
    if (error) return fail(error);
    if (!count) return { status: "error", message: "Only the point person, admin lead or an admin can set leaders." };
  }
  refresh(residencyId);
  return ok;
}

/** Cancel a date: prints as "No Program" (any reason). */
export async function cancelSession(residencyId: string, sessionId: string, reason: CancellationReason): Promise<ScheduleResult> {
  await requirePerson();
  if (!CANCELLATION_REASONS.includes(reason)) return { status: "error", message: "Pick a reason." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("session")
    .update({ schedule_state: "canceled", cancellation_reason: reason }, { count: "exact" })
    .eq("id", sessionId);
  if (error) return fail(error);
  if (!count) return { status: "error", message: "Only the date's leader (on drafts), the admin lead (on published dates), the point person or an admin can make it “No Program”." };
  // The database queued an email to the point person (v0.24); send it now.
  await deliverSoon();
  refresh(residencyId);
  return ok;
}

/** Restore a "No Program" date: back to a draft with its musicians and leader (v0.17). */
export async function restoreSession(residencyId: string, sessionId: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("session")
    .update({ schedule_state: "draft", cancellation_reason: null, canceled_at: null }, { count: "exact" })
    .eq("id", sessionId)
    .eq("schedule_state", "canceled");
  if (error) return fail(error);
  if (!count) return { status: "error", message: "Only the admin lead, point person or an admin can restore a date." };
  refresh(residencyId);
  return ok;
}

export async function addOneTimeSession(residencyId: string, timeZone: string, _prev: ScheduleResult, form: FormData): Promise<ScheduleResult> {
  await requirePerson();
  const e: Record<string, string> = {};
  const title = String(form.get("title") ?? "").trim();
  const location_id = String(form.get("location_id") ?? "");
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  const minutes = Number(form.get("minutes") ?? 0);
  const callTime = String(form.get("call_time") ?? "") || null;
  if (!title) e.title = "Enter a title.";
  if (!isId(location_id)) e.location_id = "Pick a room.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) e.date = "Enter a date.";
  if (!/^\d{2}:\d{2}$/.test(time)) e.time = "Enter a time.";
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 600) e.minutes = "Length must be between 5 and 600 minutes.";
  if (Object.keys(e).length) return { status: "error", errors: e };
  const supabase = await createClient();
  const { error } = await supabase.from("session").insert({
    residency_id: residencyId,
    title,
    location_id,
    starts_at: zonedToUtc(date, time, timeZone),
    scheduled_minutes: minutes,
    call_time: callTime,
    is_special_event: form.get("is_special_event") === "on",
    is_extra: form.get("is_extra") === "on",
  });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

// ---- Review and publish (DOMAIN-MODEL section 3, "Publishing a month") ----

function publishFail(error: { code?: string; message: string }): ScheduleResult {
  const m = error.message;
  if (m.includes("leader")) return { status: "error", message: `Can't publish yet: ${m.replace(/^.*?(\d+ group session)/, "$1")}.` };
  if (m.includes("reviewed first") || m.includes("mark this month reviewed")) return { status: "error", message: "The point person needs to mark this month reviewed first." };
  if (m.includes("already been reviewed")) return { status: "error", message: "This month is already reviewed." };
  if (m.includes("already published")) return { status: "error", message: "This month is already published. Download an updated version instead." };
  if (m.includes("only the point person")) return { status: "error", message: "Only the point person or an admin can mark a month reviewed." };
  return fail(error);
}

export async function markMonthReviewed(residencyId: string, siteId: string, month: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_month_reviewed", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` });
  if (error) return publishFail(error);
  refresh(residencyId);
  return ok;
}

export async function publishMonth(residencyId: string, siteId: string, month: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_month", { p_residency: residencyId, p_site: siteId, p_month: `${month}-01` });
  if (error) return publishFail(error);
  refresh(residencyId);
  return ok;
}

export async function newCalendarVersion(residencyId: string, siteId: string, month: string, feedback: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("new_calendar_version", {
    p_residency: residencyId,
    p_site: siteId,
    p_month: `${month}-01`,
    p_partner_feedback: feedback.trim() || null,
  });
  if (error) return publishFail(error);
  refresh(residencyId);
  return ok;
}

// ---- Season view (DOMAIN-MODEL v0.16) ----

/** Leader for the whole season: sets the usual leader and every draft date from today on. */
export async function setSeriesLeaderForSeason(residencyId: string, seriesId: string, personId: string): Promise<ScheduleResult & { changed?: number }> {
  await requirePerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_series_leader", { p_series: seriesId, p_person: isId(personId) ? personId : null });
  if (error) return fail(error);
  refresh(residencyId);
  return { status: "saved", changed: data as number };
}

export async function fillSeason(residencyId: string, seasonId: string): Promise<ScheduleResult & { created?: number }> {
  await requirePerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_season", { p_season: seasonId });
  if (error) return fail(error);
  refresh(residencyId);
  return { status: "saved", created: data as number };
}

// ---- Collaboration target (v0.19) ----

export async function setCollaborationTarget(residencyId: string, seasonId: string, value: number): Promise<ScheduleResult> {
  await requirePerson();
  if (!Number.isInteger(value) || value < 0 || value > 100) return { status: "error", message: "Enter a number from 0 to 100." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("target")
    .upsert({ season_id: seasonId, metric: "collaborative_programs_per_musician", value }, { onConflict: "season_id,metric" });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

// ---- Usual relationship-building lengths (point person or admin; v0.21) ----

export async function setActivityLengths(residencyId: string, lengths: { kind: string; minutes: number }[]): Promise<ScheduleResult> {
  await requirePerson();
  const rows = lengths.filter((l) => ["one_to_one", "mini_group", "hallway_concert"].includes(l.kind) && l.minutes);
  if (rows.some((l) => !Number.isInteger(l.minutes) || l.minutes < 1 || l.minutes > 600)) return { status: "error", message: "Enter minutes from 1 to 600." };
  if (!rows.length) return ok;
  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_length")
    .upsert(rows.map((l) => ({ residency_id: residencyId, kind: l.kind, minutes: l.minutes })), { onConflict: "residency_id,kind" });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

// ---- Approving hours (point person or admin; v0.19) ----

export async function approveWeek(residencyId: string, personId: string, week: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_week", { p_person: personId, p_residency: residencyId, p_week: week });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}

export async function returnWeek(residencyId: string, personId: string, week: string, note: string): Promise<ScheduleResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("return_week", { p_person: personId, p_residency: residencyId, p_week: week, p_note: note });
  if (error) return fail(error);
  refresh(residencyId);
  return ok;
}
