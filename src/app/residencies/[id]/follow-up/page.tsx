import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatWeek, weekStart } from "@/shared/domain/documentation";
import { buildingMetrics, musicianMetrics, type MetricActivity, type MetricEntry, type MetricSession } from "@/shared/domain/metrics";
import { localDateTime, todayIn } from "@/shared/domain/time";

// Follow-up (point person and admins, v0.24): who still owes documentation
// or hours, and how each musician and building is doing this season.
export const metadata = { title: "Follow-up · Iris Music Project" };

type SessionRow = {
  starts_at: string;
  schedule_state: string;
  location: { site_id: string; site: { timezone: string } | null } | null;
  session_assignment: { person_id: string; status: string }[];
  session_report: { attendance: number; resident_involvement: string; site_id: string | null } | null;
};
type ActivityRow = {
  occurred_on: string;
  minutes: number;
  person_id: string;
  relationship_activity_musician: { person_id: string }[];
  relationship_activity_resident: { resident_id: string }[];
};

export default async function FollowUpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const { isAdmin } = await requirePerson();
  const { id } = await params;
  const { week: weekParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await getResidencyAccess(id, isAdmin);
  if (!(isAdmin || access.isPointPerson)) redirect(`/residencies/${id}`);

  const supabase = await createClient();
  const today = todayIn();
  const now = new Date().toISOString();
  const week = weekStart(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : addDays(today, -7));
  const [{ data: residency }, { data: siteRows }, { data: seasons }, names] = await Promise.all([
    supabase.from("residency").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("residency_site").select("site(id, display_name, timezone)").eq("residency_id", id),
    supabase.from("season").select("id, name, starts_on, ends_on, roster_member(person_id, left_on)").eq("residency_id", id).lte("starts_on", today).gte("ends_on", today),
    getResidencyNames(id),
  ]);
  if (!residency) notFound();
  const sites = (siteRows ?? []).map((r) => r.site as unknown as { id: string; display_name: string; timezone: string }).filter(Boolean);
  const timeZone = sites.map((s) => s.timezone).sort()[0] ?? "America/New_York";
  const nameOf = (pid: string) => names.get(pid) ?? "Someone";

  // ---- Missing work: the chosen week, plus earlier weeks still open
  const weeks = [week, addDays(week, -7), addDays(week, -14), addDays(week, -21)];
  const missing = await Promise.all(
    weeks.map(async (w) => {
      const { data } = await supabase.rpc("missing_work", { p_residency: id, p_week: w });
      return { week: w, rows: (data ?? []) as { person_id: string; undocumented: number; documented_minutes: number; hours_state: string }[] };
    }),
  );

  // ---- Metrics for the current season
  const season = (seasons ?? [])[0] as { id: string; name: string; starts_on: string; ends_on: string; roster_member: { person_id: string; left_on: string | null }[] } | undefined;
  let musicianRows: ReturnType<typeof musicianMetrics> = [];
  let buildingRows: ReturnType<typeof buildingMetrics> = [];
  if (season) {
    const [{ data: sess }, { data: acts }, { data: ents }, { data: tgt }] = await Promise.all([
      supabase
        .from("session")
        .select("starts_at, schedule_state, location(site_id, site(timezone)), session_assignment(person_id, status), session_report(attendance, resident_involvement, site_id)")
        .eq("residency_id", id)
        .eq("kind", "group_session")
        .gte("starts_at", `${season.starts_on}T00:00:00Z`)
        .lte("starts_at", `${today}T23:59:59Z`),
      supabase
        .from("relationship_activity")
        .select("occurred_on, minutes, person_id, relationship_activity_musician(person_id), relationship_activity_resident(resident_id)")
        .eq("residency_id", id)
        .gte("occurred_on", season.starts_on)
        .lte("occurred_on", today),
      supabase.from("time_entry").select("person_id, week_starting, submitted_at, state").eq("residency_id", id).gte("week_starting", season.starts_on),
      supabase.from("target").select("value").eq("season_id", season.id).eq("metric", "collaborative_programs_per_musician").maybeSingle(),
    ]);
    const sessions: MetricSession[] = ((sess ?? []) as unknown as SessionRow[]).map((s) => ({
      date: localDateTime(s.starts_at, s.location?.site?.timezone ?? timeZone).date,
      startsAt: s.starts_at,
      canceled: s.schedule_state === "canceled",
      siteId: s.session_report?.site_id ?? s.location?.site_id ?? "",
      musicians: s.session_assignment.filter((a) => a.status !== "absent").map((a) => a.person_id),
      report: s.session_report ? { attendance: s.session_report.attendance, collaborative: s.session_report.resident_involvement !== "none" } : null,
    }));
    const activities: MetricActivity[] = ((acts ?? []) as unknown as ActivityRow[]).map((a) => ({
      date: a.occurred_on,
      minutes: a.minutes,
      musicians: [a.person_id, ...a.relationship_activity_musician.map((m) => m.person_id)],
      residentIds: a.relationship_activity_resident.map((r) => r.resident_id),
    }));
    const entries: MetricEntry[] = ((ents ?? []) as { person_id: string; week_starting: string; submitted_at: string | null; state: string }[]).map((e) => ({ personId: e.person_id, week: e.week_starting, submittedAt: e.submitted_at, state: e.state }));
    const roster = [...new Set(season.roster_member.filter((m) => !m.left_on || m.left_on > today).map((m) => m.person_id))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    musicianRows = musicianMetrics({ musicians: roster, sessions, activities, entries, target: tgt?.value ?? 2, seasonStart: season.starts_on, today, now, timeZone });
    buildingRows = buildingMetrics(sessions, sites.map((s) => s.id), today.slice(0, 7));
  }

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const nav = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft";
  const cell = "px-3 py-2";
  const ok = "text-iris";
  const warn = "text-brand-orange font-medium";
  const owes = (r: { undocumented: number; documented_minutes: number; hours_state: string }) =>
    [r.undocumented > 0 ? `${r.undocumented} program${r.undocumented === 1 ? "" : "s"} to document` : null, r.hours_state === "none" || r.hours_state === "draft" ? "week not submitted" : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Follow-up</h1>
        <Link href={`/residencies/${id}/hours?week=${week}`} className={nav}>Hours to approve</Link>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Missing documentation and hours</h2>
            <p className="text-sm text-muted">{formatWeek(week)} · due Tuesday 5 pm the following week</p>
          </div>
          <nav className="flex gap-2" aria-label="Weeks">
            <Link href={`/residencies/${id}/follow-up?week=${addDays(week, -7)}`} className={nav}>← Previous week</Link>
            <Link href={`/residencies/${id}/follow-up?week=${addDays(week, 7)}`} className={nav}>Next week →</Link>
          </nav>
        </div>
        <ul className="mt-3 divide-y divide-border text-sm">
          {missing[0]!.rows.map((r) => (
            <li key={r.person_id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="font-medium">{nameOf(r.person_id)}</span>
              <span className={warn}>{owes(r)}</span>
            </li>
          ))}
          {missing[0]!.rows.length === 0 && <li className={`py-2 ${ok}`}>Everyone is in for this week.</li>}
        </ul>
        {missing.slice(1).some((m) => m.rows.length) && (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            <p className="font-medium">Earlier weeks still open</p>
            <ul className="mt-1 space-y-1">
              {missing.slice(1).flatMap((m) =>
                m.rows.map((r) => (
                  <li key={`${m.week}-${r.person_id}`}>
                    <Link href={`/residencies/${id}/follow-up?week=${m.week}`} className="hover:text-iris">
                      {formatWeek(m.week)}: {nameOf(r.person_id)} · <span className={warn}>{owes(r)}</span>
                    </Link>
                  </li>
                )),
              )}
            </ul>
          </div>
        )}
      </section>

      {season && (
        <>
          <section className={card}>
            <h2 className="text-lg font-semibold">Musicians this season</h2>
            <p className="text-sm text-muted">{season.name}, so far. On time = week submitted by Tuesday 5 pm.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className={cell}>Musician</th>
                    <th className={cell}>Collaborations</th>
                    <th className={cell}>Documentation</th>
                    <th className={cell}>Relationship building</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {musicianRows.map((m) => (
                    <tr key={m.personId}>
                      <td className={`${cell} font-medium`}>{nameOf(m.personId)}</td>
                      <td className={`${cell} ${m.collaborations >= m.target ? ok : ""}`}>{m.collaborations} of {m.target}</td>
                      <td className={cell}>
                        <span className={ok}>{m.onTime} on time</span>
                        {m.late > 0 && <span className={warn}> · {m.late} late</span>}
                        {m.missing > 0 && <span className={warn}> · {m.missing} missing</span>}
                      </td>
                      <td className={cell}>{m.rbMinutesPerWeek} min/week · {m.residentsReached} resident{m.residentsReached === 1 ? "" : "s"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={card}>
            <h2 className="text-lg font-semibold">Attendance by building</h2>
            <p className="text-sm text-muted">Average attendance at documented programs (everyone present). Handbook goal: 7.</p>
            <ul className="mt-3 divide-y divide-border text-sm">
              {buildingRows.map((b) => (
                <li key={b.siteId} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{sites.find((s) => s.id === b.siteId)?.display_name}</span>
                  <span>
                    This month: <span className={b.monthAvg !== null && b.monthAvg >= 7 ? ok : b.monthAvg !== null ? warn : ""}>{b.monthAvg ?? "—"}</span>
                    <span className="text-muted"> ({b.monthCount} program{b.monthCount === 1 ? "" : "s"})</span> · Season:{" "}
                    <span className={b.seasonAvg !== null && b.seasonAvg >= 7 ? ok : b.seasonAvg !== null ? warn : ""}>{b.seasonAvg ?? "—"}</span>
                    <span className="text-muted"> ({b.seasonCount})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
