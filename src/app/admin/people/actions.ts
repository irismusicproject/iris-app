"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/welcome-email";
import { createClient } from "@/lib/supabase/server";
import { confirmUrl, siteUrl } from "@/lib/site-url";
import { canSendEmail, sendEmail } from "@/lib/notify";
import { isEmail, normalizeEmail } from "@/shared/domain/email";
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
 * Change someone's sign-in email (v0.32): a typo from the import, or a new
 * address they asked for. The new address is typed twice. If they've already
 * signed in, their password stays and a notice goes to the old and new
 * address. A link already sent to the old address stops working.
 */
export async function changeEmail(id: string, rawEmail: string, rawConfirm: string): Promise<PersonFormState> {
  await requireAdmin();
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) return { status: "error", message: "That isn't an email address." };
  if (normalizeEmail(rawConfirm) !== email) return { status: "error", message: "The two emails don't match. Type it again in both boxes." };

  const supabase = await createClient();
  const { data: person } = await supabase.from("person").select("email, name, invited_at").eq("id", id).maybeSingle();
  if (!person) return { status: "error", message: "That person wasn't found." };
  if (person.email === email) return { status: "idle", message: "That's already their email." };
  const { data: taken } = await supabase.from("person").select("id").eq("email", email).maybeSingle();
  if (taken) return { status: "error", message: "Someone else in the app already uses that email. If it's the same person, use Merge instead." };

  const admin = createAdminClient();
  const { data: account } = await admin.auth.admin.getUserById(id);
  if (!account?.user) return { status: "error", message: "Their sign-in account wasn't found. Ask Ryan." };
  const signedInBefore = !!account.user.last_sign_in_at;

  // 1. The sign-in account.
  const { error: authError } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
  if (authError) {
    console.error("change email (auth) failed:", authError.code, authError.message);
    return {
      status: "error",
      message: authError.code === "email_exists" ? "That email already has a sign-in account. Ask Ryan." : "We couldn't change it. Please try again.",
    };
  }
  // 2. The person record (server key; the database refuses email changes from the browser).
  //    Someone not yet signed in shows "Not invited yet" again, so the invite goes to the new address.
  const { error } = await admin.from("person").update(signedInBefore ? { email } : { email, invited_at: null }).eq("id", id);
  if (error) {
    await admin.auth.admin.updateUserById(id, { email: person.email, email_confirm: true }); // undo step 1
    console.error("change email (person) failed:", error.code, error.message);
    return { status: "error", message: dbMessage(error) };
  }
  // 3. A link already sent to the old address stops working: making a new
  //    one (not sent anywhere) replaces the old one.
  await admin.auth.admin.generateLink({ type: "recovery", email });
  // 4. Someone who already uses the app hears about it at both addresses.
  if (signedInBefore && canSendEmail()) {
    const first = person.name.trim().split(/\s+/)[0] || "there";
    const text =
      `Hi ${first},\n\nThe email you use to sign in to the Iris Music Project app was changed by an Iris admin ` +
      `from ${person.email} to ${email}. Your password hasn't changed.\n\n` +
      `If you didn't ask for this, please reply to Iris staff right away.\n`;
    for (const to of [person.email, email]) {
      try {
        await sendEmail({ to, subject: "Your Iris app sign-in email was changed", text });
      } catch (e) {
        console.error("email change notice failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  revalidatePath("/admin/people");
  revalidatePath(`/admin/people/${id}`);
  return {
    status: "idle",
    message: signedInBefore
      ? `Email changed to ${email}. They sign in with it from now on, with the same password${canSendEmail() ? "; a notice went to both addresses" : ""}.`
      : `Email changed to ${email}.${person.invited_at ? " The earlier invite no longer works; send a new one." : ""}`,
  };
}

/**
 * Merge two people into one (v0.33): everything from `fromId` moves to
 * `intoId` (the database checks and moves it all), then `fromId`'s sign-in
 * account is deleted. The kept person signs in with the email the admin picks.
 * If either had signed in, both old passwords stop working and the kept person
 * is emailed a link to set a new one.
 */
export async function mergePerson(fromId: string, intoId: string, keepEmailOf: "from" | "into"): Promise<PersonFormState> {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data: people } = await supabase.from("person").select("id, name, email").in("id", [fromId, intoId]);
  const from = people?.find((p) => p.id === fromId);
  const into = people?.find((p) => p.id === intoId);
  if (!from || !into) return { status: "error", message: "Choose the person to merge in." };

  const admin = createAdminClient();
  const [{ data: fromAcct }, { data: intoAcct }] = await Promise.all([admin.auth.admin.getUserById(fromId), admin.auth.admin.getUserById(intoId)]);
  const email = keepEmailOf === "from" ? from.email : into.email;
  const eitherSignedIn = !!fromAcct?.user?.last_sign_in_at || !!intoAcct?.user?.last_sign_in_at;

  // 1. The data (all or nothing, in the database).
  const { error } = await supabase.rpc("merge_person", { p_from: fromId, p_into: intoId, p_end_sessions: eitherSignedIn });
  if (error) {
    console.error("merge_person failed:", error.code, error.message);
    const friendly = ["42501", "22023", "23514"].includes(error.code ?? "");
    return { status: "error", message: friendly ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` : "We couldn't merge them. Please try again." };
  }
  // 2. The merged-away sign-in account (frees its email).
  const { error: delError } = await admin.auth.admin.deleteUser(fromId);
  if (delError) console.error("merge: delete sign-in account failed:", delError.code, delError.message);

  const problems: string[] = [];
  // 3. The email to keep.
  if (email !== into.email) {
    const { error: e1 } = await admin.auth.admin.updateUserById(intoId, { email, email_confirm: true });
    const { error: e2 } = e1 ? { error: e1 } : await admin.from("person").update({ email }).eq("id", intoId);
    if (e1 || e2) {
      console.error("merge: set email failed:", (e1 ?? e2)?.message);
      problems.push(`their email is still ${into.email}; use Change email to set ${email}`);
    }
  }
  // 4. If either had signed in: new password for the kept account, and a link to set it.
  if (eitherSignedIn) {
    const { error: pwError } = await admin.auth.admin.updateUserById(intoId, { password: crypto.randomUUID() + crypto.randomUUID() });
    if (pwError) console.error("merge: password reset failed:", pwError.message);
    try {
      await sendPasswordAfterMerge({ email, name: into.name });
      await admin.from("person").update({ invited_at: new Date().toISOString() }).eq("id", intoId);
    } catch (e) {
      console.error("merge: new-password email failed:", e instanceof Error ? e.message : e);
      problems.push("the email to set a new password didn't go out; use Send the invite again");
    }
  }

  revalidatePath("/admin/people");
  if (intoId === viewer.person.id && eitherSignedIn) redirect("/login?merged=1");
  redirect(`/admin/people/${intoId}?merged=1${problems.length ? `&note=${encodeURIComponent(problems.join("; "))}` : ""}`);
}

/** "Set a new password" after a merge: welcome-style link, or Supabase's reset email without an email service. */
async function sendPasswordAfterMerge(person: { email: string; name: string }) {
  const admin = createAdminClient();
  const next = "/account/password";
  if (!canSendEmail()) {
    const { error } = await admin.auth.resetPasswordForEmail(person.email, { redirectTo: confirmUrl(next) });
    if (error) throw new Error(error.message);
    return;
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: person.email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(error?.message ?? "no link returned");
  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=${encodeURIComponent(next)}`;
  const first = person.name.trim().split(/\s+/)[0] || "there";
  await sendEmail({
    to: person.email,
    subject: "Set a new password for the Iris app",
    text:
      `Hi ${first},\n\nAn Iris admin combined your two Iris app accounts into one. You now sign in with ${person.email}.\n\n` +
      `Please choose a new password here (the link works once):\n${link}\n\n` +
      `If you didn't expect this, please reply to Iris staff right away.\n`,
  });
}
