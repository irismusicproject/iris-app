import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { recurrenceLabel, SESSION_KIND_LABELS, type Series, type SessionKind } from "@/shared/domain/scheduling";
import { formatDay, formatMonth, formatTime, localDateTime, todayIn } from "@/shared/domain/time";
import { AddOneTimeForm } from "../month/month-controls";
import { FillSeasonButton, SeasonLeaderSelect } from "./season-controls";

// Season view (DOMAIN-MODEL v0.16): the whole semester at a glance, for the
// Iris Supervisor (and Lead Musician, admins). Set a weekly program's leader for
// the whole season, fill every month at once, and see each month's status.
// v0.34: month by month comes first; weekly programs are listed by building
// and set up, ended or deleted from each building's month view.
export const metadata = { title: "Season · Iris Music Project" };

type SeasonRow = { id: string; name: string; starts_on: string; ends_on: string; roster_member: { person_id: string; left_on: string | null }[] };
type SeriesRow = Series & { series_default_person: { person_id: string }[] };
type SessionRow = {
  id: string;
  series_id: string | null;
  kind: SessionKind;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  is_special_event: boolean;
  schedule_state: "draft" | "published" | "canceled";
  location: { display_name: string; site: { display_name: string; timezone: string } | null } | null;
  session_assignment: { person_id: string; role: string; status: string }[];
  session_report: { resident_involvement: string } | null;
};

const time12 = (t: string | null) => {
  if (!t) return "No set time";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default async function SeasonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string }> }) {
  const { isAdmin } = await requirePerson();
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: residency } = await supabase.from("residency").select("id, name").eq("id", id).maybeSingle();
  if (!residency) notFound();
  const [access, names] = await Promise.all([getResidencyAccess(id, isAdmin), getResidencyNames(id)]);
  const nameOf = (pid: string) => names.get(pid) ?? "Someone";

  const today = todayIn();
  const { data: seasonRows } = await supabase
    .from("season")
    .select("id, name, starts_on, ends_on, roster_member(person_id, left_on)")
    .eq("residency_id", id)
    .order("starts_on");
  const seasons = (seasonRows ?? []) as SeasonRow[];
  const season = seasons.find((s) => s.id === seasonParam) ?? seasons.find((s) => s.ends_on >= today) ?? seasons.at(-1);

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  if (!season) {
    return (
      <AppShell isAdmin={isAdmin}>
        <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Season</h1>
        <p className="mt-3 text-muted">This program has no season yet.</p>
      </AppShell>
    );
  }

  const [{ data: seriesRows }, { data: sessionRows }, { data: siteRows }]= await Promise.all([
    supabase
      .from("series")
      .select("*, series_default_person(person_id)")
      .eq("residency_id", id)
      .order("active_from"),
    supabase
      .from("session")
      .select("id, series_id, kind, title, starts_at, has_set_time, is_special_event, schedule_state, location(display_name, site(display_name, timezone)), session_assignment(person_id, role, status), session_report(resident_involvement)")
      .eq("residency_id", id)
      .gte("starts_at", new Date(Date.parse(`${season.starts_on}T00:00:00Z`) - 86_400_000).toISOString())
      .lte("starts_at", new Date(Date.parse(`${season.ends_on}T00:00:00Z`) + 2 * 86_400_000).toISOString()),
    supabase.from("residency_site").select("site(id, display_name, timezone, location(id, display_name, active))").eq("residency_id", id),
  ]);
  type SiteRow = { site: { id: string; display_name: string; timezone: string; location: { id: string; display_name: string; active: boolean }[] } | null };
  const sites = ((siteRows ?? []) as unknown as SiteRow[]).map((r) => r.site!).filter(Boolean).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const siteOfRoom = new Map(sites.flatMap((st) => st.location.map((l) => [l.id, st.id] as const)));
  const rooms = sites.flatMap((st) => st.location.filter((l) => l.active).map((l) => ({ id: l.id, label: sites.length > 1 ? `${st.display_name} · ${l.display_name}` : l.display_name })));
  const siteTz = sites[0]?.timezone ?? "America/New_York";
  const series = ((seriesRows ?? []) as SeriesRow[])
    .filter((s) => s.active_from <= season.ends_on && (!s.active_until || s.active_until >= season.starts_on))
    .sort((a, b) => Math.min(...a.weekdays) - Math.min(...b.weekdays) || (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  const musicians = [...new Set(season.roster_member.filter((m) => !m.left_on || m.left_on > today).map((m) => m.person_id))]
    .map((pid) => ({ id: pid, label: nameOf(pid) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Month-by-month status, in each site's own time zone.
  const sessions = ((sessionRows ?? []) as unknown as SessionRow[])
    .map((s) => ({ ...s, date: localDateTime(s.starts_at, s.location?.site?.timezone ?? "America/New_York").date }))
    .filter((s) => s.date >= season.starts_on && s.date <= season.ends_on);
  const months: string[] = [];
  for (let d = new Date(`${season.starts_on.slice(0, 7)}-01T12:00:00Z`); d.toISOString().slice(0, 10) <= season.ends_on; d.setUTCMonth(d.getUTCMonth() + 1))
    months.push(d.toISOString().slice(0, 7));
  const needsLeader = (s: SessionRow) =>
    s.kind === "group_session" && s.schedule_state !== "canceled" &&
    s.session_assignment.filter((a) => a.role === "leader" && a.status !== "absent").length !== 1;
  const monthStats = months.map((m) => {
    const inMonth = sessions.filter((s) => s.date.startsWith(m));
    return {
      month: m,
      total: inMonth.length,
      drafts: inMonth.filter((s) => s.schedule_state === "draft").length,
      published: inMonth.filter((s) => s.schedule_state === "published").length,
      canceled: inMonth.filter((s) => s.schedule_state === "canceled").length,
      needLeader: inMonth.filter(needsLeader).length,
    };
  });
  const specialEvents = sessions.filter((s) => s.is_special_event).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const defaultEventDate = today > season.starts_on && today < season.ends_on ? today : season.starts_on;
  const seriesNeedLeader = (sid: string) => sessions.filter((s) => s.series_id === sid && needsLeader(s)).length;
  const thisMonth = today.slice(0, 7);
  const linkMonth = months.includes(thisMonth) ? thisMonth : months[0];
  const seriesBySite = sites
    .map((st) => ({ site: st, series: series.filter((x) => siteOfRoom.get(x.default_location_id) === st.id) }))
    .filter((g) => g.series.length > 0);
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{season.name}</h1>
      <p className="mt-1 text-muted">{fmt(season.starts_on)} – {fmt(season.ends_on)} · Season view</p>
      {seasons.length > 1 && (
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Seasons">
          {seasons.map((s) => (
            <Link key={s.id} href={`/residencies/${id}/season?season=${s.id}`} className={`rounded-full px-3 py-1 ${s.id === season.id ? "bg-iris text-white dark:text-background" : "border border-border hover:bg-iris-soft"}`}>{s.name}</Link>
          ))}
        </nav>
      )}

      <section className={card}>
        <h2 className="text-lg font-semibold">Month by month</h2>
        {access.canSchedule && <div className="mt-3"><FillSeasonButton residencyId={id} seasonId={season.id} seasonName={season.name} /></div>}
        <ul className="mt-4 divide-y divide-border text-sm">
          {monthStats.map((m) => (
            <li key={m.month} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/residencies/${id}/month/${m.month}`} className="font-medium text-iris underline-offset-2 hover:underline">{formatMonth(m.month)}</Link>
              <span className="text-muted">
                {m.total === 0
                  ? "Not filled in"
                  : [
                      m.published ? `${m.published} published` : null,
                      m.drafts ? `${m.drafts} draft` : null,
                      m.canceled ? `${m.canceled} No Program` : null,
                    ].filter(Boolean).join(" · ")}
                {m.needLeader > 0 && <span className="ml-2 text-brand-orange">{m.needLeader} need a leader</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Weekly and monthly programs</h2>
        <p className="mt-1 text-sm text-muted">
          {access.canSchedule
            ? "Pick a leader for the whole season: they become the usual leader and lead every draft date from today on. Published months don't change. Add, edit, end or delete programs from each building's month view."
            : "The season's recurring programs and who usually leads them."}
        </p>
        {seriesBySite.map((g) => (
          <div key={g.site.id} className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1">
              <h3 className="font-semibold">{g.site.display_name}</h3>
              <Link href={`/residencies/${id}/month/${linkMonth}?site=${g.site.id}`} className="text-sm text-iris underline-offset-2 hover:underline">
                {access.canSchedule ? "Set up programs" : "Month view"} →
              </Link>
            </div>
            <div className="divide-y divide-border">
              {g.series.map((s) => {
                const open = seriesNeedLeader(s.id);
                return (
                  <div key={s.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                    <div>
                      <p className="font-medium">
                        {s.title}
                        {s.kind === "relationship_building" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{SESSION_KIND_LABELS[s.kind]}</span>}
                      </p>
                      <p className="text-sm text-muted">
                        {recurrenceLabel(s)} · {time12(s.start_time)}
                        {s.series_default_person.length ? ` · ${s.series_default_person.map((p) => nameOf(p.person_id).split(" ")[0]).join(", ")}` : ""}
                      </p>
                      {s.kind === "group_session" && open > 0 && <p className="text-xs text-brand-orange">{open} date{open === 1 ? "" : "s"} this season without a leader</p>}
                    </div>
                    {s.kind !== "group_session" ? (
                      <span className="text-sm text-muted">No leader needed</span>
                    ) : access.canSchedule ? (
                      <SeasonLeaderSelect residencyId={id} seriesId={s.id} seriesTitle={s.title} current={s.default_leader_id} musicians={musicians} />
                    ) : (
                      <span className="text-sm">{s.default_leader_id ? nameOf(s.default_leader_id) : "Picked per date"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {series.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            No programs in this season yet.{access.canSchedule && sites.length > 0 ? " Add them from a building's month view:" : ""}
          </p>
        )}
        {series.length === 0 && access.canSchedule && (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {sites.map((st) => (
              <li key={st.id}><Link href={`/residencies/${id}/month/${linkMonth}?site=${st.id}`} className="rounded-full border border-border px-3 py-1 hover:bg-iris-soft">{st.display_name}</Link></li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Special events this season</h2>
        <p className="mt-1 text-sm text-muted">Concerts and other one-time events, often planned at the start of the season. They show at the top of every month&apos;s schedule until they happen.</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {specialEvents.map((e) => {
            const tz = e.location?.site?.timezone ?? siteTz;
            const playing = e.session_assignment.filter((a) => a.status !== "absent");
            const leader = playing.find((a) => a.role === "leader");
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{formatDay(e.starts_at, tz)}</span>
                  {e.has_set_time && <span className="text-muted"> · {formatTime(e.starts_at, tz)}</span>}
                  {" · "}{e.schedule_state === "canceled" ? <span className="text-muted line-through">{e.title}</span> : e.title}
                  <span className="block text-xs text-muted">
                    {e.location?.display_name}
                    {playing.length ? ` · ${playing.map((a) => nameOf(a.person_id).split(" ")[0]).join(", ")}` : " · No musicians yet"}
                    {e.kind === "group_session" && !leader && e.schedule_state !== "canceled" ? " · needs a leader" : ""}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {e.schedule_state === "canceled" ? "No Program" : e.schedule_state === "published" ? "Published" : "Draft"}
                  {" · "}
                  <Link href={`/residencies/${id}/month/${localDateTime(e.starts_at, tz).date.slice(0, 7)}`} className="text-iris underline-offset-2 hover:underline">Open month</Link>
                </span>
              </li>
            );
          })}
          {specialEvents.length === 0 && <li className="py-2 text-muted">No special events this season yet.</li>}
        </ul>
        {access.canSchedule && rooms.length > 0 && (
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-medium text-iris">Add a special event</summary>
            <p className="mt-2 text-xs text-muted">Add the musicians, leader and title details from its month&apos;s schedule afterwards.</p>
            <div className="mt-4"><AddOneTimeForm residencyId={id} timeZone={siteTz} rooms={rooms} defaultDate={defaultEventDate} /></div>
          </details>
        )}
      </section>

    </AppShell>
  );
}
