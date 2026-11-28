import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDay, formatMonth, formatTime, isMonth, localDateTime, monthWindow, shiftMonth, todayIn } from "@/shared/domain/time";

// Calendar (D20, Nov 27, 2026): the website's copy of the phone's Calendar
// tab (mobile/src/app/(tabs)/calendar.tsx). One month at a glance, building
// by building, with each building's stage. A date opens that building's Site
// Details, where its leader adds the title and musicians mark "I can't play"
// or ask the Iris Supervisor. Everyone sees only the programs they're part of
// (the database decides; admins see all).
export const metadata = { title: "Calendar · Iris Music Project" };

type Stage = "team_editing" | "team_confirmed" | "sent_to_partner" | "partner_changes" | "final";
type Row = {
  id: string;
  residency_id: string;
  title: string;
  starts_at: string;
  has_set_time: boolean;
  schedule_state: "draft" | "published" | "canceled";
  location: { site_id: string; display_name: string; site: { display_name: string; timezone: string } | null } | null;
  session_assignment: { person_id: string; role: "leader" | "participant"; status: string }[];
};
type MonthRow = { residency_id: string; site_id: string; stage: Stage };

// Three steps on screen, as on the phone (D20).
const STEPS = ["team_editing", "sent_to_partner", "final"] as const;
const stepOf = (s: Stage) => (s === "team_confirmed" ? "team_editing" : s === "partner_changes" ? "sent_to_partner" : s);
const LABEL = { team_editing: "Team editing", sent_to_partner: "Sent to partner", final: "Final" } as const;
const HELP = {
  team_editing: "Open for the team until the 10th: review and edit your dates; leaders add titles (type “No Program” to cancel a date); mark dates you can't play; propose leader swaps.",
  sent_to_partner: "The calendar went to the partner. Only the partner's changes go in now, entered by the Lead Musician; for anything else, ask the Iris Supervisor.",
  final: "Final and locked. Ask the Iris Supervisor for a sub or a change; same day, call them.",
} as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { isAdmin, person } = await requirePerson();
  const { month: monthParam } = await searchParams;
  const month = monthParam && isMonth(monthParam) ? monthParam : todayIn().slice(0, 7);
  const supabase = await createClient();
  const w = monthWindow(month);
  const [{ data }, { data: sm }] = await Promise.all([
    supabase
      .from("session")
      .select("id, residency_id, title, starts_at, has_set_time, schedule_state, location(site_id, display_name, site(display_name, timezone)), session_assignment(person_id, role, status)")
      .eq("kind", "group_session")
      .gte("starts_at", w.from)
      .lt("starts_at", w.to)
      .order("starts_at"),
    supabase.from("schedule_month").select("residency_id, site_id, stage").eq("month", `${month}-01`),
  ]);
  const tzOf = (r: Row) => r.location?.site?.timezone ?? "America/New_York";
  const localDate = (r: Row) => localDateTime(r.starts_at, tzOf(r)).date;
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.location && localDate(r).startsWith(month));
  const months = (sm ?? []) as MonthRow[];
  const plays = (r: Row) => r.session_assignment.some((a) => a.person_id === person.id && a.status !== "absent");
  const cantPlay = (r: Row) => r.session_assignment.some((a) => a.person_id === person.id && a.status === "absent");

  // Buildings this month, with their stage.
  const buildings = new Map<string, { name: string; residencyId: string; siteId: string; stage: Stage | null; rows: Row[] }>();
  for (const r of rows) {
    const k = `${r.residency_id}|${r.location!.site_id}`;
    if (!buildings.has(k))
      buildings.set(k, {
        name: r.location!.site?.display_name ?? "",
        residencyId: r.residency_id,
        siteId: r.location!.site_id,
        stage: months.find((m) => m.residency_id === r.residency_id && m.site_id === r.location!.site_id)?.stage ?? null,
        rows: [],
      });
    buildings.get(k)!.rows.push(r);
  }

  // The month grid: highlighted days with a date I play; orange where I can't play.
  const first = new Date(`${month}-01T12:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: ({ day: number; mine: boolean; off: boolean; any: boolean } | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const here = rows.filter((r) => localDate(r) === iso);
    cells.push({ day: d, mine: here.some(plays), off: here.some(cantPlay), any: here.length > 0 });
  }
  while (cells.length % 7) cells.push(null);

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const pill = "rounded-full border border-border px-3 py-1 hover:bg-iris-soft";
  return (
    <AppShell isAdmin={isAdmin}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{formatMonth(month)}</h1>
        <nav className="flex gap-2 text-sm" aria-label="Months">
          <Link href={`/calendar?month=${shiftMonth(month, -1)}`} className={pill}>← {formatMonth(shiftMonth(month, -1))}</Link>
          <Link href={`/calendar?month=${shiftMonth(month, 1)}`} className={pill}>{formatMonth(shiftMonth(month, 1))} →</Link>
        </nav>
      </div>

      <section className={card} aria-label={`${formatMonth(month)} at a glance`}>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {WEEKDAYS.map((d) => <span key={d} className="py-1 text-xs font-semibold text-muted">{d}</span>)}
          {cells.map((c, i) => (
            <span
              key={i}
              className={`rounded-lg py-2 ${c?.off ? "bg-brand-orange/10 font-semibold text-brand-orange" : c?.mine ? "bg-iris-soft font-semibold text-iris" : c?.any ? "text-foreground" : "text-muted"}`}
            >
              {c?.day ?? ""}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Purple: you play · Orange: you can&apos;t play</p>
      </section>

      {rows.length === 0 && <p className="mt-6 text-muted">No dates in {formatMonth(month)} yet.</p>}

      {[...buildings.values()].map((b) => {
        const step = b.stage ? stepOf(b.stage) : null;
        const i = step ? STEPS.indexOf(step) : -1;
        return (
          <section key={`${b.residencyId}|${b.siteId}`} className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{b.name}</h2>
              <span className="flex gap-3 text-sm">
                <a href={`/residencies/${b.residencyId}/month/${month}/calendar?site=${b.siteId}&view=1`} target="_blank" rel="noreferrer" className="text-iris underline-offset-2 hover:underline">View PDF</a>
                <Link href={`/residencies/${b.residencyId}/month/${month}?site=${b.siteId}`} className="text-iris underline-offset-2 hover:underline">Site Details →</Link>
              </span>
            </div>
            <div className="mt-3 flex gap-1" aria-hidden="true">
              {STEPS.map((s, k) => <span key={s} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-iris" : "bg-border"}`} />)}
            </div>
            <p className="mt-2 text-sm font-semibold">{step ? `Stage ${i + 1} of 3: ${LABEL[step]}` : "Not open for the team yet"}</p>
            <p className="mt-1 text-sm text-muted">{step ? HELP[step] : "No dates yet. The month opens for the team as soon as its first date is added."}</p>
            <ul className="mt-3 divide-y divide-border">
              {b.rows.map((r) => {
                const tz = tzOf(r);
                const canceled = r.schedule_state === "canceled";
                const leader = r.session_assignment.find((a) => a.role === "leader" && a.status !== "absent");
                return (
                  <li key={r.id}>
                    <Link href={`/residencies/${b.residencyId}/month/${month}?site=${b.siteId}`} className="flex flex-wrap items-center gap-2 py-2 hover:bg-iris-soft/50">
                      <span className={`text-sm font-medium ${canceled ? "text-muted" : ""}`}>
                        {formatDay(r.starts_at, tz)}
                        {r.has_set_time ? ` · ${formatTime(r.starts_at, tz)}` : ""}
                      </span>
                      <span className="flex-1 text-sm text-muted">
                        {canceled ? (r.title === "No Program" ? "No Program" : `No Program (${r.title})`) : r.title} · {r.location?.display_name}
                      </span>
                      {cantPlay(r) && <span className="rounded-full bg-brand-orange/10 px-2 py-0.5 text-xs text-brand-orange">You can&apos;t play</span>}
                      {!cantPlay(r) && plays(r) && <span className="rounded-full bg-iris-soft px-2 py-0.5 text-xs text-iris">{leader?.person_id === person.id ? "You lead" : "You play"}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </AppShell>
  );
}
