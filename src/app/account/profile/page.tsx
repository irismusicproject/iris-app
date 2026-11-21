import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requirePerson } from "@/lib/auth";
import { EMPLOYMENT_TYPE_LABELS } from "@/shared/domain/person";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "My profile · Iris Music Project" };

export default async function ProfilePage() {
  const { person, isAdmin } = await requirePerson();
  return (
    <AppShell isAdmin={isAdmin}>
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Name</dt><dd>{person.name}</dd>
        <dt className="text-muted">Email</dt><dd className="break-all">{person.email}</dd>
        {person.job_title && (<><dt className="text-muted">Title</dt><dd>{person.job_title}</dd></>)}
        <dt className="text-muted">Type</dt><dd>{EMPLOYMENT_TYPE_LABELS[person.employment_type]}</dd>
      </dl>
      <p className="mt-3 max-w-md text-xs text-muted">
        To change your name, email or title, ask an Iris administrator.
      </p>
      <div className="mt-8">
        <ProfileForm person={person} />
      </div>
      <p className="mt-8 text-sm">
        <Link href="/account/password" className="font-medium text-iris underline-offset-2 hover:underline">
          Set or change your password
        </Link>
      </p>
    </AppShell>
  );
}
