import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthCard } from "@/components/auth-card";
import { TodoList, type Task } from "@/components/todo-list";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddLinkForm, RemoveLinkButton } from "./links-editor";

export const metadata = { title: "Home · Iris Music Project" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.state === "signed_out") redirect("/login");

  if (viewer.state === "no_access") {
    return (
      <AuthCard title="Your account isn't active">
        <p className="text-sm text-muted">
          You&apos;re signed in as <span className="text-foreground">{viewer.email}</span>,
          but there&apos;s no active Iris record for this email. Ask an Iris
          administrator to add or reactivate you.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-iris-soft">
            Log out
          </button>
        </form>
      </AuthCard>
    );
  }

  const { person, isAdmin } = viewer;
  const { password } = await searchParams;
  const link = "font-medium text-iris underline-offset-2 hover:underline";
  const supabase = await createClient();
  const [{ data: staff }, { data: links }, { data: tasks }] = await Promise.all([
    supabase.rpc("staff_directory"),
    supabase.from("resource_link").select("id, label, url").eq("active", true).order("sort_order").order("created_at"),
    supabase.rpc("my_tasks"),
  ]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const card = "mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6";

  return (
    <AppShell isAdmin={isAdmin}>
      {password === "set" && (
        <p role="status" className="mb-6 rounded-lg bg-iris-soft p-3 text-sm">
          Your password is saved. Next time, log in with your email and password.
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">
        Hi, {person.name.split(" ")[0]}
      </h1>
      <p className="mt-3 text-muted">
        Your Iris programs, documentation, hours and invoices.
      </p>
      <TodoList tasks={(tasks ?? []) as Task[]} today={today} />
      <ul className="mt-6 space-y-2 text-sm">
        <li>
          <Link href="/residencies" className={link}>Programs</Link>: {isAdmin ? "set up programs, seasons, rosters and point persons" : "the programs you're part of"}
        </li>
        <li>
          <Link href="/documentation" className={link}>My week</Link>: document programs and relationship building, and submit your week
        </li>
        <li>
          <Link href="/invoices" className={link}>My invoices</Link>: your invoice for each two-week pay period
        </li>
        <li>
          <Link href="/account/profile" className={link}>My profile</Link>: your phone number and instruments
        </li>
        <li>
          <Link href="/account/password" className={link}>Set or change your password</Link>
        </li>
      </ul>
      {isAdmin && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Admin</h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li>
              <Link href="/admin/people" className={link}>People</Link>: add, edit and deactivate staff and musicians
            </li>
            <li>
              <Link href="/admin/partners" className={link}>Partners</Link>: partners, their sites, and the rooms within them
            </li>
            <li>
              <Link href="/admin/invoices" className={link}>Invoices</Link>: custom invoices, and each program&apos;s community invoices
            </li>
            <li>
              <Link href="/admin/follow-up" className={link}>Follow-up</Link>: who still owes documentation or hours, across all programs
            </li>
            <li>
              <Link href="/admin/notifications" className={link}>Outbox</Link>: every reminder and notice the app sends
            </li>
            <li>
              <Link href="/admin/import" className={link}>Import</Link>: set up people, programs and schedules from a spreadsheet, without inviting anyone
            </li>
          </ul>
        </>
      )}

      <section className={card}>
        <h2 className="text-lg font-semibold">Photos and links</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {(links ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className={link}>{l.label}</a>
              {isAdmin && <RemoveLinkButton id={l.id} label={l.label} />}
            </li>
          ))}
          {(links ?? []).length === 0 && <li className="text-muted">No links yet.</li>}
        </ul>
        {isAdmin && <AddLinkForm />}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Iris staff</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {((staff ?? []) as { person_id: string; name: string; job_title: string | null; email: string; phone: string | null }[]).map((p) => (
            <li key={p.person_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <span>
                <span className="font-medium">{p.name}</span>
                {p.job_title && <span className="text-muted"> · {p.job_title}</span>}
              </span>
              <span className="flex flex-wrap gap-x-3">
                {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-iris hover:underline">{p.phone}</a>}
                <a href={`mailto:${p.email}`} className="text-iris hover:underline">{p.email}</a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
