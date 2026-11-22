import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/shared/domain/person";
import { ChangeEmail } from "../change-email";
import { InviteButton } from "../invite-button";
import { MergePerson } from "../merge-person";
import { EditPersonForm } from "./edit-person-form";

export const metadata = { title: "Edit person · Iris Music Project" };

export default async function EditPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ merged?: string; note?: string }>;
}) {
  const viewer = await requireAdmin();
  const { id } = await params;
  const { merged, note } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("*").eq("id", id).maybeSingle<Person>();
  if (!person) notFound();
  // v0.32: admins change the email anytime; the screen says what happens if they've signed in.
  const { data: account } = await createAdminClient().auth.admin.getUserById(person.id);
  const signedIn = !!account?.user?.last_sign_in_at;
  // v0.33: any two people can be merged into one.
  const { data: others } = await supabase.from("person").select("id, name, email").neq("id", person.id).order("name");

  return (
    <AppShell isAdmin={viewer.isAdmin}>
      <Link href="/admin/people" className="text-sm text-muted hover:text-foreground">← People</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {person.name}
        {!person.active && <span className="ml-3 align-middle text-sm font-normal text-muted">Deactivated</span>}
      </h1>
      {merged && (
        <p role="status" className="mt-4 rounded-lg bg-iris-soft p-3 text-sm">Merged. Everything from the other record is now with {person.name}.{note ? ` Still to do: ${note}.` : ""}</p>
      )}
      {person.active && (
        <div className="mt-4">
          <InviteButton id={person.id} email={person.email} invitedAt={person.invited_at} />
        </div>
      )}
      {person.active && (
        <div className="mt-3">
          <ChangeEmail id={person.id} email={person.email} signedIn={signedIn} />
        </div>
      )}
      {person.active && (
        <div className="mt-3">
          <MergePerson id={person.id} name={person.name} email={person.email} others={(others ?? []).filter((o) => o.id !== viewer.person.id)} isSelf={person.id === viewer.person.id} />
        </div>
      )}
      <div className="mt-6">
        <EditPersonForm person={person} isSelf={person.id === viewer.person.id} />
      </div>
    </AppShell>
  );
}
