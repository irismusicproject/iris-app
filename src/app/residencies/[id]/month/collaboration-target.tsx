import { createClient } from "@/lib/supabase/server";
import { localDateTime, shiftMonth } from "@/shared/domain/time";
import { CollaborationTargetForm } from "../season/season-controls";

// The season's Collaboration target (D6), shown on Site Details since v0.9
// (Nov 27, 2026; it used to be on the season view). Counts are for the whole
// season across the residency's buildings: dates documented with Collab? = Yes
// that each musician played in.
type Row = {
  starts_at: string;
  schedule_state: string;
  location: { site: { timezone: string } | null } | null;
  session_assignment: { person_id: string; status: string }[];
  session_report: { resident_involvement: string } | null;
};

export async function CollaborationTarget({
  residencyId,
  month,
  canSchedule,
  names,
}: {
  residencyId: string;
  month: string;
  canSchedule: boolean;
  names: Map<string, string>;
}) {
  const supabase = await createClient();
  const day = `${month}-01`;
  const { data: seasonRow } = await supabase
    .from("season")
    .select("id, name, starts_on, ends_on, roster_member(person_id, left_on)")
    .eq("residency_id", residencyId)
    .lt("starts_on", `${shiftMonth(month, 1)}-01`)
    .gte("ends_on", day)
    .order("starts_on")
    .limit(1)
    .maybeSingle();
  if (!seasonRow) return null;
  const season = seasonRow as { id: string; name: string; starts_on: string; ends_on: string; roster_member: { person_id: string; left_on: string | null }[] };

  const [{ data: targetRow }, { data: sessionRows }] = await Promise.all([
    supabase.from("target").select("value").eq("season_id", season.id).eq("metric", "collaborative_programs_per_musician").maybeSingle(),
    supabase
      .from("session")
      .select("starts_at, schedule_state, location(site(timezone)), session_assignment(person_id, status), session_report(resident_involvement)")
      .eq("residency_id", residencyId)
      .gte("starts_at", new Date(Date.parse(`${season.starts_on}T00:00:00Z`) - 86_400_000).toISOString())
      .lte("starts_at", new Date(Date.parse(`${season.ends_on}T00:00:00Z`) + 2 * 86_400_000).toISOString()),
  ]);
  const target = targetRow?.value ?? 2; // handbook default
  const today = new Date().toISOString().slice(0, 10);
  const musicians = [...new Set(season.roster_member.filter((m) => !m.left_on || m.left_on > today).map((m) => m.person_id))]
    .map((pid) => ({ id: pid, label: names.get(pid) ?? "Someone" }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const count = new Map<string, number>();
  for (const s of (sessionRows ?? []) as unknown as Row[]) {
    const date = localDateTime(s.starts_at, s.location?.site?.timezone ?? "America/New_York").date;
    if (date < season.starts_on || date > season.ends_on) continue;
    if (!s.session_report || s.session_report.resident_involvement === "none" || s.schedule_state === "canceled") continue;
    for (const a of s.session_assignment) if (a.status !== "absent") count.set(a.person_id, (count.get(a.person_id) ?? 0) + 1);
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Collaboration target · {season.name}</h2>
      <p className="mt-1 text-sm text-muted">Programs documented with Collab? = Yes count toward it, at every building this season. The handbook default is 2 per semester; adjust it for this project.</p>
      <div className="mt-3">
        {canSchedule ? (
          <CollaborationTargetForm key={target} residencyId={residencyId} seasonId={season.id} value={target} />
        ) : (
          <p className="text-sm"><strong>{target}</strong> collaborative programs per musician this season</p>
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {musicians.map((m) => {
          const n = count.get(m.id) ?? 0;
          return (
            <li key={m.id} className={`rounded-full border px-3 py-1 ${n >= target ? "border-iris bg-iris-soft" : "border-border"}`}>
              {m.label.split(" ")[0]}: {n} of {target}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
