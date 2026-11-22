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
  // v0.29: admins can add someone without emailing them yet.
  const sendInvite = form.get("send_invite") === "on";

  const admin = createAdminClient();
  const { data: created, error: authError } = sendInvite
    ? await admin.auth.admin.inviteUserByEmail(p.email, { redirectTo: confirmUrl("/account/password?welcome=1") })
    : await admin.auth.admin.createUser({ email: p.email, email_confirm: true });
  if (authError || !created.user) {
    if (authError?.code === "email_exists" || authError?.status === 422) {
      return {
        status: "error",
        errors: { email: "That email already has a sign-in account. If they're missing from this list, ask Ryan to link it." },
      };
    }
    console.error(sendInvite ? "inviteUserByEmail failed:" : "createUser failed:", authError?.code, authError?.message);
    return { status: "error", message: sendInvite ? "We couldn't send the invite. Please try again." : "We couldn't add them. Please try again." };
  }

  // Insert with the admin's own session, so the database's RLS rules decide.
  const supabase = await createClient();
  const { error } = await supabase.from("person").insert({ id: created.user.id, ...p, invited_at: sendInvite ? new Date().toISOString() : null });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id); // undo the account
    console.error("insert person failed:", error.code, error.message);
    return { status: "error", message: dbMessage(error) };
  }

  revalidatePath("/admin/people");
  redirect(`/admin/people?${sendInvite ? "added" : "prepared"}=${encodeURIComponent(p.email)}`);
}

/**
 * Invite someone an admin added earlier without an invite (v0.29). Their
 * account already exists, so this sends the "set your password" email; they
 * can also sign in with "Email me a code instead".
 */
export async function sendInvite(id: string): Promise<PersonFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("email, active").eq("id", id).maybeSingle();
  if (!person?.active) return { status: "error", message: "Only active people can be invited." };
  const { error } = await supabase.auth.resetPasswordForEmail(person.email, { redirectTo: confirmUrl("/account/password?welcome=1") });
  if (error) {
    console.error("send invite failed:", error.code, error.message);
    return { status: "error", message: error.status === 429 ? "Too many emails just now. Try again in a minute." : "We couldn't send the invite. Please try again." };
  }
  await supabase.from("person").update({ invited_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
  return { status: "idle", message: `Invite sent to ${person.email}.` };
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
