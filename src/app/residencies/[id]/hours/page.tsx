import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatWeek, weekStart } from "@/shared/domain/documentation";
import { ApproveWeekButtons } from "./hours-controls";

// Hours to approve (DOMAIN-MODEL section 5, v0.19): the point person (or an
// admin) approves each musician's submitted week for this program, or sends
// it back with a note. Approved hours are what contractors are paid for.
export const metadata = { title: "Hours · Iris Music Project" };

type Entry = {
  person_id: string;
  hours: number;
  state: "draft" | "submitted" | "approved";
  returned_note: string | null;
  time_category: { name: string; sort_order: number } | null;
};

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
  const today = new Date().toISOString().slice(0, 10);
  const monday = weekStart(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : addDays(today, -7));

  const [names, { data }] = await Promise.all([
    getResidencyNames(id),
    supabase.from("time_entry").select("person_id, hours, state, returned_note, time_category(name, sort_order)").eq("residency_id", id).eq("week_starting", monday),
  ]);
  const entries = (data ?? []) as unknown as Entry[];
  const people = [...new Set(entries.map((e) => e.person_id))].sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? ""));
  const nav = "rounded-full border border-border px-3 py-1 text-sm hover:bg-iris-soft";

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
      <p className="mt-2 text-sm text-muted">Due from musicians Tuesday 5 pm. Approved hours go on contractors&apos; invoices and are locked.</p>

      {people.length === 0 && <p className="mt-6 text-muted">No hours entered for this week yet.</p>}
      <ul className="mt-6 flex flex-col gap-4">
        {people.map((pid) => {
          const mine = entries.filter((e) => e.person_id === pid).sort((a, b) => (a.time_category?.sort_order ?? 0) - (b.time_category?.sort_order ?? 0));
          const state = mine.some((e) => e.state === "approved") ? "approved" : mine.some((e) => e.state === "submitted") ? "submitted" : "draft";
          const total = mine.reduce((n, e) => n + Number(e.hours), 0);
          const name = names.get(pid) ?? "Someone";
          return (
            <li key={pid} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${state === "approved" ? "bg-iris-soft text-iris" : state === "submitted" ? "border border-brand-orange text-brand-orange" : "border border-border text-muted"}`}>
                  {state === "approved" ? "Approved" : state === "submitted" ? "Waiting for you" : "Not submitted yet"}
                </span>
              </div>
              <p className="mt-1 text-sm">
                {mine.map((e) => `${e.time_category?.name}: ${Number(e.hours)}`).join(" · ")} · <strong>{total} hours</strong>
              </p>
              {state === "draft" && mine.find((e) => e.returned_note) && <p className="mt-1 text-xs text-muted">Sent back: {mine.find((e) => e.returned_note)?.returned_note}</p>}
              {state === "submitted" && <div className="mt-3"><ApproveWeekButtons residencyId={id} personId={pid} week={monday} name={name} /></div>}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
