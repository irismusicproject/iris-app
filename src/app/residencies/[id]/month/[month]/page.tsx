import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import type { CancellationReason, SessionKind } from "@/shared/domain/scheduling";
import { formatDay, formatMonth, formatTime, isMonth, localDateTime, monthWindow, shiftMonth } from "@/shared/domain/time";
import { AddOneTimeForm, FillMonthButton } from "../month-controls";
import { PublishPanel } from "../publish-panel";
import { ScheduleHeader, SessionCard, type CardSession } from "../session-card";

// A month's schedule for one site, laid out like the partner calendar
// (docs/GLOSSARY.md Part B): special events, then one block per weekly
// program, then other one-time programs.
export const metadata = { title: "Schedule · Iris Music Project" };

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

export default async function MonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; month: string }>;
  searchParams: Promise<{ site?: string }>;
}) {
  const { isAdmin } = await requirePerson();
  const { id, month } = await params;
  const { site: siteParam } = await searchParams;
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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Schedule</h1>
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
  const [{ data: sessionRows }, { data: rosterRows }, { data: versions }, { data: upcomingRows }] = await Promise.all([
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
  ]);
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
  const stateLabel = !latest
    ? "Draft: not reviewed yet"
    : latest.state === "reviewed"
      ? "Reviewed by the point person: ready to publish"
      : `Published: calendar version ${latest.version} sent`;
  const drafts = sessions.filter((s) => s.schedule_state === "draft").length;
  const needLeader = sessions.filter(
    (s) => s.schedule_state !== "canceled" && s.kind === "group_session" &&
      s.session_assignment.filter((a) => a.role === "leader" && a.status !== "absent").length !== 1,
  ).length;

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const cardProps = { residencyId: id, timeZone: tz, rooms, roster, onRoster: access.onRoster, canSchedule: access.canSchedule };

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
        <Link href={`/residencies/${id}/weekly`} className="text-iris underline-offset-2 hover:underline">Weekly programs</Link>
        {access.onRoster && !access.canSchedule && " · You can edit each date's title, notes, room and musicians while the month is a draft."}
      </p>

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

      {access.canSchedule && (
        <div className="mt-5"><FillMonthButton residencyId={id} month={month} monthLabel={monthLabel} /></div>
      )}

      {sessions.length > 0 && (
        <PublishPanel
          residencyId={id}
          siteId={site.id}
          siteName={site.display_name}
          month={month}
          monthLabel={monthLabel}
          latest={latest ? { version: latest.version, state: latest.state } : null}
          isPointPerson={access.isPointPerson}
          canSchedule={access.canSchedule}
          draftCount={drafts}
          needLeader={needLeader}
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

      {access.canSchedule && (
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
