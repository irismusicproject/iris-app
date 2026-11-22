import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/shared/domain/person";
import { ChangeEmail } from "../change-email";
import { InviteButton } from "../invite-button";
import { EditPersonForm } from "./edit-person-form";

export const metadata = { title: "Edit person · Iris Music Project" };

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("*").eq("id", id).maybeSingle<Person>();
  if (!person) notFound();
  // v0.32: the email can be changed only before they've ever signed in.
  const { data: account } = await createAdminClient().auth.admin.getUserById(person.id);
  const neverSignedIn = !!account?.user && !account.user.last_sign_in_at;

  return (
    <AppShell isAdmin={viewer.isAdmin}>
      <Link href="/admin/people" className="text-sm text-muted hover:text-foreground">← People</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {person.name}
        {!person.active && <span className="ml-3 align-middle text-sm font-normal text-muted">Deactivated</span>}
      </h1>
      {person.active && (
        <div className="mt-4">
          <InviteButton id={person.id} email={person.email} invitedAt={person.invited_at} />
        </div>
      )}
      {person.active && neverSignedIn && (
        <div className="mt-3">
          <ChangeEmail id={person.id} email={person.email} />
        </div>
      )}
      <div className="mt-6">
        <EditPersonForm person={person} isSelf={person.id === viewer.person.id} />
      </div>
    </AppShell>
  );
}
