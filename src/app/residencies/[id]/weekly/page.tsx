import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { SESSION_KIND_LABELS, WEEKDAYS, type Series } from "@/shared/domain/scheduling";
import { SeriesForm } from "./series-form";

// "Weekly programs" = Series (docs/GLOSSARY.md). Schedulers add and edit them;
// everyone on the roster can see them.
export const metadata = { title: "Weekly programs · Iris Music Project" };

type SeriesRow = Series & { location: { display_name: string } | null; series_default_person: { person_id: string }[] };

const time12 = (t: string | null) => {
  if (!t) return "No set time";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export default async function WeeklyPage({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await requirePerson();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: residency } = await supabase.from("residency").select("id, name").eq("id", id).maybeSingle();
  if (!residency) notFound();
  const access = await getResidencyAccess(id, isAdmin);

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: seriesRows }, { data: siteRows }, { data: seasonRows }] = await Promise.all([
    supabase
      .from("series")
      .select("*, location:default_location_id(display_name), series_default_person(person_id)")
      .eq("residency_id", id)
      .order("active_from"),
    supabase.from("residency_site").select("site(display_name, location(id, display_name, active))").eq("residency_id", id),
    supabase.from("season").select("roster_member(person_id, left_on, person:person_id(name))").eq("residency_id", id).gte("ends_on", today),
  ]);
  const series = (seriesRows ?? []) as SeriesRow[];
  type SiteRow = { site: { display_name: string; location: { id: string; display_name: string; active: boolean }[] } | null };
  const rooms = ((siteRows ?? []) as unknown as SiteRow[]).flatMap((r) =>
    (r.site?.location ?? []).filter((l) => l.active).map((l) => ({ id: l.id, label: `${r.site!.display_name} · ${l.display_name}` })),
  );
  type RosterRow = { roster_member: { person_id: string; left_on: string | null; person: { name: string } | null }[] };
  const musicianMap = new Map<string, string>();
  for (const s of (seasonRows ?? []) as unknown as RosterRow[])
    for (const m of s.roster_member) if (!m.left_on || m.left_on > today) musicianMap.set(m.person_id, m.person?.name ?? "Someone");
  const musicians = [...musicianMap].map(([pid, label]) => ({ id: pid, label })).sort((a, b) => a.label.localeCompare(b.label));
  const nameOf = (pid: string) => musicianMap.get(pid) ?? "Former roster member";

  const card = "mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6";
  return (
    <AppShell isAdmin={isAdmin}>
      <Link href={`/residencies/${id}`} className="text-sm text-muted hover:text-foreground">← {residency.name}</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Weekly programs</h1>
      <p className="mt-1 text-muted">
        Set up once; each month fills in from these.{" "}
        <Link href={`/residencies/${id}/month`} className="text-iris underline-offset-2 hover:underline">Go to the schedule</Link>
      </p>

      {series.length === 0 && <p className="mt-6 text-sm text-muted">No weekly programs yet.</p>}
      {series.map((s) => {
        const ended = s.active_until !== null && s.active_until < today;
        const days = WEEKDAYS.filter((d) => s.weekdays.includes(d.value)).map((d) => d.label).join(", ");
        const people = s.series_default_person.map((p) => nameOf(p.person_id)).join(", ");
        return (
          <section key={s.id} className={`${card} ${ended ? "opacity-60" : ""}`}>
            <h2 className="text-lg font-semibold">
              {s.title}
              {s.kind === "relationship_building" && (
                <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-normal">{SESSION_KIND_LABELS[s.kind]}</span>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {days} · {time12(s.start_time)}{s.minutes ? ` · ${s.minutes} min` : ""} · {s.location?.display_name}
              {people ? ` · ${people}` : ""}
              {ended ? " · Ended" : ""}
            </p>
            {access.canSchedule && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-iris">Edit</summary>
                <div className="mt-4">
                  <SeriesForm
                    residencyId={id}
                    series={s}
                    defaultPeople={s.series_default_person.map((p) => p.person_id)}
                    rooms={rooms}
                    musicians={musicians}
                  />
                </div>
              </details>
            )}
          </section>
        );
      })}

      {access.canSchedule && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Add a weekly program</h2>
          <p className="mt-1 text-sm text-muted">
            For lessons and other relationship building, pick that kind; the time is then optional.
          </p>
          <div className="mt-5">
            {rooms.length ? (
              <SeriesForm residencyId={id} rooms={rooms} musicians={musicians} />
            ) : (
              <p className="text-sm text-muted">Add a site with at least one room to this program first.</p>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
