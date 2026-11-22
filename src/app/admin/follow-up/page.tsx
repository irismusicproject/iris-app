import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatWeek, weekStart } from "@/shared/domain/documentation";

// Follow-up across all programs (admins, v0.24): who still owes last week's
// documentation or hours. Each program has its own page with metrics.
export const metadata = { title: "Follow-up · Iris Music Project" };

export default async function AdminFollowUpPage() {
  const { isAdmin } = await requireAdmin();
  const supabase = await createClient();
  const week = weekStart(addDays(new Date().toISOString().slice(0, 10), -7));
  const { data: programs } = await supabase.from("residency").select("id, name").eq("status", "active").order("name");
  const rows = await Promise.all(
    (programs ?? []).map(async (p) => {
      const [{ data }, names] = await Promise.all([supabase.rpc("missing_work", { p_residency: p.id, p_week: week }), getResidencyNames(p.id)]);
      const missing = (data ?? []) as { person_id: string; undocumented: number; hours_state: string }[];
      return { ...p, missing: missing.map((m) => ({ name: names.get(m.person_id) ?? "Someone", undocumented: m.undocumented, notSubmitted: m.hours_state === "none" || m.hours_state === "draft" })) };
    }),
  );

  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">Follow-up</h1>
      <p className="mt-1 text-muted">Missing documentation and hours for {formatWeek(week)} (due Tuesday 5 pm). Open a program for its metrics.</p>
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((p) => (
          <li key={p.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/residencies/${p.id}/follow-up`} className="font-medium hover:text-iris">{p.name}</Link>
              <span className={`text-sm ${p.missing.length ? "font-medium text-brand-orange" : "text-iris"}`}>
                {p.missing.length ? `${p.missing.length} missing` : "Everyone is in"}
              </span>
            </div>
            {p.missing.length > 0 && (
              <ul className="mt-2 text-sm">
                {p.missing.map((m) => (
                  <li key={m.name}>
                    {m.name}: {[m.undocumented ? `${m.undocumented} to document` : null, m.notSubmitted ? "week not submitted" : null].filter(Boolean).join(" · ")}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted">No active programs.</li>}
      </ul>
    </AppShell>
  );
}
