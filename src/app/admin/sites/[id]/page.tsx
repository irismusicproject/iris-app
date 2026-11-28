import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/shared/domain/time";
import { CollaborationTarget } from "../../../residencies/[id]/month/collaboration-target";
import type { Location, Partner, Site } from "@/shared/domain/place";
import { AddLocationForm, LocationRow, SiteForm } from "../../partners/forms";

export const metadata = { title: "Site · Iris Music Project" };

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("site")
    .select("*, partner(id, display_name)")
    .eq("id", id)
    .maybeSingle<Site & { partner: Pick<Partner, "id" | "display_name"> }>();
  if (!site) notFound();
  const { data } = await supabase
    .from("location")
    .select("*")
    .eq("site_id", id)
    .order("active", { ascending: false })
    .order("name");
  const locations = (data ?? []) as Location[];
  // Programs at this site, for their seasons' Collaboration targets (D20).
  const { data: progRows } = await supabase.from("residency_site").select("residency(id, name)").eq("site_id", id);
  const programs = ((progRows ?? []) as unknown as { residency: { id: string; name: string } | null }[])
    .map((r) => r.residency!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = new Map(await Promise.all(programs.map(async (p) => [p.id, await getResidencyNames(p.id)] as const)));
  const month = todayIn(site.timezone).slice(0, 7);

  return (
    <AppShell isAdmin={isAdmin}>
      <nav className="text-sm text-muted">
        <Link href="/admin/partners" className="hover:text-foreground">Partners</Link>
        {" / "}
        <Link href={`/admin/partners/${site.partner.id}`} className="hover:text-foreground">
          {site.partner.display_name}
        </Link>
      </nav>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{site.name}</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Locations</h2>
        <p className="mt-1 text-sm text-muted">Rooms, units or areas within this site.</p>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {locations.map((l) => <LocationRow key={l.id} location={l} />)}
          {locations.length === 0 && <p className="px-4 py-6 text-sm text-muted">No locations yet.</p>}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <AddLocationForm siteId={site.id} />
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Site details</h2>
        <div className="mt-5"><SiteForm partnerId={site.partner_id} site={site} /></div>
      </section>

      {programs.map((p) => (
        <CollaborationTarget key={p.id} residencyId={p.id} month={month} canSchedule names={names.get(p.id)!} programName={p.name} />
      ))}
    </AppShell>
  );
}
