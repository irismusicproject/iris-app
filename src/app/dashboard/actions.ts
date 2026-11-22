"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Links on Home, e.g. photo folders (admins; v0.26).

export type LinkResult = { status: "idle" | "saved" | "error"; message?: string };

export async function addResourceLink(label: string, url: string): Promise<LinkResult> {
  await requireAdmin();
  const u = url.trim();
  if (!label.trim()) return { status: "error", message: "Give the link a label." };
  if (!/^https:\/\/\S+$/.test(u)) return { status: "error", message: "Paste a full link starting with https://" };
  const supabase = await createClient();
  const { count } = await supabase.from("resource_link").select("id", { count: "exact", head: true }).eq("active", true);
  const { error } = await supabase.from("resource_link").insert({ label: label.trim(), url: u, sort_order: count ?? 0 });
  if (error) return { status: "error", message: "We couldn't save that link." };
  revalidatePath("/dashboard");
  return { status: "saved" };
}

export async function removeResourceLink(id: string): Promise<LinkResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("resource_link").update({ active: false }).eq("id", id);
  if (error) return { status: "error", message: "We couldn't remove that link." };
  revalidatePath("/dashboard");
  return { status: "saved" };
}
