import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, linkClass } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Iris Music Project" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error, reset } = await searchParams;

  return (
    <AuthCard
      title="Log in"
      intro="For Iris staff and musicians."
      footer={
        <>
          No password yet, or rather not type it?{" "}
          <Link href="/login/code" className={linkClass}>
            Email me a code instead
          </Link>
          <p className="mt-3 text-xs">
            Need access? Ask an Iris administrator to add your email.
          </p>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          That link was invalid or expired. Log in below, or ask for a new link.
        </p>
      )}
      {reset && (
        <p role="status" className="mb-4 rounded-lg bg-iris-soft p-3 text-sm">
          Your password is set. Log in with it below.
        </p>
      )}
      <LoginForm />
    </AuthCard>
  );
}
