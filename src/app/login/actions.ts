"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeCode } from "@/shared/auth/password";

// Supabase reports "user_banned" for people an admin has deactivated.
const DEACTIVATED_MESSAGE =
  "Your account has been deactivated. If you think that's a mistake, contact an Iris administrator.";

export type FormState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

export async function signInWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!isValidEmail(email) || !password) {
    return { status: "error", message: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "over_request_rate_limit") {
      return { status: "error", message: "Too many attempts. Wait a few minutes and try again.", email };
    }
    if (error.code === "user_banned") {
      return { status: "error", message: DEACTIVATED_MESSAGE, email };
    }
    // Same message for a wrong password and an unknown email.
    return {
      status: "error",
      message: "That email and password don't match. Try again, or use “Forgot password?”",
      email,
    };
  }

  redirect("/dashboard");
}

export async function sendSignInCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only people already added in Supabase can sign in; no public sign-up.
    options: { shouldCreateUser: false },
  });

  // Unknown emails get the same reply, so the form doesn't reveal who has an account.
  if (error?.code === "user_banned") {
    return { status: "error", message: DEACTIVATED_MESSAGE, email };
  }
  if (error && error.code !== "otp_disabled" && error.code !== "user_not_found") {
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { status: "error", message: "A code was sent recently. Wait a minute before asking for another.", email };
    }
    console.error("signInWithOtp failed:", error.code, error.message);
    return { status: "error", message: "We couldn't send a code. Please try again.", email };
  }

  return { status: "sent", email };
}

export async function verifySignInCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const token = normalizeCode(String(formData.get("code") ?? ""));
  if (!isValidEmail(email) || !token) {
    return { status: "sent", message: "Enter the code from the email.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    if (error.code === "user_banned") {
      return { status: "sent", message: DEACTIVATED_MESSAGE, email };
    }
    return { status: "sent", message: "That code is wrong or has expired. Check the latest email, or ask for a new code.", email };
  }

  redirect("/dashboard");
}
