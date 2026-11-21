"use server";

import { createClient } from "@/lib/supabase/server";
import { confirmUrl } from "@/lib/site-url";
import { isValidEmail } from "@/shared/auth/password";

export type ResetState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

export async function sendResetLink(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: confirmUrl("/account/password"),
  });

  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { status: "error", message: "A link was sent recently. Wait a minute before asking again.", email };
    }
    console.error("resetPasswordForEmail failed:", error.code, error.message);
    return { status: "error", message: "We couldn't send the email. Please try again.", email };
  }

  // Same reply whether or not the email has an account.
  return { status: "sent", email };
}
