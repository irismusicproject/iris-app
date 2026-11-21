"use server";

import { revalidatePath } from "next/cache";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateSelfEdit } from "@/shared/domain/person";

export type ProfileState = { status: "idle" | "saved" | "error"; message?: string; errors?: Record<string, string> };

export async function saveProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const { person } = await requirePerson();
  const parsed = validateSelfEdit(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.from("person").update(parsed.value).eq("id", person.id);
  if (error) {
    console.error("saveProfile failed:", error.code, error.message);
    return { status: "error", message: "We couldn't save your changes. Please try again." };
  }
  revalidatePath("/account/profile");
  return { status: "saved" };
}
