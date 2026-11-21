import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuthCard } from "@/components/auth-card";
import { getViewer } from "@/lib/auth";

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
        Schedules, session notes and time will live here.
      </p>
      <ul className="mt-6 space-y-2 text-sm">
        {isAdmin && (
          <li>
            <Link href="/admin/people" className={link}>People</Link>: add, edit and deactivate staff and musicians
          </li>
        )}
        {isAdmin && (
          <li>
            <Link href="/admin/partners" className={link}>Partners</Link>: partners, their sites, and the rooms within them
          </li>
        )}
        <li>
          <Link href="/account/profile" className={link}>My profile</Link>: your phone number and instruments
        </li>
        <li>
          <Link href="/account/password" className={link}>Set or change your password</Link>
        </li>
      </ul>
    </AppShell>
  );
}
