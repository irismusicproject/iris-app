"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { confirmUrl } from "@/lib/site-url";
import { validateAdminEdit, validateNewPerson } from "@/shared/domain/person";

export type PersonFormState = {
  status: "idle" | "error";
  message?: string;
  errors?: Record<string, string>;
};

// About 100 years: Supabase's way of saying "blocked until unblocked".
const BLOCKED = "876000h";

function dbMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501") {
    if (error.message.includes("own admin role")) {
      return "You can't remove your own admin role or deactivate yourself. Ask another admin.";
    }
    return "You don't have permission to make that change.";
  }
  if (error.code === "23505") return "Someone with that email is already in the app.";
  return "We couldn't save that. Please try again.";
}

export async function addPerson(_prev: PersonFormState, form: FormData): Promise<PersonFormState> {
  await requireAdmin();
  const parsed = validateNewPerson(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const p = parsed.value;

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(p.email, {
    redirectTo: confirmUrl("/account/password?welcome=1"),
  });
  if (inviteError || !invited.user) {
    if (inviteError?.code === "email_exists" || inviteError?.status === 422) {
      return {
        status: "error",
        errors: { email: "That email already has a sign-in account. If they're missing from this list, ask Ryan to link it." },
      };
    }
    console.error("inviteUserByEmail failed:", inviteError?.code, inviteError?.message);
    return { status: "error", message: "We couldn't send the invite. Please try again." };
  }

  // Insert with the admin's own session, so the database's RLS rules decide.
  const supabase = await createClient();
  const { error } = await supabase.from("person").insert({ id: invited.user.id, ...p });
  if (error) {
    await admin.auth.admin.deleteUser(invited.user.id); // undo the invite
    console.error("insert person failed:", error.code, error.message);
    return { status: "error", message: dbMessage(error) };
  }

  revalidatePath("/admin/people");
  redirect(`/admin/people?added=${encodeURIComponent(p.email)}`);
}

export async function updatePerson(
  id: string,
  _prev: PersonFormState,
  form: FormData,
): Promise<PersonFormState> {
  await requireAdmin();
  const parsed = validateAdminEdit(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("person")
    .update(parsed.value, { count: "exact" })
    .eq("id", id);
  if (error || count === 0) {
    if (error) console.error("update person failed:", error.code, error.message);
    return { status: "error", message: error ? dbMessage(error) : "That person wasn't found." };
  }

  revalidatePath("/admin/people");
  redirect(`/admin/people?saved=${id}`);
}

export async function setActive(
  id: string,
  active: boolean,
): Promise<PersonFormState> {
  await requireAdmin();

  // 1. The database record. RLS makes a deactivated person's data unreadable at once.
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("person")
    .update({ active }, { count: "exact" })
    .eq("id", id);
  if (error || count === 0) {
    if (error) console.error("setActive failed:", error.code, error.message);
    return { status: "error", message: error ? dbMessage(error) : "That person wasn't found." };
  }

  // 2. Sign-in itself: block (or unblock) the account so it can't log in or refresh.
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : BLOCKED,
  });
  if (banError) {
    console.error("ban update failed:", banError.code, banError.message);
    return {
      status: "error",
      message: active
        ? "Reactivated in the app, but their sign-in is still blocked. Try again."
        : "Deactivated: they can no longer see anything. But blocking their sign-in failed, so try again.",
    };
  }

  revalidatePath("/admin/people");
  redirect(`/admin/people?${active ? "reactivated" : "deactivated"}=${id}`);
}
