import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Partner } from "@/shared/domain/place";
import { PartnerForm } from "./forms";

export const metadata = { title: "Partners · Iris Music Project" };

type Row = Partner & { site: { id: string; active: boolean }[] };

export default async function PartnersPage() {
  const { isAdmin } = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner")
    .select("*, site(id, active)")
    .order("active", { ascending: false })
    .order("display_name");
  const partners = (data ?? []) as Row[];

  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
      <p className="mt-2 text-sm text-muted">
        The organizations Iris works with. Each partner has one or more sites
        (buildings or campuses), and each site has rooms or areas.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t load partners. Refresh to try again.
        </p>
      )}
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {partners.map((p) => {
          const activeSites = p.site.filter((s) => s.active).length;
          return (
            <li key={p.id}>
              <Link
                href={`/admin/partners/${p.id}`}
                className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-iris-soft ${p.active ? "" : "opacity-60"}`}
              >
                <span>
                  <span className="font-medium">{p.display_name}</span>
                  {!p.active && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">Retired</span>}
                  {p.legal_name !== p.display_name && (
                    <span className="block text-sm text-muted">{p.legal_name}</span>
                  )}
                </span>
                <span className="text-sm text-muted">
                  {activeSites} {activeSites === 1 ? "site" : "sites"}
                </span>
              </Link>
            </li>
          );
        })}
        {partners.length === 0 && !error && <li className="px-4 py-6 text-sm text-muted">No partners yet.</li>}
      </ul>

      <section className="mt-10 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Add a partner</h2>
        <div className="mt-5"><PartnerForm /></div>
      </section>
    </AppShell>
  );
}
