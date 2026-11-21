"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateLocation, validatePartner, validateSite } from "@/shared/domain/place";

export type PlaceFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Record<string, string>;
  savedAt?: number;
};

function dbMessage(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") return `A ${what} with that name already exists here.`;
  if (error.code === "22023") return "That time zone isn't recognized.";
  if (error.code === "42501") return "You don't have permission to make that change.";
  console.error(`save ${what} failed:`, error.code, error.message);
  return "We couldn't save that. Please try again.";
}

// ---- Partner ----

export async function addPartner(_prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validatePartner(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { data, error } = await supabase.from("partner").insert(parsed.value).select("id").single();
  if (error) return { status: "error", message: dbMessage(error, "partner") };
  revalidatePath("/admin/partners");
  redirect(`/admin/partners/${data.id}`);
}

export async function updatePartner(id: string, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validatePartner(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("partner").update(parsed.value).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error, "partner") };
  revalidatePath(`/admin/partners/${id}`);
  revalidatePath("/admin/partners");
  return { status: "saved" };
}

// ---- Site ----

export async function addSite(partnerId: string, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validateSite(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site")
    .insert({ ...parsed.value, partner_id: partnerId })
    .select("id")
    .single();
  if (error) return { status: "error", message: dbMessage(error, "site") };
  revalidatePath(`/admin/partners/${partnerId}`);
  redirect(`/admin/sites/${data.id}`);
}

export async function updateSite(id: string, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validateSite(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("site").update(parsed.value).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error, "site") };
  revalidatePath(`/admin/sites/${id}`);
  return { status: "saved" };
}

// ---- Location ----

export async function addLocation(siteId: string, _prev: PlaceFormState, form: FormData): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validateLocation(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("location").insert({ ...parsed.value, site_id: siteId });
  if (error) return { status: "error", message: dbMessage(error, "location") };
  revalidatePath(`/admin/sites/${siteId}`);
  return { status: "saved", savedAt: Date.now() };
}

export async function updateLocation(
  id: string,
  siteId: string,
  _prev: PlaceFormState,
  form: FormData,
): Promise<PlaceFormState> {
  await requireAdmin();
  const parsed = validateLocation(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("location").update(parsed.value).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error, "location") };
  revalidatePath(`/admin/sites/${siteId}`);
  return { status: "saved" };
}
