"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword } from "@/shared/auth/password";

export type SetPasswordState = { status: "idle" | "error"; message?: string };

export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = validateNewPassword(password, confirm);
  if (problem) return { status: "error", message: problem };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    switch (error.code) {
      case "weak_password":
        return { status: "error", message: "That password is too weak or has appeared in a data breach. Choose a different one." };
      case "same_password":
        return { status: "error", message: "That's your current password. Choose a new one." };
      case "reauthentication_needed":
        return { status: "error", message: "For security, log out and back in, then change your password." };
      default:
        console.error("updateUser(password) failed:", error.code, error.message);
        return { status: "error", message: "We couldn't save your password. Please try again." };
    }
  }

  redirect("/dashboard?password=set");
}
