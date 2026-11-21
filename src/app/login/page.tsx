import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Iris Music Project" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Iris Music Project
        </Link>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
          <p className="mt-2 text-sm text-muted">
            For Iris staff and volunteers. We&apos;ll email you a link, so you
            don&apos;t need a password.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              That sign-in link was invalid or expired. Request a new one.
            </p>
          )}
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Need access? Ask an Iris administrator to add your email.
        </p>
      </div>
    </main>
  );
}
