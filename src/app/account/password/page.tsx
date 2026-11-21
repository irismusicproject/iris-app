import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, linkClass } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Set your password · Iris Music Project" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { welcome } = await searchParams;

  return (
    <AuthCard
      title={welcome ? "Welcome to Iris" : "Set your password"}
      intro={
        welcome
          ? "Choose a password. You'll use it with your email to log in from now on."
          : `Choose a new password for ${user.email}.`
      }
      footer={
        welcome ? undefined : (
          <Link href="/dashboard" className={linkClass}>
            Cancel
          </Link>
        )
      }
    >
      <PasswordForm email={user.email ?? ""} />
    </AuthCard>
  );
}
