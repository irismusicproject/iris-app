import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canSendEmail, sendEmail } from "@/lib/notify";
import { siteUrl } from "@/lib/site-url";

// The first email a pre-added person gets (PR #56: people added without an
// invite, invited later). Supabase's own invite can't be used for someone who
// already has an account, and its password-reset email reads "Reset your
// password", which is confusing as someone's first message from Iris. So the
// app asks Supabase for a one-time "set your password" link and sends its own
// welcome wording through Resend. The link works like the reset link: it goes
// to /auth/confirm, which signs the person in and opens the password page.
//
// Call only from server code that has already checked the caller is an admin
// (requireAdmin): it uses the Supabase secret key.
//
// Wording is a draft for Lauren to adjust.

export type WelcomeResult = "welcome_email" | "reset_email";

export async function sendWelcomeEmail(person: { email: string; name: string }): Promise<WelcomeResult> {
  const admin = createAdminClient();
  const next = "/account/password?welcome=1";

  // No email service in this environment (e.g. production before a Resend key
  // is added to Vercel): fall back to Supabase's reset email, which always works.
  if (!canSendEmail()) {
    const { error } = await admin.auth.resetPasswordForEmail(person.email, {
      redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    });
    if (error) throw new Error(`reset email: ${error.message}`);
    return "reset_email";
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: person.email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(`welcome link: ${error?.message ?? "no link returned"}`);

  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(token)}&type=recovery&next=${encodeURIComponent(next)}`;
  const first = person.name.trim().split(/\s+/)[0] || "there";
  await sendEmail({
    to: person.email,
    subject: "Welcome to the Iris Music Project app",
    text:
      `Hi ${first},\n\n` +
      "Your account in the Iris Music Project app is ready. It's where you'll see your schedule, " +
      "document your programs and submit your hours.\n\n" +
      `Choose your password here (the link works once):\n${link}\n\n` +
      `If the link has expired, go to ${siteUrl()}/forgot-password and enter this email address.\n\n` +
      "Iris Music Project",
  });
  return "welcome_email";
}
