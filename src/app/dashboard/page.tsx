import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Iris Music Project" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { password } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <form action="/auth/signout" method="post">
          <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-iris-soft">
            Log out
          </button>
        </form>
      </div>
      {password === "set" && (
        <p role="status" className="mt-6 rounded-lg bg-iris-soft p-3 text-sm">
          Your password is saved. Next time, log in with your email and password.
        </p>
      )}
      <p className="mt-4 text-muted">
        You&apos;re signed in as <span className="text-foreground">{user.email}</span>.
        Programs, rosters, and schedules will live here.
      </p>
      <p className="mt-6 text-sm">
        <Link
          href="/account/password"
          className="font-medium text-iris underline-offset-2 hover:underline"
        >
          Set or change your password
        </Link>
      </p>
    </main>
  );
}
