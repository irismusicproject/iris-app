import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Person } from "@/shared/domain/person";

export type Viewer =
  | { state: "signed_out" }
  // Signed in, but with no active Person record: never set up, or deactivated.
  // RLS hides a deactivated person's own row, so the two look the same here.
  | { state: "no_access"; email: string }
  | { state: "active"; person: Person; isAdmin: boolean };

/** Who is looking at this page, read through RLS with their own session. */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "signed_out" };

  const { data: person } = await supabase
    .from("person")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Person>();

  if (!person || !person.active) return { state: "no_access", email: user.email ?? "" };
  return { state: "active", person, isAdmin: person.system_roles.includes("admin") };
}

/** For pages: returns the active person, or sends everyone else somewhere sensible. */
export async function requirePerson() {
  const viewer = await getViewer();
  if (viewer.state === "signed_out") redirect("/login");
  if (viewer.state !== "active") redirect("/dashboard");
  return viewer;
}

/** For admin pages and actions. The database checks again with RLS. */
export async function requireAdmin() {
  const viewer = await requirePerson();
  if (!viewer.isAdmin) redirect("/dashboard");
  return viewer;
}
