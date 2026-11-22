import { headers } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_KIND_LABELS, addDays, dueLabel, formatWeek, weekStart, type ActivityKind, type ResidentInvolvement } from "@/shared/domain/documentation";
import { formatDay, formatMonth, formatTime, localDateTime } from "@/shared/domain/time";
import { ActivityForm, CalendarLinkCard, DeleteActivityButton, LeaveSharedButton, ReflectionForm, ReportRow, WeekHours, type LastActivity } from "./forms";
import { getResidencyNames } from "@/lib/residency-access";

// "My week": a musician's documentation for one week (Monday–Sunday), due
// Tuesday 5 pm the following week (D7). Programs they led (session reports),
// relationship-building activities, and the month's reflection.
export const metadata = { title: "My week · Iris Music Project" };

type SiteRef = { id: string; display_name: string; timezone: string; detailed_relationship_notes: boolean };
type SessionRow = {
  is_special_event: boolean;
  id: string;
  residency_id: string;
  kind: "group_session" | "relationship_building";
  title: string;
  starts_at: string;
  has_set_time: boolean;
  scheduled_minutes: number | null;
  schedule_state: "draft" | "published" | "canceled";
  location: { site_id: string; display_name: string } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: "assigned" | "absent" | "substitute" }[];
  series: { default_interaction_type_id: string | null } | null;
  session_report: { attendance: number; interaction_type_id: string; resident_involvement: ResidentInvolvement; actual_minutes: number; notes: string | null; site_id: string | null } | null;
};
type ActivityRow = {
  id: string;
  residency_id: string;
  site_id: string;
  occurred_on: string;
  kind: ActivityKind;
  minutes: number;
  collaborative: boolean;
  note: string | null;
  person_id: string;
  relationship_activity_musician: { person_id: string }[];
  relationship_activity_resident: { resident: { display_name: string } | null }[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default async function MyWeek({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { person, isAdmin } = await requirePerson();
  const { week: weekParam } = await searchParams;
  // Default: on Monday or Tuesday, last week (it's due Tuesday); otherwise this week.
  const today = todayIso();
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = weekStart(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : dow === 1 || dow === 2 ? addDays(today, -7) : today);
  const sunday = addDays(monday, 6);
  const month = sunday.slice(0, 7);

  const supabase = await createClient();
  // Programs the musician is on (current or covering this week).
  const { data: rosterRows } = await supabase
    .from("roster_member")
    .select("season(id, residency_id, starts_on, ends_on, residency(id, name, residency_site(site(id, display_name, timezone, detailed_relationship_notes))))")
    .eq("person_id", person.id);
  type RosterRow = { season: { id: string; residency_id: string; starts_on: string; ends_on: string; residency: { id: string; name: string; residency_site: { site: SiteRef | null }[] } | null } | null };
  const programMap = new Map<string, { id: string; name: string; sites: SiteRef[]; season: { id: string; starts_on: string; ends_on: string } }>();
  for (const r of (rosterRows ?? []) as unknown as RosterRow[]) {
    const res = r.season?.residency;
    if (!res || r.season!.ends_on < monday || r.season!.starts_on > sunday) continue;
    programMap.set(res.id, { id: res.id, name: res.name, sites: res.residency_site.map((x) => x.site!).filter(Boolean), season: { id: r.season!.id, starts_on: r.season!.starts_on, ends_on: r.season!.ends_on } });
  }
  const programs = [...programMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const ids = programs.map((p) => p.id);
  const siteById = new Map(programs.flatMap((p) => p.sites).map((s) => [s.id, s]));

  // Relationship building shared with me by another musician (v0.24).
  const { data: sharedRows } = await supabase.from("relationship_activity_musician").select("activity_id").eq("person_id", person.id);
  const sharedIds = (sharedRows ?? []).map((r) => r.activity_id as string);
  const from = new Date(`${addDays(monday, -1)}T00:00:00Z`).toISOString();
  const to = new Date(`${addDays(sunday, 2)}T00:00:00Z`).toISOString();
  const [{ data: sessionRows }, { data: typeRows }, { data: residentRows }, { data: activityRows }, { data: reflectionRows }] = await Promise.all([
    ids.length
      ? supabase
          .from("session")
          .select("id, residency_id, kind, title, starts_at, has_set_time, scheduled_minutes, schedule_state, is_special_event, location(site_id, display_name), session_assignment(person_id, role, status), session_report(attendance, interaction_type_id, resident_involvement, actual_minutes, notes, site_id), series(default_interaction_type_id)")
          .in("residency_id", ids)
          .gte("starts_at", from)
          .lt("starts_at", to)
          .order("starts_at")
      : Promise.resolve({ data: [] }),
    supabase.from("interaction_type").select("id, name").eq("active", true).order("sort_order"),
    siteById.size ? supabase.from("resident").select("id, site_id, display_name, disambiguator").in("site_id", [...siteById.keys()]).eq("active", true).order("display_name") : Promise.resolve({ data: [] }),
    supabase
      .from("relationship_activity")
      .select("id, residency_id, site_id, occurred_on, kind, minutes, collaborative, note, person_id, relationship_activity_musician(person_id), relationship_activity_resident(resident(display_name))")
      .or(sharedIds.length ? `person_id.eq.${person.id},id.in.(${sharedIds.join(",")})` : `person_id.eq.${person.id}`)
      .gte("occurred_on", monday)
      .lte("occurred_on", sunday)
      .order("occurred_on"),
    ids.length ? supabase.from("monthly_reflection").select("residency_id, highlights, challenges").eq("person_id", person.id).eq("month", `${month}-01`) : Promise.resolve({ data: [] }),
  ]);

  const inWeek = (s: SessionRow) => {
    const tz = siteById.get(s.location?.site_id ?? "")?.timezone ?? "America/New_York";
    const d = localDateTime(s.starts_at, tz).date;
    return d >= monday && d <= sunday;
  };
  const sessions = ((sessionRows ?? []) as unknown as SessionRow[]).filter((s) => s.schedule_state !== "canceled" && inWeek(s));
  const now = new Date().toISOString();
  const mine = (s: SessionRow) => s.session_assignment.some((a) => a.person_id === person.id && a.status !== "absent");
  const led = sessions.filter(
    (s) => s.kind === "group_session" && s.session_assignment.some((a) => a.person_id === person.id && a.role === "leader" && a.status !== "absent"),
  );
  const ledPast = led.filter((s) => s.starts_at <= now);
  const ledFuture = led.filter((s) => s.starts_at > now);
  const playedNotLed = sessions.filter((s) => s.kind === "group_session" && mine(s) && !led.includes(s));
  const types = (typeRows ?? []).map((t) => ({ id: t.id as string, label: t.name as string }));
  const residents = ((residentRows ?? []) as { id: string; site_id: string; display_name: string; disambiguator: string }[]).map((r) => ({
    id: r.id,
    siteId: r.site_id,
    name: r.disambiguator ? `${r.display_name} (${r.disambiguator})` : r.display_name,
  }));
  const activities = (activityRows ?? []) as unknown as ActivityRow[];

  // Names, and roster colleagues who can share a log (v0.24).
  const nameMaps = new Map(await Promise.all(programs.map(async (p) => [p.id, await getResidencyNames(p.id)] as const)));
  const nameOf = (rid: string, pid: string) => nameMaps.get(rid)?.get(pid) ?? "a colleague";
  const { data: rosterPeople } = programs.length
    ? await supabase.from("roster_member").select("season_id, person_id, left_on").in("season_id", programs.map((p) => p.season.id))
    : { data: [] };
  const colleagues: Record<string, { id: string; label: string }[]> = {};
  for (const p of programs)
    colleagues[p.id] = [...new Set(((rosterPeople ?? []) as { season_id: string; person_id: string; left_on: string | null }[])
      .filter((r) => r.season_id === p.season.id && r.person_id !== person.id && (!r.left_on || r.left_on > monday))
      .map((r) => r.person_id))]
      .map((id) => ({ id, label: nameOf(p.id, id) }))
      .sort((a, b) => a.label.localeCompare(b.label));

  // Faster logging (v0.21): usual lengths per type, and the last activity.
  const [{ data: lengthRows }, { data: lastRows }] = await Promise.all([
    ids.length ? supabase.from("activity_length").select("residency_id, kind, minutes").in("residency_id", ids) : Promise.resolve({ data: [] }),
    supabase
      .from("relationship_activity")
      .select("residency_id, site_id, kind, minutes, collaborative, relationship_activity_resident(resident_id)")
      .eq("person_id", person.id)
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

  // ---- Collaboration progress this season (v0.19)
  const progress = await Promise.all(
    programs.map(async (p) => {
      const [{ data: t }, { data: collab }] = await Promise.all([
        supabase.from("target").select("value").eq("season_id", p.season.id).eq("metric", "collaborative_programs_per_musician").maybeSingle(),
        supabase
          .from("session")
          .select("id, session_assignment!inner(person_id, status), session_report!inner(resident_involvement)")
          .eq("residency_id", p.id)
          .neq("schedule_state", "canceled")
          .neq("session_report.resident_involvement", "none")
          .eq("session_assignment.person_id", person.id)
          .neq("session_assignment.status", "absent")
          .gte("starts_at", `${p.season.starts_on}T00:00:00Z`)
          .lte("starts_at", `${p.season.ends_on}T23:59:59Z`),
      ]);
      return { id: p.id, name: p.name, done: (collab ?? []).length, target: t?.value ?? 2 };
    }),
  );

  // ---- Weekly hours (v0.19): saved entries, or pre-filled from the schedule and logs.
  const [{ data: categoryRows }, { data: entryRows }] = await Promise.all([
    supabase.from("time_category").select("id, name, description").eq("active", true).order("sort_order"),
    supabase.from("time_entry").select("residency_id, time_category_id, hours, state, returned_note").eq("person_id", person.id).eq("week_starting", monday),
  ]);
  const categories = (categoryRows ?? []) as { id: string; name: string; description: string | null }[];
  type EntryRow = { residency_id: string; time_category_id: string; hours: number; state: "draft" | "submitted" | "approved"; returned_note: string | null };
  const entries = (entryRows ?? []) as EntryRow[];
  // Hours are calculated from documentation (v0.24), never typed.
  const documented = new Map(
    await Promise.all(
      programs.map(async (p) => {
        const { data } = await supabase.rpc("documented_minutes", { p_person: person.id, p_residency: p.id, p_week: monday });
        return [p.id, new Map(((data ?? []) as { category: string; minutes: number }[]).map((d) => [d.category, Number(d.minutes)]))] as const;
      }),
    ),
  );
  const hoursFor = (residencyId: string) => {
    const saved = entries.filter((e) => e.residency_id === residencyId);
    const states = saved.map((e) => e.state);
    const state = states.includes("approved") ? ("approved" as const) : states.includes("submitted") ? ("submitted" as const) : saved.length ? ("draft" as const) : null;
    const savedHours = (catIdValue: string) => Number(saved.find((e) => e.time_category_id === catIdValue)?.hours ?? 0);
    return {
      // Approved weeks show what was approved; otherwise what's documented now.
      hours: categories.map((c) => ({
        name: c.name,
        hours: state === "approved" ? savedHours(c.id) : Math.round(((documented.get(residencyId)?.get(c.name) ?? 0) / 60) * 100) / 100,
      })),
      state,
      returnedNote: saved.find((e) => e.returned_note)?.returned_note ?? null,
    };
  };
  const activityMinutes = activities.reduce((n, a) => n + a.minutes, 0);
  const reflections = new Map(((reflectionRows ?? []) as { residency_id: string; highlights: string; challenges: string }[]).map((r) => [r.residency_id, r]));
  const toDo = ledPast.filter((s) => !s.session_report).length;
  const { data: feed } = await supabase.from("calendar_feed").select("token").eq("person_id", person.id).maybeSingle();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const feedUrl = feed?.token ? `${origin}/calendar-feed/${feed.token}.ics` : null;
  const programName = (id: string) => programMap.get(id)?.name ?? "";

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const nav = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft";

  return (
    <AppShell isAdmin={isAdmin}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My week</h1>
          <p className="text-muted">{formatWeek(monday)}</p>
        </div>
        <nav className="flex gap-2" aria-label="Weeks">
          <Link href={`/documentation?week=${addDays(monday, -7)}`} className={nav}>← Previous week</Link>
          {monday !== weekStart(today) && <Link href={`/documentation?week=${today}`} className={nav}>This week</Link>}
          <Link href={`/documentation?week=${addDays(monday, 7)}`} className={nav}>Next week →</Link>
        </nav>
      </div>
      <p className="mt-3 text-sm">
        <span className="rounded-full bg-iris-soft px-3 py-1">Due {dueLabel(monday)}</span>
        {toDo > 0 && <span className="ml-2 text-brand-orange">{toDo} program{toDo === 1 ? "" : "s"} to document</span>}
        <span className="ml-2 text-muted">· {activities.length} relationship-building activit{activities.length === 1 ? "y" : "ies"}, {activityMinutes} min</span>
      </p>

      {programs.length === 0 && <p className="mt-6 text-muted">You&apos;re not on a program&apos;s roster for this week.</p>}

      {programs.length > 0 && (
        <>
          <section className={card}>
            <h2 className="text-lg font-semibold">Programs you led</h2>
            <p className="mt-2 flex flex-wrap gap-2 text-sm">
              {progress.map((pr) => (
                <span key={pr.id} className={`rounded-full border px-3 py-1 ${pr.done >= pr.target ? "border-iris bg-iris-soft" : "border-border"}`}>
                  Collaborative programs this season{programs.length > 1 ? ` (${pr.name})` : ""}: <strong>{pr.done} of {pr.target}</strong>
                </span>
              ))}
            </p>
            <p className="mt-1 text-sm text-muted">As leader, you document each one: attendance (everyone present), type and collaboration.</p>
            {ledPast.length === 0 && <p className="mt-3 text-sm text-muted">None this week{ledFuture.length ? " yet" : ""}.</p>}
            <ul className="divide-y divide-border">
              {ledPast.map((s) => {
                const tz = siteById.get(s.location!.site_id)!.timezone;
                return (
                  <ReportRow
                    key={s.id}
                    types={types}
                    session={{
                      id: s.id,
                      day: formatDay(s.starts_at, tz),
                      time: s.has_set_time ? formatTime(s.starts_at, tz) : "",
                      title: s.title,
                      place: `${programName(s.residency_id)} · ${s.location!.display_name}`,
                      scheduledMinutes: s.scheduled_minutes ?? 45,
                      usualTypeId: s.series?.default_interaction_type_id ?? "",
                      report: s.session_report
                        ? {
                            attendance: s.session_report.attendance,
                            interactionTypeId: s.session_report.interaction_type_id,
                            involvement: s.session_report.resident_involvement,
                            minutes: s.session_report.actual_minutes,
                            notes: s.session_report.notes ?? "",
                            siteId: s.session_report.site_id,
                          }
                        : null,
                      sites: (programMap.get(s.residency_id)?.sites ?? []).map((x) => ({ id: x.id, label: x.display_name })),
                      roomSiteId: s.location!.site_id,
                    }}
                  />
                );
              })}
            </ul>
            {ledFuture.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                Later this week: {ledFuture.map((s) => `${s.title} (${formatDay(s.starts_at, siteById.get(s.location!.site_id)!.timezone)})`).join(", ")}. Document after they happen.
              </p>
            )}
            {playedNotLed.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                You also played in {playedNotLed.length} program{playedNotLed.length === 1 ? "" : "s"} led by someone else; the leader documents those.
              </p>
            )}
          </section>

          <section className={card}>
            <h2 className="text-lg font-semibold">Relationship building</h2>
            <ul className="mt-2 divide-y divide-border text-sm">
              {activities.map((a) => {
                const names = a.relationship_activity_resident.map((x) => x.resident?.display_name).filter(Boolean).join(", ");
                const label = `${ACTIVITY_KIND_LABELS[a.kind].replace(/ \(.*\)$/, "")}, ${a.occurred_on}`;
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{new Date(`${a.occurred_on}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}</span>
                      {" · "}{ACTIVITY_KIND_LABELS[a.kind].replace(/ \(.*\)$/, "")}
                      {names && <> · {names}</>}
                      {" · "}{a.minutes} min · Collab: {a.collaborative ? "Yes" : "No"}
                      {(() => {
                        const others = [a.person_id, ...a.relationship_activity_musician.map((m) => m.person_id)].filter((id) => id !== person.id);
                        return others.length ? <> · with {others.map((id) => nameOf(a.residency_id, id).split(" ")[0]).join(", ")}</> : null;
                      })()}
                      <span className="block text-xs text-muted">{programName(a.residency_id)} · {siteById.get(a.site_id)?.display_name}{a.note ? ` · ${a.note}` : ""}</span>
                    </span>
                    {a.person_id === person.id ? <DeleteActivityButton id={a.id} label={label} /> : <LeaveSharedButton id={a.id} label={label} />}
                  </li>
                );
              })}
              {activities.length === 0 && <li className="py-2 text-muted">Nothing logged this week yet.</li>}
            </ul>
            {(() => {
              // Sites that want a written note per one-to-one get a daily Word document (v0.21).
              const days = [...new Set(activities.filter((a) => siteById.get(a.site_id)?.detailed_relationship_notes).map((a) => `${a.site_id}|${a.occurred_on}`))].sort();
              if (!days.length) return null;
              return (
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {days.map((k) => {
                    const [siteId, date] = k.split("|");
                    return (
                      <a key={k} href={`/relationship-notes/${siteId}?date=${date}`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">
                        Word document: {siteById.get(siteId)?.display_name}, {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
                      </a>
                    );
                  })}
                </div>
              );
            })()}
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-medium">Log an activity</h3>
              <div className="mt-3">
                <ActivityForm
                  programs={programs.map((p) => ({ id: p.id, name: p.name, sites: p.sites.map((s) => ({ id: s.id, label: s.display_name, detailedNotes: s.detailed_relationship_notes })) }))}
                  residents={residents}
                  lengths={lengths}
                  last={last}
                  colleagues={colleagues}
                  defaultDate={today < monday ? monday : today > sunday ? sunday : today}
                  minDate={monday}
                  maxDate={sunday < today ? sunday : today}
                />
              </div>
            </div>
          </section>

          <section className={card}>
            <h2 className="text-lg font-semibold">Hours and submit</h2>
            <p className="mt-1 text-sm text-muted">
              Your timesheet for this week, calculated from your documentation: the programs you played, special events, and your
              relationship building. Log the 15 minutes before and after a program as relationship building. To change a number,
              fix the documentation, then submit your week in one step.
            </p>
            <div className="mt-4">
              {(() => {
                const weekPrograms = programs.map((p) => {
                  const h = hoursFor(p.id);
                  return { residencyId: p.id, programName: p.name, hours: h.hours, state: h.state, returnedNote: h.returnedNote };
                });
                return (
                  <WeekHours
                    key={`${monday}-${weekPrograms.map((w) => w.state).join(",")}`}
                    week={monday}
                    programs={weekPrograms}
                    toDocument={ledPast.filter((s) => !s.session_report).map((s) => `${s.title} (${formatDay(s.starts_at, siteById.get(s.location!.site_id)!.timezone)})`)}
                  />
                );
              })()}
            </div>
          </section>


          {programs.map((p) => {
            const r = reflections.get(p.id);
            return (
              <section key={p.id} className={card}>
                <h2 className="text-lg font-semibold">{formatMonth(month)} reflection{programs.length > 1 ? `: ${p.name}` : ""}</h2>
                <p className="mt-1 text-sm text-muted">Fill in any time this month; it&apos;s due with the last week&apos;s documentation.</p>
                <div className="mt-4"><ReflectionForm residencyId={p.id} month={month} highlights={r?.highlights ?? ""} challenges={r?.challenges ?? ""} /></div>
              </section>
            );
          })}
        </>
      )}

      <section className={card}>
        <h2 className="text-lg font-semibold">Add Iris to your calendar</h2>
        <div className="mt-3"><CalendarLinkCard feedUrl={feedUrl} /></div>
      </section>
    </AppShell>
  );
}
