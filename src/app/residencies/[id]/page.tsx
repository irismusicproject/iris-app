import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { getResidencyAccess, getResidencyNames } from "@/lib/residency-access";
import { createClient } from "@/lib/supabase/server";
import {
  RESIDENCY_STATUS_LABELS,
  SEASON_KIND_LABELS,
  STAFF_ROLE_LABELS,
  type Residency,
  type RosterMember,
  type Season,
  type StaffAssignment,
} from "@/shared/domain/scheduling";
import {
  AddRosterMemberForm,
  AddSeasonForm,
  AddSiteForm,
  AddStaffForm,
  DailyNotesDownload,
  EndStaffButton,
  PayEditor,
  type PayContract,
  ResidencyForm,
  RosterMemberActions,
  SiteContacts,
  SiteDetailedNotesToggle,
  type SiteContact,
} from "../forms";
import { todayIn } from "@/shared/domain/time";

export const metadata = { title: "Program · Iris Music Project" };

type SeasonRow = Season & { roster_member: RosterMember[] };
type StaffRow = StaffAssignment;

const fmt = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function ResidencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { isAdmin } = await requirePerson();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: residency } = await supabase
    .from("residency")
    .select("*, partner(display_name)")
    .eq("id", id)
    .maybeSingle<Residency & { partner: { display_name: string } | null }>();
  if (!residency) notFound();

  const today = todayIn();
  const [names, access] = await Promise.all([getResidencyNames(id), getResidencyAccess(id, isAdmin)]);
  const nameOf = (pid: string) => names.get(pid) ?? "Someone";
  const [{ data: siteRows }, { data: seasonRows }, { data: staffRows }] = await Promise.all([
    supabase.from("residency_site").select("site(id, display_name, city, detailed_relationship_notes)").eq("residency_id", id),
    supabase
      .from("season")
      .select("*, roster_member(*)")
      .eq("residency_id", id)
      .order("starts_on", { ascending: false }),
    supabase
      .from("staff_assignment")
      .select("*")
      .eq("residency_id", id)
      .order("starts_on", { ascending: false }),
  ]);
  const sites = (siteRows ?? []).map((r) => r.site as unknown as { id: string; display_name: string; city: string | null; detailed_relationship_notes: boolean }).filter(Boolean);
  const seasons = (seasonRows ?? []) as SeasonRow[];
  const staff = ((staffRows ?? []) as StaffRow[]).filter((s) => !s.ends_on || s.ends_on > today);

  // Admin-only pick lists.
  let otherSites: { id: string; label: string }[] = [];
  let people: { id: string; name: string; isAdmin: boolean; contractor: boolean }[] = [];
  if (isAdmin) {
    const [{ data: ps }, { data: pp }] = await Promise.all([
      supabase.from("site").select("id, display_name").eq("partner_id", residency.partner_id).eq("active", true).order("display_name"),
      supabase.from("person").select("id, name, system_roles, employment_type").eq("active", true).order("name"),
    ]);
    otherSites = (ps ?? []).filter((s) => !sites.some((x) => x.id === s.id)).map((s) => ({ id: s.id, label: s.display_name }));
    people = (pp ?? []).map((p) => ({ id: p.id, name: p.name, isAdmin: (p.system_roles as string[]).includes("admin"), contractor: p.employment_type === "contractor_1099" }));
  }
  // Pay (admins only; RLS also hides other people's contracts).
  const contracts = new Map<string, PayContract>();
  if (isAdmin && seasons.length) {
    const { data: cs } = await supabase
      .from("contract")
      .select("id, person_id, season_id, hourly_rate, stipend_installment(id, kind, due_on, amount)")
      .in("season_id", seasons.map((s) => s.id));
    for (const c of cs ?? []) contracts.set(`${c.season_id}:${c.person_id}`, c as unknown as PayContract);
  }

  // Community contacts per building, and Iris staff phone and email (v0.26).
  const [{ data: contactRows }, { data: staffDir }, { data: rosterContactRows }] = await Promise.all([
    sites.length
      ? supabase.from("partner_contact_site").select("site_id, partner_contact(id, name, title, email, phone, active)").in("site_id", sites.map((x) => x.id))
      : Promise.resolve({ data: [] }),
    supabase.rpc("staff_directory"),
    // Roster musicians' phone and instruments, for the program's people (v0.27).
    supabase.rpc("residency_roster_contacts", { p_residency: id }),
  ]);
  const rosterInfo = new Map(((rosterContactRows ?? []) as { person_id: string; phone: string | null; instruments: string[] }[]).map((r) => [r.person_id, r]));
  const contactsBySite = new Map<string, SiteContact[]>();
  for (const r of (contactRows ?? []) as unknown as { site_id: string; partner_contact: (SiteContact & { active: boolean }) | null }[]) {
    if (!r.partner_contact?.active) continue;
    const c: SiteContact = { id: r.partner_contact.id, name: r.partner_contact.name, title: r.partner_contact.title, email: r.partner_contact.email, phone: r.partner_contact.phone };
    contactsBySite.set(r.site_id, [...(contactsBySite.get(r.site_id) ?? []), c].sort((a, b) => a.name.localeCompare(b.name)));
  }
  const staffInfo = new Map(((staffDir ?? []) as { person_id: string; email: string; phone: string | null }[]).map((d) => [d.person_id, d]));

  const card = "mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6";
  const badge = "ml-2 rounded-full border border-border px-2 py-0.5 text-xs";

  return (
    <AppShell isAdmin={isAdmin}>
      <Link href="/residencies" className="text-sm text-muted hover:text-foreground">← Programs</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{residency.name}</h1>
      <p className="mt-1 text-muted">
        {residency.partner?.display_name} · {RESIDENCY_STATUS_LABELS[residency.status]}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/residencies/${id}/month`} className="rounded-full bg-iris px-4 py-2 font-medium text-white hover:bg-iris-strong dark:text-background">Site Details</Link>
        <Link href={`/residencies/${id}/season`} className="rounded-full border border-border px-4 py-2 hover:bg-iris-soft">Season</Link>
        {access.isPointPerson && (
          <Link href={`/residencies/${id}/hours`} className="rounded-full border border-border px-4 py-2 hover:bg-iris-soft">Hours to approve</Link>
        )}
        {(access.isPointPerson || isAdmin) && (
          <Link href={`/residencies/${id}/follow-up`} className="rounded-full border border-border px-4 py-2 hover:bg-iris-soft">Follow-up</Link>
        )}
        {isAdmin && (
          <Link href={`/residencies/${id}/billing`} className="rounded-full border border-border px-4 py-2 hover:bg-iris-soft">Community invoices</Link>
        )}
      </div>

      <section className={card}>
        <h2 className="text-lg font-semibold">Sites</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {sites.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 py-1">
              <span className="font-medium">{s.display_name}{s.city ? <span className="font-normal text-muted"> · {s.city}</span> : null}</span>
              <SiteContacts residencyId={id} siteId={s.id} contacts={contactsBySite.get(s.id) ?? []} canEdit={access.canSchedule} />
              {isAdmin && <SiteDetailedNotesToggle residencyId={id} siteId={s.id} on={s.detailed_relationship_notes} />}
              {s.detailed_relationship_notes && (isAdmin || access.isPointPerson) && (
                <DailyNotesDownload siteId={s.id} siteName={s.display_name} defaultDate={today} />
              )}
            </li>
          ))}
          {sites.length === 0 && <li className="text-muted">No sites yet.</li>}
        </ul>
        {isAdmin && <div className="mt-4"><AddSiteForm residencyId={id} sites={otherSites} /></div>}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Iris staff</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {nameOf(s.person_id)}
                <span className={badge}>{STAFF_ROLE_LABELS[s.role]}</span>
                {staffInfo.get(s.person_id)?.phone && (
                  <a href={`tel:${staffInfo.get(s.person_id)!.phone!.replace(/[^\d+]/g, "")}`} className="ml-2 text-iris hover:underline">{staffInfo.get(s.person_id)!.phone}</a>
                )}
                {staffInfo.get(s.person_id)?.email && (
                  <a href={`mailto:${staffInfo.get(s.person_id)!.email}`} className="ml-2 text-iris hover:underline">{staffInfo.get(s.person_id)!.email}</a>
                )}
              </span>
              {isAdmin && <EndStaffButton residencyId={id} assignmentId={s.id} name={nameOf(s.person_id)} />}
            </li>
          ))}
          {staff.length === 0 && <li className="py-2 text-muted">No Iris Supervisor yet.</li>}
        </ul>
        {isAdmin && (
          <div className="mt-4">
            <AddStaffForm
              residencyId={id}
              people={people.filter((p) => p.isAdmin).map((p) => ({ id: p.id, label: p.name }))}
            />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Seasons and rosters</h2>
        {seasons.length === 0 && <p className="mt-3 text-sm text-muted">No seasons yet.</p>}
        {seasons.map((s) => {
          const ended = s.ends_on < today;
          const members = s.roster_member
            .filter((m) => !m.left_on || m.left_on > today)
            .sort((a, b) => Number(b.is_admin_lead) - Number(a.is_admin_lead) || Number(b.is_core) - Number(a.is_core) || (nameOf(a.person_id)).localeCompare(nameOf(b.person_id)));
          return (
            <div key={s.id} className={`mt-5 ${ended ? "opacity-60" : ""}`}>
              <h3 className="font-medium">
                {s.name}
                <span className={badge}>{SEASON_KIND_LABELS[s.kind]}</span>
              </h3>
              <p className="text-sm text-muted">{fmt(s.starts_on)} – {fmt(s.ends_on)}</p>
              <ul className="mt-2 divide-y divide-border text-sm">
                {members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{nameOf(m.person_id)}</span>
                      {m.is_admin_lead && <span className={badge}>Lead Musician</span>}
                      {!m.is_core && <span className={badge}>Occasional / sub</span>}
                      {(rosterInfo.get(m.person_id)?.instruments.length || rosterInfo.get(m.person_id)?.phone) && (
                        <span className="mt-0.5 block text-xs text-muted">
                          {rosterInfo.get(m.person_id)!.instruments.join(", ")}
                          {rosterInfo.get(m.person_id)!.instruments.length > 0 && rosterInfo.get(m.person_id)!.phone ? " · " : ""}
                          {rosterInfo.get(m.person_id)!.phone && (
                            <a href={`tel:${rosterInfo.get(m.person_id)!.phone!.replace(/[^\d+]/g, "")}`} className="text-iris hover:underline">
                              {rosterInfo.get(m.person_id)!.phone}
                            </a>
                          )}
                        </span>
                      )}
                    </span>
                    {isAdmin && !ended && (
                      <RosterMemberActions
                        residencyId={id}
                        memberId={m.id}
                        name={nameOf(m.person_id)}
                        isCore={m.is_core}
                        isAdminLead={m.is_admin_lead}
                      />
                    )}
                    {isAdmin && people.find((p) => p.id === m.person_id)?.contractor && (
                      <PayEditor
                        residencyId={id}
                        seasonId={s.id}
                        personId={m.person_id}
                        name={nameOf(m.person_id)}
                        contract={contracts.get(`${s.id}:${m.person_id}`) ?? null}
                      />
                    )}
                  </li>
                ))}
                {members.length === 0 && <li className="py-2 text-muted">No one on this roster yet.</li>}
              </ul>
              {isAdmin && !ended && (
                <div className="mt-3">
                  <AddRosterMemberForm
                    residencyId={id}
                    seasonId={s.id}
                    people={people
                      .filter((p) => !s.roster_member.some((m) => m.person_id === p.id && (!m.left_on || m.left_on > today)))
                      .map((p) => ({ id: p.id, label: p.name }))}
                  />
                </div>
              )}
            </div>
          );
        })}
        {isAdmin && (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-medium">Add a season</h3>
            <div className="mt-3"><AddSeasonForm residencyId={id} /></div>
          </div>
        )}
      </section>

      {isAdmin && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Program details</h2>
          <div className="mt-5"><ResidencyForm key={JSON.stringify(residency)} residency={residency} /></div>
        </section>
      )}
    </AppShell>
  );
}
