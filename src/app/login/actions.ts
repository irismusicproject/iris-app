"use server";

import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Only people already added in Supabase can sign in; no public sign-up.
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/dashboard`,
    },
  });

  // Same message either way, so the form doesn't reveal who has an account.
  if (error && error.status !== 400 && error.code !== "otp_disabled") {
    console.error("signInWithOtp failed:", error.message);
    return {
      status: "error",
      message: "Something went wrong sending your link. Please try again.",
    };
  }

  return {
    status: "sent",
    message: `If ${email} belongs to an Iris staff or volunteer account, a sign-in link is on its way.`,
  };
}
