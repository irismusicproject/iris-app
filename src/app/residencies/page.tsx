import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RESIDENCY_STATUS_LABELS, type Residency } from "@/shared/domain/scheduling";
import { ResidencyForm } from "./forms";

// "Programs": Iris's residencies (docs/GLOSSARY.md, Part A). Everyone sees the
// programs they're part of (Row Level Security); admins see all and add new ones.
export const metadata = { title: "Programs · Iris Music Project" };

type Row = Residency & { partner: { display_name: string } | null; residency_site: { site: { display_name: string } | null }[] };

export default async function ResidenciesPage() {
  const { isAdmin } = await requirePerson();
  const supabase = await createClient();
  const { data } = await supabase
    .from("residency")
    .select("*, partner(display_name), residency_site(site(display_name))")
    .order("status")
    .order("name");
  const rows = (data ?? []) as Row[];

  let partners: { id: string; label: string }[] = [];
  if (isAdmin) {
    const { data: p } = await supabase.from("partner").select("id, display_name").eq("active", true).order("display_name");
    partners = (p ?? []).map((x) => ({ id: x.id, label: x.display_name }));
  }

  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">Programs</h1>
      <p className="mt-2 text-muted">
        {isAdmin ? "Every Iris program." : "The programs you're part of."}
      </p>

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/residencies/${r.id}`}
              className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-iris-soft ${r.status === "ended" ? "opacity-60" : ""}`}
            >
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="block text-sm text-muted">
                  {[r.partner?.display_name, r.residency_site.map((s) => s.site?.display_name).filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">{RESIDENCY_STATUS_LABELS[r.status]}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted">
            {isAdmin ? "No programs yet. Add the first one below." : "You're not on a program's roster yet."}
          </li>
        )}
      </ul>

      {isAdmin && (
        <section className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Add a program</h2>
          <p className="mt-1 text-sm text-muted">
            One program per partner engagement. You&apos;ll pick its sites, season and roster next.
          </p>
          <div className="mt-5">
            {partners.length ? (
              <ResidencyForm partners={partners} />
            ) : (
              <p className="text-sm text-muted">
                Add a partner first, under <Link href="/admin/partners" className="text-iris underline">Partners</Link>.
              </p>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
