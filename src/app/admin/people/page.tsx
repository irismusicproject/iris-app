import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYMENT_TYPE_LABELS, type Person } from "@/shared/domain/person";
import { AddPersonForm } from "./add-person-form";

export const metadata = { title: "People · Iris Music Project" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { isAdmin } = await requireAdmin();
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  const people = (data ?? []) as Person[];
  const nameOf = (id?: string) => people.find((p) => p.id === id)?.name ?? "That person";

  const notice = params.added
    ? `Invite sent to ${params.added}.`
    : params.saved
      ? `${nameOf(params.saved)}'s changes are saved.`
      : params.deactivated
        ? `${nameOf(params.deactivated)} is deactivated and can no longer log in.`
        : params.reactivated
          ? `${nameOf(params.reactivated)} is active again and can log in.`
          : null;

  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>
      {notice && (
        <p role="status" className="mt-4 rounded-lg bg-iris-soft p-3 text-sm">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t load people. Refresh to try again.
        </p>
      )}

      <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {people.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/people/${p.id}`}
              className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-iris-soft ${p.active ? "" : "opacity-60"}`}
            >
              <span>
                <span className="font-medium">{p.name}</span>
                {p.system_roles.includes("admin") && (
                  <span className="ml-2 rounded-full bg-iris-soft px-2 py-0.5 text-xs text-iris">Admin</span>
                )}
                {!p.active && (
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">Deactivated</span>
                )}
                <span className="block text-sm text-muted break-all">{p.email}</span>
              </span>
              <span className="text-sm text-muted">
                {[p.job_title, EMPLOYMENT_TYPE_LABELS[p.employment_type]].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
        {people.length === 0 && !error && (
          <li className="px-4 py-6 text-sm text-muted">No one yet.</li>
        )}
      </ul>

      <section className="mt-10 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Add a person</h2>
        <p className="mt-1 text-sm text-muted">
          They&apos;ll get an email invite, choose a password, and land on their home page.
        </p>
        <div className="mt-5">
          <AddPersonForm />
        </div>
      </section>
    </AppShell>
  );
}
