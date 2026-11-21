import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

  // While the structure is provisional, rooms can move between this partner's
  // sites, and the site can move to another partner.
  const [{ data: siblings }, { data: partners }] = await Promise.all([
    supabase.from("site").select("id, name, active").eq("partner_id", site.partner_id).order("name"),
    supabase.from("partner").select("id, display_name, active").order("display_name"),
  ]);
  const siteOptions = (siblings ?? [])
    .filter((s) => s.active || s.id === site.id)
    .map((s) => ({ id: s.id as string, label: s.name as string }));
  const partnerOptions = (partners ?? [])
    .filter((p) => p.active || p.id === site.partner_id)
    .map((p) => ({ id: p.id as string, label: p.display_name as string }));

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
          {locations.map((l) => <LocationRow key={l.id} location={l} sites={siteOptions} />)}
          {locations.length === 0 && <p className="px-4 py-6 text-sm text-muted">No locations yet.</p>}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <AddLocationForm siteId={site.id} />
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Site details</h2>
        <div className="mt-5"><SiteForm partnerId={site.partner_id} site={site} partners={partnerOptions} /></div>
      </section>
    </AppShell>
  );
}
