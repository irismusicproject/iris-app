import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CARE_LEVEL_LABELS, type Partner, type Site } from "@/shared/domain/place";
import { PartnerForm, SiteForm } from "../forms";

export const metadata = { title: "Partner · Iris Music Project" };

type SiteRow = Site & { location: { id: string; active: boolean }[] };

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: partner } = await supabase.from("partner").select("*").eq("id", id).maybeSingle<Partner>();
  if (!partner) notFound();
  const { data } = await supabase
    .from("site")
    .select("*, location(id, active)")
    .eq("partner_id", id)
    .order("active", { ascending: false })
    .order("name");
  const sites = (data ?? []) as SiteRow[];

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href="/admin/partners" className="text-sm text-muted hover:text-foreground">← Partners</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{partner.display_name}</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Sites</h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {sites.map((s) => {
            const rooms = s.location.filter((l) => l.active).length;
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/sites/${s.id}`}
                  className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-iris-soft ${s.active ? "" : "opacity-60"}`}
                >
                  <span>
                    <span className="font-medium">{s.name}</span>
                    {!s.active && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">Retired</span>}
                    <span className="block text-sm text-muted">
                      {s.care_levels.map((c) => CARE_LEVEL_LABELS[c]).join(", ") || "Care levels not set"}
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {[s.city, `${rooms} ${rooms === 1 ? "location" : "locations"}`].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            );
          })}
          {sites.length === 0 && <li className="px-4 py-6 text-sm text-muted">No sites yet. Add the first one below.</li>}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Add a site</h2>
        <p className="mt-1 text-sm text-muted">
          One site per building or campus. A partner with several buildings
          gets one site for each.
        </p>
        <div className="mt-5"><SiteForm partnerId={partner.id} /></div>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Partner details</h2>
        <div className="mt-5"><PartnerForm partner={partner} /></div>
      </section>
    </AppShell>
  );
}
