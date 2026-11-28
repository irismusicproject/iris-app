import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { recurrenceLabel, SESSION_KIND_LABELS, type CancellationReason, type Series, type SessionKind } from "@/shared/domain/scheduling";
import { formatDay, formatMonth, formatTime, isMonth, localDateTime, monthWindow, shiftMonth } from "@/shared/domain/time";
import { AddOneTimeForm, FillMonthButton } from "../month-controls";
import { PublishPanel, type ScheduleCheckRow } from "../publish-panel";
import { ScheduleHeader, SessionCard, type CardSession } from "../session-card";
import { StagePanel, type Stage } from "../stage-panel";
import { CollaborationTarget } from "../collaboration-target";
import { DeleteSeriesButton, EndSeriesForm, SeriesForm } from "../../season/series-form";

// A month's schedule for one site, laid out like the partner calendar
// (docs/GLOSSARY.md Part B): special events, then one block per weekly
// program, then other one-time programs.
export const metadata = { title: "Site Details · Iris Music Project" };

type SiteRow = {
  site: { id: string; display_name: string; timezone: string; location: { id: string; display_name: string; active: boolean }[] } | null;
};
type SessionRow = {
  id: string;
  series_id: string | null;
  kind: SessionKind;
  title: string;
  location_id: string;
  starts_at: string;
  has_set_time: boolean;
  is_special_event: boolean;
  schedule_state: "draft" | "published" | "canceled";
  cancellation_reason: CancellationReason | null;
  public_note: string | null;
  internal_note: string | null;
  location: { site_id: string; display_name: string } | null;
  series: { title: string; weekdays: number[]; start_time: string | null } | null;
  session_assignment: {
    id: string;
    person_id: string;
    role: "leader" | "participant";
    status: "assigned" | "absent" | "substitute";
  }[];
};

const firstName = (n: string) => n.split(" ")[0];
const time12 = (t: string | null) => {
  if (!t) return "No set time";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
type SeriesRow = Series & { series_default_person: { person_id: string }[]; location: { site_id: string } | null };

export default async function MonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; month: string }>;
  searchParams: Promise<{ site?: string; ended?: string; deleted?: string; removed?: string }>;
}) {
  const { isAdmin, person } = await requirePerson();
  const { id, month } = await params;
  const { site: siteParam, ended: endedParam, deleted: deletedParam, removed: removedParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isMonth(month)) notFound();

  const supabase = await createClient();
  const { data: residency } = await supabase.from("residency").select("id, name").eq("id", id).maybeSingle();
  if (!residency) notFound();
  const [access, names] = await Promise.all([getResidencyAccess(id, isAdmin), getResidencyNames(id)]);
  const nameOf = (pid: string) => names.get(pid) ?? "Someone";

  const { data: siteRows } = await supabase
    .from("residency_site")
    .select("site(id, display_name, timezone, location(id, display_name, active))")
    .eq("residency_id", id);
  const sites = ((siteRows ?? []) as unknown as SiteRow[]).map((r) => r.site!).filter(Boolean).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const site = sites.find((s) => s.id === siteParam) ?? sites[0];
  const monthLabel = formatMonth(month);
  const base = `/residencies/${id}/month`;

  if (!site) {
    return (
      <AppShell isAdmin={isAdmin}>
        <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Site Details</h1>
        <p className="mt-3 text-muted">This program has no sites yet.</p>
      </AppShell>
    );
  }
  const tz = site.timezone;
  const tz0 = tz;
  const rooms = site.location.filter((l) => l.active).map((l) => ({ id: l.id, label: l.display_name }));
  const allRooms = sites.flatMap((s) => s.location.filter((l) => l.active).map((l) => ({ id: l.id, label: `${s.display_name} · ${l.display_name}` })));

  // Sessions in a window around the month, then kept if they fall in the
  // month at this site in its own time zone.
  const w = monthWindow(month);
  const [{ data: sessionRows }, { data: rosterRows }, { data: versions }, { data: upcomingRows }, { data: seriesRows }, { data: typeRows }] = await Promise.all([
    supabase
      .from("session")
      .select(
        "id, series_id, kind, title, location_id, starts_at, has_set_time, is_special_event, schedule_state, cancellation_reason, public_note, internal_note, location(site_id, display_name), series(title, weekdays, start_time), session_assignment(id, person_id, role, status)",
      )
      .eq("residency_id", id)
      .gte("starts_at", w.from)
      .lt("starts_at", w.to)
      .order("starts_at"),
    supabase
      .from("season")
      .select("starts_on, ends_on, roster_member(person_id, left_on)")
      .eq("residency_id", id)
      .lte("starts_on", `${shiftMonth(month, 1)}-01`)
      .gte("ends_on", `${month}-01`),
    supabase.from("calendar_export").select("version, state").eq("residency_id", id).eq("site_id", site.id).eq("month", `${month}-01`).order("version"),
    // Special events in later months (often planned at the start of a season).
    supabase
      .from("session")
      .select("id, title, starts_at, has_set_time, location(display_name, site(display_name, timezone))")
      .eq("residency_id", id)
      .eq("is_special_event", true)
      .neq("schedule_state", "canceled")
      .gte("starts_at", monthWindow(shiftMonth(month, 1)).from)
      .order("starts_at")
      .limit(12),
    // Weekly and monthly programs whose usual room is at this building (v0.34).
    supabase
      .from("series")
      .select("*, series_default_person(person_id), location:default_location_id(site_id)")
      .eq("residency_id", id)
      .lte("active_from", `${shiftMonth(month, 1)}-01`)
      .or(`active_until.is.null,active_until.gte.${month}-01`),
    supabase.from("interaction_type").select("id, name").eq("active", true).order("sort_order"),
  ]);
  // The monthly cycle (DOMAIN-MODEL ScheduleMonth, v0.41).
  const { data: sm } = await supabase
    .from("schedule_month")
    .select("stage, team_due_on, final_due_on")
    .eq("residency_id", id)
    .eq("site_id", site.id)
    .eq("month", `${month}-01`)
    .maybeSingle();
  const stage = (sm?.stage ?? null) as Stage | null;
  const { data: openRequests } = await supabase.from("change_request").select("session_id").eq("status", "open").eq("requested_by", person.id);
  const myOpenRequests = new Set(((openRequests ?? []) as { session_id: string }[]).map((r) => r.session_id));

  const { data: checkRows } = await supabase
    .from("schedule_check")
    .select("person_id, changed_at")
    .eq("residency_id", id)
    .eq("site_id", site.id)
    .eq("month", `${month}-01`);
  const siteSeries = ((seriesRows ?? []) as unknown as SeriesRow[])
    .filter((x) => x.location?.site_id === site.id && x.active_from < `${shiftMonth(month, 1)}-01`)
    .sort((a, b) => Math.min(...a.weekdays) - Math.min(...b.weekdays) || (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  const { data: seriesDates } = siteSeries.length
    ? await supabase.from("session").select("series_id").in("series_id", siteSeries.map((x) => x.id))
    : { data: [] as { series_id: string }[] };
  const dateCount = (sid: string) => (seriesDates ?? []).filter((d) => d.series_id === sid).length;
  const types = (typeRows ?? []).map((t) => ({ id: t.id as string, label: t.name as string }));
  const todayHere = localDateTime(new Date().toISOString(), tz).date;

  // Result of ending or deleting a program (v0.34), shown after the page reloads.
  const removedCount = Math.max(0, Number(removedParam) || 0);
  const removedText = removedCount ? `${removedCount} draft date${removedCount === 1 ? "" : "s"} removed.` : "No draft dates to remove.";
  let endedNote: { title: string; until: string; published: { id: string; starts_at: string; tz: string }[] } | null = null;
  if (endedParam && /^[0-9a-f-]{36}$/i.test(endedParam)) {
    const [{ data: ended }, { data: laterRows }] = await Promise.all([
      supabase.from("series").select("title, active_until").eq("id", endedParam).maybeSingle(),
      supabase.from("session").select("id, starts_at, location(site(timezone))").eq("series_id", endedParam).eq("schedule_state", "published").order("starts_at"),
    ]);
    if (ended?.active_until) {
      type LaterRow = { id: string; starts_at: string; location: { site: { timezone: string } | null } | null };
      const published = ((laterRows ?? []) as unknown as LaterRow[])
        .map((r) => ({ id: r.id, starts_at: r.starts_at, tz: r.location?.site?.timezone ?? tz }))
        .filter((r) => localDateTime(r.starts_at, r.tz).date > ended.active_until!);
      endedNote = { title: ended.title, until: ended.active_until, published };
    }
  }
  type UpcomingRow = { id: string; title: string; starts_at: string; has_set_time: boolean; location: { display_name: string; site: { display_name: string; timezone: string } | null } | null };
  const upcoming = ((upcomingRows ?? []) as unknown as UpcomingRow[]).filter((u) => {
    const tz = u.location?.site?.timezone ?? tz0;
    return localDateTime(u.starts_at, tz).date >= `${shiftMonth(month, 1)}-01`;
  });
  const sessions = ((sessionRows ?? []) as unknown as SessionRow[]).filter(
    (s) => s.location?.site_id === site.id && localDateTime(s.starts_at, tz).date.startsWith(month),
  );

  type RosterRow = { roster_member: { person_id: string; left_on: string | null }[] };
  const rosterMap = new Map<string, string>();
  for (const s of (rosterRows ?? []) as unknown as RosterRow[])
    for (const m of s.roster_member) if (!m.left_on || m.left_on >= `${month}-01`) rosterMap.set(m.person_id, nameOf(m.person_id));
  const roster = [...rosterMap].map(([pid, label]) => ({ id: pid, label })).sort((a, b) => a.label.localeCompare(b.label));

  const toCard = (s: SessionRow, withWeekday: boolean): CardSession => {
    const local = localDateTime(s.starts_at, tz);
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      dayLabel: formatDay(s.starts_at, tz, withWeekday),
      timeLabel: s.has_set_time ? formatTime(s.starts_at, tz) : null,
      localDate: local.date,
      localTime: local.time,
      locationId: s.location_id,
      roomLabel: s.location?.display_name ?? "",
      isSpecialEvent: s.is_special_event,
      isOneTime: !s.series_id,
      state: s.schedule_state,
      cancellationReason: s.cancellation_reason,
      publicNote: s.public_note,
      internalNote: s.internal_note,
      assignments: s.session_assignment
        .map((a) => ({ id: a.id, personId: a.person_id, name: firstName(nameOf(a.person_id)), role: a.role, status: a.status }))
        .sort((a, b) => Number(b.role === "leader") - Number(a.role === "leader") || a.name.localeCompare(b.name)),
    };
  };

  const special = sessions.filter((s) => s.is_special_event);
  const bySeries = new Map<string, SessionRow[]>();
  for (const s of sessions.filter((x) => !x.is_special_event && x.series_id)) {
    bySeries.set(s.series_id!, [...(bySeries.get(s.series_id!) ?? []), s]);
  }
  const blocks = [...bySeries.values()].sort((a, b) => {
    const wa = Math.min(...(a[0].series?.weekdays ?? [9])), wb = Math.min(...(b[0].series?.weekdays ?? [9]));
    return wa - wb || (a[0].series?.start_time ?? "99").localeCompare(b[0].series?.start_time ?? "99");
  });
  const others = sessions.filter((s) => !s.is_special_event && !s.series_id);

  const latest = versions?.at(-1);
  // "Done reviewing" checklist (v0.35): everyone playing a date here this month that isn't "No Program".
  const players = new Set(
    sessions.filter((s) => s.schedule_state !== "canceled").flatMap((s) => s.session_assignment.filter((a) => a.status !== "absent").map((a) => a.person_id)),
  );
  const checks: ScheduleCheckRow[] = [...players]
    .map((pid) => {
      const c = (checkRows ?? []).find((r) => r.person_id === pid);
      return { personId: pid, name: firstName(nameOf(pid)), done: Boolean(c), changedSince: Boolean(c?.changed_at) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const stateLabel = !latest
    ? "Draft: not reviewed yet"
    : latest.state === "reviewed"
      ? "Reviewed by the Iris Supervisor: ready to publish"
      : `Published: calendar version ${latest.version} sent`;
  const drafts = sessions.filter((s) => s.schedule_state === "draft").length;
  const needLeader = sessions.filter(
    (s) => s.schedule_state !== "canceled" && s.kind === "group_session" &&
      s.session_assignment.filter((a) => a.role === "leader" && a.status !== "absent").length !== 1,
  ).length;

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const cardProps = { residencyId: id, timeZone: tz, rooms, roster, onRoster: access.onRoster, canSchedule: access.canSchedule, isAdminLead: access.isAdminLead, myId: person.id, monthReviewed: Boolean(latest), stage, myOpenRequests: [...myOpenRequests] };

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <p className="mt-3 text-sm font-medium text-muted">Site Details</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{site.display_name} · {monthLabel}</h1>
        <nav className="flex gap-2 text-sm" aria-label="Months">
          <Link href={`${base}/${shiftMonth(month, -1)}?site=${site.id}`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">← {formatMonth(shiftMonth(month, -1))}</Link>
          <Link href={`${base}/${shiftMonth(month, 1)}?site=${site.id}`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">{formatMonth(shiftMonth(month, 1))} →</Link>
        </nav>
      </div>
      {sites.length > 1 && (
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Sites">
          {sites.map((s) => (
            <Link key={s.id} href={`${base}/${month}?site=${s.id}`} className={`rounded-full px-3 py-1 ${s.id === site.id ? "bg-iris text-white dark:text-background" : "border border-border hover:bg-iris-soft"}`}>
              {s.display_name}
            </Link>
          ))}
        </nav>
      )}
      <p className="mt-3 text-sm">
        <span className="rounded-full bg-iris-soft px-3 py-1">{stateLabel}</span>
        {drafts > 0 && <span className="ml-2 text-muted">{drafts} draft{drafts === 1 ? "" : "s"}</span>}
        {access.canSchedule && needLeader > 0 && <span className="ml-2 text-brand-orange">{needLeader} need{needLeader === 1 ? "s" : ""} a leader</span>}
      </p>
      <p className="mt-2 text-sm text-muted">
        <Link href={`/residencies/${id}/season`} className="text-iris underline-offset-2 hover:underline">Season view</Link>

        {access.onRoster && !access.canSchedule && (latest
          ? " · This month has been reviewed: ask the Iris Supervisor for any changes."
          : " · On draft dates you play in, you can edit the notes, room and musicians, and add the title when you lead the date (type “No Program” as the title to cancel it). The Iris Supervisor sets leaders; to change one, propose a different leader under More once the month is open for the team.")}
        {access.isAdminLead && !access.canSchedule && " As Lead Musician, you publish the month and update published dates after partner feedback."}
      </p>

      <CollaborationTarget residencyId={id} month={month} canSchedule={access.canSchedule} names={names} />

      {endedNote && (
        <section role="status" className="mt-5 rounded-xl border border-iris/40 bg-iris-soft p-4 text-sm">
          <p>
            <strong>{endedNote.title}</strong> ends on {formatDay(`${endedNote.until}T12:00:00Z`, "UTC")}. {removedText}
          </p>
          {endedNote.published.length > 0 && (
            <p className="mt-1">
              Still on the published calendar after that:{" "}
              {endedNote.published.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link href={`${base}/${localDateTime(p.starts_at, p.tz).date.slice(0, 7)}?site=${site.id}`} className="text-iris underline-offset-2 hover:underline">{formatDay(p.starts_at, p.tz)}</Link>
                </span>
              ))}
              . Open {endedNote.published.length === 1 ? "it" : "each"} and make {endedNote.published.length === 1 ? "it" : "them"} “No Program”, or keep {endedNote.published.length === 1 ? "it" : "them"}.
            </p>
          )}
        </section>
      )}
      {deletedParam && (
        <section role="status" className="mt-5 rounded-xl border border-iris/40 bg-iris-soft p-4 text-sm">
          <strong>{deletedParam}</strong> was deleted{removedCount ? `, with ${removedCount} date${removedCount === 1 ? "" : "s"}` : ""}.
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-5 rounded-xl border border-brand-blue/40 bg-brand-blue/10 p-4">
          <h2 className="text-sm font-semibold">Coming up this season</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {upcoming.map((u) => {
              const utz = u.location?.site?.timezone ?? tz;
              return (
                <li key={u.id}>
                  <span className="font-medium">{formatDay(u.starts_at, utz)}</span>
                  {u.has_set_time && <span className="text-muted"> · {formatTime(u.starts_at, utz)}</span>}
                  {" · "}{u.title}
                  <span className="text-muted"> · {u.location?.site?.display_name}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={card}>
        <h2 className="text-lg font-semibold">Weekly and monthly programs at {site.display_name}</h2>
        <p className="mt-1 text-sm text-muted">
          {access.canSchedule
            ? "Set up the recurring programs here; filling in the month uses them. Edit, end or delete one below."
            : "The recurring programs at this building."}{" "}
          Leaders for the whole season are on the <Link href={`/residencies/${id}/season`} className="text-iris underline-offset-2 hover:underline">Season view</Link>.
        </p>
        <div className="mt-3 divide-y divide-border">
          {siteSeries.map((x) => (
            <div key={x.id} className="py-3">
              <p className="font-medium">
                {x.title}
                {x.kind === "relationship_building" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{SESSION_KIND_LABELS[x.kind]}</span>}
              </p>
              <p className="text-sm text-muted">
                {recurrenceLabel(x)} · {time12(x.start_time)}
                {x.default_leader_id ? ` · Led by ${firstName(nameOf(x.default_leader_id))}` : ""}
                {x.series_default_person.length ? ` · ${x.series_default_person.map((p) => firstName(nameOf(p.person_id))).join(", ")}` : ""}
                {x.active_until ? ` · Ends ${formatDay(`${x.active_until}T12:00:00Z`, "UTC", false)}` : ""}
              </p>
              {access.canSchedule && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-iris">Edit, end or delete</summary>
                  <div className="mt-3 flex flex-col gap-5">
                    <SeriesForm
                      key={x.id}
                      residencyId={id}
                      series={x}
                      defaultPeople={x.series_default_person.map((p) => p.person_id)}
                      rooms={allRooms}
                      musicians={roster}
                      types={types}
                    />
                    <div className="border-t border-border pt-4">
                      <h3 className="text-sm font-semibold">End this program</h3>
                      <div className="mt-2"><EndSeriesForm key={x.active_until ?? ""} residencyId={id} series={x} today={todayHere} /></div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <h3 className="text-sm font-semibold">Delete this program</h3>
                      <div className="mt-2"><DeleteSeriesButton residencyId={id} seriesId={x.id} title={x.title} dateCount={dateCount(x.id)} /></div>
                    </div>
                  </div>
                </details>
              )}
            </div>
          ))}
          {siteSeries.length === 0 && <p className="py-3 text-sm text-muted">No weekly or monthly programs at {site.display_name} this month.</p>}
        </div>
        {access.canSchedule && (rooms.length > 0 || allRooms.length > 0) && (
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium text-iris">Add a weekly or monthly program at {site.display_name}</summary>
            <div className="mt-4"><SeriesForm residencyId={id} rooms={rooms.length ? rooms : allRooms} musicians={roster} types={types} /></div>
          </details>
        )}
      </section>

      {access.canSchedule && (
        <div className="mt-5"><FillMonthButton residencyId={id} month={month} monthLabel={monthLabel} /></div>
      )}

      {(stage || access.canSchedule) && (
        <StagePanel
          residencyId={id}
          siteId={site.id}
          siteName={site.display_name}
          month={month}
          monthLabel={monthLabel}
          stage={stage}
          dueTeam={sm?.team_due_on ?? null}
          dueFinal={sm?.final_due_on ?? null}
          canSchedule={access.canSchedule}
          isAdminLead={access.isAdminLead}
        />
      )}

      {/* Months not opened through the cycle keep the earlier review-and-publish steps. */}
      {sessions.length > 0 && !stage && (
        <PublishPanel
          residencyId={id}
          siteId={site.id}
          siteName={site.display_name}
          month={month}
          monthLabel={monthLabel}
          latest={latest ? { version: latest.version, state: latest.state } : null}
          isPointPerson={access.isPointPerson}
          canSchedule={access.canSchedule || access.isAdminLead}
          draftCount={drafts}
          needLeader={needLeader}
          checks={checks}
          myId={person.id}
        />
      )}

      {sessions.length === 0 && <p className="mt-6 text-muted">Nothing scheduled at {site.display_name} for {monthLabel} yet.</p>}

      {special.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Special events</h2>
          <div className="mt-3"><ScheduleHeader /></div>
          <ul>{special.map((s) => <SessionCard key={s.id} session={toCard(s, false)} {...cardProps} />)}</ul>
        </section>
      )}

      {(blocks.length > 0 || others.length > 0) && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Regular programming</h2>
          <div className="mt-3"><ScheduleHeader /></div>
          {blocks.map((b) => (
            <div key={b[0].series_id} className="mt-4 border-t border-border pt-3 first:border-t-0">
              <h3 className="text-sm font-semibold text-muted">{b[0].series?.title}</h3>
              <ul>{b.map((s) => <SessionCard key={s.id} session={toCard(s, true)} {...cardProps} />)}</ul>
            </div>
          ))}
          {others.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-sm font-semibold text-muted">Other programs</h3>
              <ul>{others.map((s) => <SessionCard key={s.id} session={toCard(s, true)} {...cardProps} />)}</ul>
            </div>
          )}
        </section>
      )}

      {(access.canSchedule || access.isAdminLead) && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Add a one-time program or special event</h2>
          <div className="mt-5">
            <AddOneTimeForm residencyId={id} timeZone={tz} rooms={rooms.length ? rooms : allRooms} defaultDate={`${month}-01`} />
          </div>
        </section>
      )}
    </AppShell>
  );
}
