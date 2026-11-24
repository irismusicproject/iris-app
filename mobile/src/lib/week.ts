import { addDays, weekStart, type ActivityKind, type ResidentInvolvement } from "@shared/domain/documentation";
import { localDateTime } from "@shared/domain/time";
import { supabase } from "./supabase";

// One musician's week (Monday–Sunday), loaded the same way as the website's
// "My week" (src/app/documentation/page.tsx). Every query runs as the
// signed-in person, so the database's rules decide what comes back. Nothing
// here is saved on the phone: it lives only while a screen is open.

export type Site = { id: string; display_name: string; timezone: string; detailed_relationship_notes: boolean };
export type WeekResidency = { id: string; name: string; sites: Site[]; season: { id: string; starts_on: string; ends_on: string } };
export type WeekSession = {
  id: string;
  residency_id: string;
  kind: "group_session" | "relationship_building";
  title: string;
  starts_at: string;
  has_set_time: boolean;
  scheduled_minutes: number | null;
  schedule_state: "draft" | "published" | "canceled";
  is_special_event: boolean;
  location: { site_id: string; display_name: string } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
  series: { default_interaction_type_id: string | null } | null;
  session_report: { attendance: number; interaction_type_id: string; resident_involvement: ResidentInvolvement; actual_minutes: number; notes: string | null; site_id: string | null } | null;
};
export type WeekActivity = {
  id: string;
  residency_id: string;
  site_id: string;
  occurred_on: string;
  kind: ActivityKind;
  minutes: number;
  collaborative: boolean;
  note: string | null;
  start_time: string | null;
  end_time: string | null;
  person_id: string;
  relationship_activity_musician: { person_id: string }[];
  relationship_activity_resident: { room: string | null; resident: { display_name: string } | null }[];
};
export type Resident = { id: string; siteId: string; name: string; room: string | null };
export type LastActivity = { residencyId: string; siteId: string; kind: ActivityKind; minutes: number; collaborative: boolean; residentIds: string[] };
export type WeekHours = {
  residencyId: string;
  residencyName: string;
  hours: { name: string; hours: number }[];
  state: "draft" | "submitted" | "approved" | null;
  returnedNote: string | null;
};

export type Week = {
  monday: string;
  sunday: string;
  month: string;
  today: string;
  residencies: WeekResidency[];
  siteById: Map<string, Site>;
  led: WeekSession[];
  ledPast: WeekSession[];
  ledFuture: WeekSession[];
  playedNotLed: number;
  types: { id: string; label: string }[];
  residents: Resident[];
  activities: WeekActivity[];
  names: Map<string, Map<string, string>>;
  colleagues: Record<string, { id: string; label: string }[]>;
  lengths: Record<string, Partial<Record<ActivityKind, number>>>;
  last: LastActivity | null;
  progress: { id: string; name: string; done: number; target: number }[];
  hours: WeekHours[];
  reflections: Map<string, { highlights: string; challenges: string }>;
};

/** Today in the phone's own time zone ("YYYY-MM-DD"). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The week shown first: on Monday or Tuesday, last week (it's due Tuesday); otherwise this week. Same as the website. */
export function defaultWeek(): string {
  const today = todayIso();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return weekStart(dow === 1 || dow === 2 ? addDays(today, -7) : today);
}

export function siteTimezone(week: Week, s: { location: { site_id: string } | null }): string {
  return week.siteById.get(s.location?.site_id ?? "")?.timezone ?? "America/New_York";
}

export async function loadWeek(personId: string, anyDay: string): Promise<Week> {
  const today = todayIso();
  const monday = weekStart(anyDay);
  const sunday = addDays(monday, 6);
  const month = sunday.slice(0, 7);

  // Programs the musician is on (current or covering this week).
  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_member")
    .select("season(id, residency_id, starts_on, ends_on, residency(id, name, residency_site(site(id, display_name, timezone, detailed_relationship_notes))))")
    .eq("person_id", personId);
  if (rosterError) throw rosterError;
  type RosterRow = { season: { id: string; residency_id: string; starts_on: string; ends_on: string; residency: { id: string; name: string; residency_site: { site: Site | null }[] } | null } | null };
  const residencyMap = new Map<string, WeekResidency>();
  for (const r of (rosterRows ?? []) as unknown as RosterRow[]) {
    const res = r.season?.residency;
    if (!res || r.season!.ends_on < monday || r.season!.starts_on > sunday) continue;
    residencyMap.set(res.id, {
      id: res.id,
      name: res.name,
      sites: res.residency_site.map((x) => x.site!).filter(Boolean),
      season: { id: r.season!.id, starts_on: r.season!.starts_on, ends_on: r.season!.ends_on },
    });
  }
  const residencies = [...residencyMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const ids = residencies.map((p) => p.id);
  const siteById = new Map(residencies.flatMap((p) => p.sites).map((s) => [s.id, s]));

  // Relationship building shared with me by another musician (v0.24).
  const { data: sharedRows } = await supabase.from("relationship_activity_musician").select("activity_id").eq("person_id", personId);
  const sharedIds = (sharedRows ?? []).map((r) => r.activity_id as string);
  const from = new Date(`${addDays(monday, -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(sunday, 2)}T00:00:00Z`).toISOString();
  const empty = Promise.resolve({ data: [] as never[], error: null });
  const [sessionRes, typeRes, residentRes, activityRes, reflectionRes] = await Promise.all([
    ids.length
      ? supabase
          .from("session")
          .select("id, residency_id, kind, title, starts_at, has_set_time, scheduled_minutes, schedule_state, is_special_event, location(site_id, display_name), session_assignment(person_id, role, status), session_report(attendance, interaction_type_id, resident_involvement, actual_minutes, notes, site_id), series(default_interaction_type_id)")
          .in("residency_id", ids)
          .gte("starts_at", from)
          .lt("starts_at", to)
          .order("starts_at")
      : empty,
    supabase.from("interaction_type").select("id, name").eq("active", true).order("sort_order"),
    siteById.size
      ? supabase.from("resident").select("id, site_id, display_name, disambiguator, room").in("site_id", [...siteById.keys()]).eq("active", true).order("display_name")
      : empty,
    supabase
      .from("relationship_activity")
      .select("id, residency_id, site_id, occurred_on, kind, minutes, collaborative, note, start_time, end_time, person_id, relationship_activity_musician(person_id), relationship_activity_resident(room, resident(display_name))")
      .or(sharedIds.length ? `person_id.eq.${personId},id.in.(${sharedIds.join(",")})` : `person_id.eq.${personId}`)
      .gte("occurred_on", monday)
      .lte("occurred_on", sunday)
      .order("occurred_on"),
    ids.length ? supabase.from("monthly_reflection").select("residency_id, highlights, challenges").eq("person_id", personId).eq("month", `${month}-01`) : empty,
  ]);
  for (const r of [sessionRes, typeRes, residentRes, activityRes, reflectionRes]) if (r.error) throw r.error;

  const inWeek = (s: WeekSession) => {
    const tz = siteById.get(s.location?.site_id ?? "")?.timezone ?? "America/New_York";
    const d = localDateTime(s.starts_at, tz).date;
    return d >= monday && d <= sunday;
  };
  const sessions = ((sessionRes.data ?? []) as unknown as WeekSession[]).filter((s) => s.schedule_state !== "canceled" && inWeek(s));
  const now = new Date().toISOString();
  const mine = (s: WeekSession) => s.session_assignment.some((a) => a.person_id === personId && a.status !== "absent");
  const led = sessions.filter(
    (s) => s.kind === "group_session" && s.session_assignment.some((a) => a.person_id === personId && a.role === "leader" && a.status !== "absent"),
  );
  const ledPast = led.filter((s) => s.starts_at <= now);
  const ledFuture = led.filter((s) => s.starts_at > now);
  const playedNotLed = sessions.filter((s) => s.kind === "group_session" && mine(s) && !led.includes(s)).length;
  const types = ((typeRes.data ?? []) as { id: string; name: string }[]).map((t) => ({ id: t.id, label: t.name }));
  const residents = ((residentRes.data ?? []) as { id: string; site_id: string; display_name: string; disambiguator: string; room: string | null }[]).map((r) => ({
    id: r.id,
    siteId: r.site_id,
    name: r.disambiguator ? `${r.display_name} (${r.disambiguator})` : r.display_name,
    room: r.room,
  }));
  const activities = (activityRes.data ?? []) as unknown as WeekActivity[];

  // Names of each program's people (names only, DOMAIN-MODEL v0.13), and roster colleagues who can share a log (v0.24).
  const names = new Map(
    await Promise.all(
      residencies.map(async (p) => {
        const { data } = await supabase.rpc("residency_people", { p_residency: p.id });
        return [p.id, new Map(((data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]))] as const;
      }),
    ),
  );
  const { data: rosterPeople } = residencies.length
    ? await supabase.from("roster_member").select("season_id, person_id, left_on").in("season_id", residencies.map((p) => p.season.id))
    : { data: [] };
  const colleagues: Record<string, { id: string; label: string }[]> = {};
  for (const p of residencies)
    colleagues[p.id] = [
      ...new Set(
        ((rosterPeople ?? []) as { season_id: string; person_id: string; left_on: string | null }[])
          .filter((r) => r.season_id === p.season.id && r.person_id !== personId && (!r.left_on || r.left_on > monday))
          .map((r) => r.person_id),
      ),
    ]
      .map((id) => ({ id, label: names.get(p.id)?.get(id) ?? "a colleague" }))
      .sort((a, b) => a.label.localeCompare(b.label));

  // Faster logging (v0.21): usual lengths per type, and the last activity.
  const [{ data: lengthRows }, { data: lastRows }] = await Promise.all([
    ids.length ? supabase.from("activity_length").select("residency_id, kind, minutes").in("residency_id", ids) : empty,
    supabase
      .from("relationship_activity")
      .select("residency_id, site_id, kind, minutes, collaborative, relationship_activity_resident(resident_id)")
      .eq("person_id", personId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const lengths: Record<string, Partial<Record<ActivityKind, number>>> = {};
  for (const l of (lengthRows ?? []) as { residency_id: string; kind: ActivityKind; minutes: number }[]) (lengths[l.residency_id] ??= {})[l.kind] = l.minutes;
  const lastRow = (lastRows ?? [])[0] as
    | { residency_id: string; site_id: string; kind: ActivityKind; minutes: number; collaborative: boolean; relationship_activity_resident: { resident_id: string }[] }
    | undefined;
  const last: LastActivity | null = lastRow
    ? { residencyId: lastRow.residency_id, siteId: lastRow.site_id, kind: lastRow.kind, minutes: lastRow.minutes, collaborative: lastRow.collaborative, residentIds: lastRow.relationship_activity_resident.map((x) => x.resident_id) }
    : null;

  // Collaboration progress this season (v0.19).
  const progress = await Promise.all(
    residencies.map(async (p) => {
      const [{ data: t }, { data: collab }] = await Promise.all([
        supabase.from("target").select("value").eq("season_id", p.season.id).eq("metric", "collaborative_programs_per_musician").maybeSingle(),
        supabase
          .from("session")
          .select("id, session_assignment!inner(person_id, status), session_report!inner(resident_involvement)")
          .eq("residency_id", p.id)
          .neq("schedule_state", "canceled")
          .neq("session_report.resident_involvement", "none")
          .eq("session_assignment.person_id", personId)
          .neq("session_assignment.status", "absent")
          .gte("starts_at", `${p.season.starts_on}T00:00:00Z`)
          .lte("starts_at", `${p.season.ends_on}T23:59:59Z`),
      ]);
      return { id: p.id, name: p.name, done: (collab ?? []).length, target: Number(t?.value ?? 2) };
    }),
  );

  // Weekly hours (v0.24): calculated from documentation, never typed.
  const [{ data: categoryRows }, { data: entryRows }] = await Promise.all([
    supabase.from("time_category").select("id, name").eq("active", true).order("sort_order"),
    supabase.from("time_entry").select("residency_id, time_category_id, hours, state, returned_note").eq("person_id", personId).eq("week_starting", monday),
  ]);
  const categories = (categoryRows ?? []) as { id: string; name: string }[];
  type EntryRow = { residency_id: string; time_category_id: string; hours: number; state: "draft" | "submitted" | "approved"; returned_note: string | null };
  const entries = (entryRows ?? []) as EntryRow[];
  const documented = new Map(
    await Promise.all(
      residencies.map(async (p) => {
        const { data } = await supabase.rpc("documented_minutes", { p_person: personId, p_residency: p.id, p_week: monday });
        return [p.id, new Map(((data ?? []) as { category: string; minutes: number }[]).map((d) => [d.category, Number(d.minutes)]))] as const;
      }),
    ),
  );
  const hours: WeekHours[] = residencies.map((p) => {
    const saved = entries.filter((e) => e.residency_id === p.id);
    const states = saved.map((e) => e.state);
    const state = states.includes("approved") ? "approved" : states.includes("submitted") ? "submitted" : saved.length ? "draft" : null;
    const savedHours = (id: string) => Number(saved.find((e) => e.time_category_id === id)?.hours ?? 0);
    return {
      residencyId: p.id,
      residencyName: p.name,
      // Approved weeks show what was approved; otherwise what's documented now.
      hours: categories.map((c) => ({
        name: c.name,
        hours: state === "approved" ? savedHours(c.id) : Math.round(((documented.get(p.id)?.get(c.name) ?? 0) / 60) * 100) / 100,
      })),
      state,
      returnedNote: saved.find((e) => e.returned_note)?.returned_note ?? null,
    };
  });

  const reflections = new Map(
    ((reflectionRes.data ?? []) as { residency_id: string; highlights: string; challenges: string }[]).map((r) => [r.residency_id, { highlights: r.highlights, challenges: r.challenges }]),
  );

  return { monday, sunday, month, today, residencies: residencies, siteById, led, ledPast, ledFuture, playedNotLed, types, residents, activities, names, colleagues, lengths, last, progress, hours, reflections };
}
