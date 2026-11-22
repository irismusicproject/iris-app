import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { SESSION_KIND_LABELS, WEEKDAYS, type SessionKind } from "@/shared/domain/scheduling";
import { formatMonth, localDateTime } from "@/shared/domain/time";
import { FillSeasonButton, SeasonLeaderSelect } from "./season-controls";

// Season view (DOMAIN-MODEL v0.16): the whole semester at a glance, for the
// point person (and Admin Lead, admins). Set a weekly program's leader for
// the whole season, fill every month at once, and see each month's status.
export const metadata = { title: "Season · Iris Music Project" };

type SeasonRow = { id: string; name: string; starts_on: string; ends_on: string; roster_member: { person_id: string; left_on: string | null }[] };
type SeriesRow = {
  id: string;
  kind: SessionKind;
  title: string;
  weekdays: number[];
  start_time: string | null;
  minutes: number | null;
  default_leader_id: string | null;
  active_from: string;
  active_until: string | null;
  series_default_person: { person_id: string }[];
};
type SessionRow = {
  series_id: string | null;
  kind: SessionKind;
  starts_at: string;
  schedule_state: "draft" | "published" | "canceled";
  location: { site: { timezone: string } | null } | null;
  session_assignment: { role: string; status: string }[];
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

  const today = new Date().toISOString().slice(0, 10);
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

  const [{ data: seriesRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("series")
      .select("id, kind, title, weekdays, start_time, minutes, default_leader_id, active_from, active_until, series_default_person(person_id)")
      .eq("residency_id", id)
      .order("active_from"),
    supabase
      .from("session")
      .select("series_id, kind, starts_at, schedule_state, location(site(timezone)), session_assignment(role, status)")
      .eq("residency_id", id)
      .gte("starts_at", new Date(Date.parse(`${season.starts_on}T00:00:00Z`) - 86_400_000).toISOString())
      .lte("starts_at", new Date(Date.parse(`${season.ends_on}T00:00:00Z`) + 2 * 86_400_000).toISOString()),
  ]);
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
  const seriesNeedLeader = (sid: string) => sessions.filter((s) => s.series_id === sid && needsLeader(s)).length;
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
        <h2 className="text-lg font-semibold">Weekly programs and leaders</h2>
        <p className="mt-1 text-sm text-muted">
          {access.canSchedule
            ? "Pick a leader for the whole season: they become the usual leader and lead every draft date from today on. Published months don't change."
            : "Who usually leads each weekly program this season."}
        </p>
        <div className="mt-4 divide-y divide-border">
          {series.map((s) => {
            const open = seriesNeedLeader(s.id);
            return (
              <div key={s.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                <div>
                  <p className="font-medium">
                    {s.title}
                    {s.kind === "relationship_building" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{SESSION_KIND_LABELS[s.kind]}</span>}
                  </p>
                  <p className="text-sm text-muted">
                    {WEEKDAYS.filter((d) => s.weekdays.includes(d.value)).map((d) => d.label).join(", ")} · {time12(s.start_time)}
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
          {series.length === 0 && <p className="py-3 text-sm text-muted">No weekly programs in this season yet.</p>}
        </div>
      </section>

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
    </AppShell>
  );
}
