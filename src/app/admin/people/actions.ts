"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/welcome-email";
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
  // v0.30: admins can add someone without emailing them yet.
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
 * Invite someone an admin added earlier without an invite (v0.30). Their
 * account already exists, so this sends the "set your password" email; they
 * can also sign in with "Email me a code instead".
 */
export async function sendInvite(id: string): Promise<PersonFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("email, name, active").eq("id", id).maybeSingle();
  if (!person?.active) return { status: "error", message: "Only active people can be invited." };
  // Welcome email with a "choose your password" link (lib/welcome-email.ts);
  // Supabase's reset email when the app has no email service configured.
  try {
    await sendWelcomeEmail({ email: person.email, name: person.name });
  } catch (e) {
    console.error("send invite failed:", e instanceof Error ? e.message : e);
    return { status: "error", message: "We couldn't send the invite. Please try again in a minute." };
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

/**
 * Change the sign-in email of someone who has never signed in (v0.32), e.g. a
 * typo before the invite goes out. The database refuses it once they've
 * signed in (person_guard_update). If an invite already went to the old
 * address, that link stops working and the person shows "Not invited yet".
 */
export async function changeEmail(id: string, rawEmail: string): Promise<PersonFormState> {
  await requireAdmin();
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "That isn't an email address." };

  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("email, invited_at").eq("id", id).maybeSingle();
  if (!person) return { status: "error", message: "That person wasn't found." };
  if (person.email === email) return { status: "idle", message: "That's already their email." };
  const { data: taken } = await supabase.from("person").select("id").eq("email", email).maybeSingle();
  if (taken) return { status: "error", message: "Someone else in the app already uses that email." };

  const admin = createAdminClient();
  const { data: account } = await admin.auth.admin.getUserById(id);
  if (!account?.user) return { status: "error", message: "Their sign-in account wasn't found. Ask Ryan." };
  if (account.user.last_sign_in_at) {
    return { status: "error", message: "They've already signed in, so their email can't be changed here. They can ask Ryan." };
  }

  // 1. The sign-in account.
  const { error: authError } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (authError) {
    console.error("change email (auth) failed:", authError.code, authError.message);
    return {
      status: "error",
      message: authError.code === "email_exists" ? "That email already has a sign-in account. Ask Ryan." : "We couldn't change it. Please try again.",
    };
  }
  // 2. The person record (server key; the database checks they've never signed in).
  const { error } = await admin.from("person").update({ email, invited_at: null }).eq("id", id);
  if (error) {
    await admin.auth.admin.updateUserById(id, { email: person.email, email_confirm: true }); // undo step 1
    console.error("change email (person) failed:", error.code, error.message);
    return { status: "error", message: error.code === "42501" ? "They've already signed in, so their email can't be changed here." : dbMessage(error) };
  }
  // 3. A link already sent to the old address stops working: making a new
  //    one (not sent anywhere) replaces the old one.
  if (person.invited_at) await admin.auth.admin.generateLink({ type: "recovery", email });

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
  return { status: "idle", message: `Email changed to ${email}.${person.invited_at ? " The earlier invite no longer works; send a new one." : ""}` };
}
