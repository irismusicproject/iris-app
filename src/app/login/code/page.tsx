import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, linkClass } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/server";
import { CodeForm } from "./code-form";

export const metadata = { title: "Log in with a code · Iris Music Project" };

export default async function CodeLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <AuthCard
      title="Log in with a code"
      intro="We'll email you a one-time code. After you're in, you can set a password from your dashboard."
      footer={
        <Link href="/login" className={linkClass}>
          Log in with a password instead
        </Link>
      }
    >
      <CodeForm />
    </AuthCard>
  );
}
