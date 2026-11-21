import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Iris Music Project" };

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <form action="/auth/signout" method="post">
          <button className="rounded-full border border-border px-4 py-2 text-sm hover:bg-iris-soft">
            Log out
          </button>
        </form>
      </div>
      <p className="mt-4 text-muted">
        You&apos;re signed in as <span className="text-foreground">{user.email}</span>.
        Programs, rosters, and schedules will live here.
      </p>
    </main>
  );
}
