import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_KIND_LABELS, addDays, formatWeek, weekStart, type ActivityKind } from "@/shared/domain/documentation";
import { localDateTime, todayIn } from "@/shared/domain/time";
import { ApproveWeekButtons } from "./hours-controls";

// Hours to approve (DOMAIN-MODEL section 5, v0.19): the point person (or an
// admin) approves each musician's submitted week for this program, or sends
// it back with a note. Approved hours are what contractors are paid for.
// Each category shows the hours entered next to what the musician's
// schedule and logs say, so the point person can check them.
export const metadata = { title: "Hours · Iris Music Project" };

type Entry = {
  person_id: string;
  hours: number;
  state: "draft" | "submitted" | "approved";
  returned_note: string | null;
  time_category: { name: string; sort_order: number } | null;
};
type SessionRow = {
  title: string;
  starts_at: string;
  scheduled_minutes: number | null;
  schedule_state: string;
  is_special_event: boolean;
  kind: string;
  location: { site: { timezone: string } | null } | null;
  session_assignment: { person_id: string; status: string }[];
  session_report: { actual_minutes: number } | null;
};
type ActivityRow = { person_id: string; occurred_on: string; kind: ActivityKind; minutes: number };
type Item = { date: string; label: string; minutes: number };

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const hrs = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export default async function HoursPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string }> }) {
  const { isAdmin } = await requirePerson();
  const { id } = await params;
  const { week: weekParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const access = await getResidencyAccess(id, isAdmin);
  if (!access.isPointPerson) redirect(`/residencies/${id}`);

  const supabase = await createClient();
  const { data: residency } = await supabase.from("residency").select("id, name").eq("id", id).maybeSingle();
  if (!residency) notFound();
  const today = todayIn();
  const monday = weekStart(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : addDays(today, -7));
  const sunday = addDays(monday, 6);

  const [names, { data }, { data: sessionRows }, { data: activityRows }] = await Promise.all([
    getResidencyNames(id),
    supabase.from("time_entry").select("person_id, hours, state, returned_note, time_category(name, sort_order)").eq("residency_id", id).eq("week_starting", monday),
    supabase
      .from("session")
      .select("title, starts_at, scheduled_minutes, schedule_state, is_special_event, kind, location(site(timezone)), session_assignment(person_id, status), session_report(actual_minutes)")
      .eq("residency_id", id)
      .gte("starts_at", `${addDays(monday, -1)}T00:00:00Z`)
      .lt("starts_at", `${addDays(sunday, 2)}T00:00:00Z`)
      .order("starts_at"),
    supabase.from("relationship_activity").select("person_id, occurred_on, kind, minutes").eq("residency_id", id).gte("occurred_on", monday).lte("occurred_on", sunday).order("occurred_on"),
  ]);
  const entries = (data ?? []) as unknown as Entry[];
  const people = [...new Set(entries.map((e) => e.person_id))].sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""));

  // What each person's schedule and logs say for the week, by category.
  const sessions = ((sessionRows ?? []) as unknown as SessionRow[])
    .filter((s) => s.kind === "group_session" && s.schedule_state !== "canceled")
    .map((s) => ({ ...s, date: localDateTime(s.starts_at, s.location?.site?.timezone ?? "America/New_York").date }))
    .filter((s) => s.date >= monday && s.date <= sunday && s.date <= today);
  const activities = (activityRows ?? []) as ActivityRow[];
  const documented = (pid: string): Record<string, Item[]> => {
    const played = sessions.filter((s) => s.session_assignment.some((a) => a.person_id === pid && a.status !== "absent"));
    const item = (s: (typeof sessions)[number]): Item => ({ date: s.date, label: s.title, minutes: s.session_report?.actual_minutes ?? s.scheduled_minutes ?? 0 });
    return {
      Programs: played.filter((s) => !s.is_special_event).map(item),
      Concerts: played.filter((s) => s.is_special_event).map(item),
      "Relationship Building": activities.filter((a) => a.person_id === pid).map((a) => ({ date: a.occurred_on, label: ACTIVITY_KIND_LABELS[a.kind] ?? a.kind, minutes: a.minutes })),
    };
  };

  const nav = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft";
  const cell = "px-3 py-2 align-top";

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hours to approve</h1>
          <p className="text-muted">{formatWeek(monday)}</p>
        </div>
        <nav className="flex gap-2" aria-label="Weeks">
          <Link href={`/residencies/${id}/hours?week=${addDays(monday, -7)}`} className={nav}>← Previous week</Link>
          <Link href={`/residencies/${id}/hours?week=${addDays(monday, 7)}`} className={nav}>Next week →</Link>
        </nav>
      </div>
      <p className="mt-2 text-sm text-muted">
        Due from musicians Tuesday 5 pm. Hours are calculated from each musician&apos;s documentation; each line lists what they come from. Approved hours go on contractors&apos; invoices and are locked.
      </p>

      {people.length === 0 && <p className="mt-6 text-muted">No hours entered for this week yet.</p>}
      <ul className="mt-6 flex flex-col gap-4">
        {people.map((pid) => {
          const mine = entries.filter((e) => e.person_id === pid).sort((a, b) => (a.time_category?.sort_order ?? 0) - (b.time_category?.sort_order ?? 0));
          const state = mine.some((e) => e.state === "approved") ? "approved" : mine.some((e) => e.state === "submitted") ? "submitted" : "draft";
          const total = mine.reduce((n, e) => n + Number(e.hours), 0);
          const name = names.get(pid) ?? "Someone";
          const docs = documented(pid);
          return (
            <li key={pid} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${state === "approved" ? "bg-iris-soft text-iris" : state === "submitted" ? "border border-brand-orange text-brand-orange" : "border border-border text-muted"}`}>
                  {state === "approved" ? "Approved" : state === "submitted" ? "Waiting for you" : "Not submitted yet"}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className={cell}>Category</th>
                      <th className={`${cell} text-right`}>Entered</th>
                      <th className={cell}>From the schedule and logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mine.map((e) => {
                      const cat = e.time_category?.name ?? "";
                      const items = docs[cat] ?? [];
                      const docHours = hrs(items.reduce((n, i) => n + i.minutes, 0));
                      const entered = Number(e.hours);
                      return (
                        <tr key={cat}>
                          <td className={cell}>{cat}</td>
                          <td className={`${cell} text-right font-medium`}>{entered} hrs</td>
                          <td className={cell}>
                            {items.length === 0 ? (
                              <span className="text-muted">Nothing scheduled or logged</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {items.map((i, n) => (
                                  <li key={n}>{day(i.date)} · {i.label} · {i.minutes} min</li>
                                ))}
                                <li className="text-muted">= {docHours} hrs</li>
                              </ul>
                            )}
                            {entered !== docHours && (
                              <p className="mt-1 text-xs text-brand-orange">
                                {entered > docHours ? `${Math.round((entered - docHours) * 100) / 100} hrs more than the schedule and logs` : `${Math.round((docHours - entered) * 100) / 100} hrs less than the schedule and logs`}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className={cell}>Total</td>
                      <td className={`${cell} text-right`}>{total} hrs</td>
                      <td className={cell} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {state === "draft" && mine.find((e) => e.returned_note) && <p className="mt-2 text-xs text-muted">Sent back: {mine.find((e) => e.returned_note)?.returned_note}</p>}
              {state === "submitted" && <div className="mt-3"><ApproveWeekButtons residencyId={id} personId={pid} week={monday} name={name} /></div>}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
