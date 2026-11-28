"use server";

// Program setup (a "program" is a Residency in the code; see docs/GLOSSARY.md).
// Admin-only actions; Row Level Security checks every write again.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validateResidency,
  validateRosterMember,
  validateSeason,
  validateStaffAssignment,
} from "@/shared/domain/scheduling";
import { todayIn } from "@/shared/domain/time";

export type SetupFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Record<string, string>;
};

function dbMessage(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") {
    if (error.message.includes("one_admin_lead")) return "This season already has a Lead Musician. Remove that role from them first.";
    return `That ${what} already exists.`;
  }
  if (error.code === "23514") return error.message.includes("partner") ? "That site belongs to a different partner." : "That doesn't fit this program's rules.";
  if (error.code === "42501") return "You don't have permission to make that change.";
  console.error(`save ${what} failed:`, error.code, error.message);
  return "We couldn't save that. Please try again.";
}

const today = () => todayIn();
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export async function addResidency(_prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const parsed = validateResidency(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { data, error } = await supabase.from("residency").insert(parsed.value).select("id").single();
  if (error) return { status: "error", message: dbMessage(error, "program") };
  revalidatePath("/residencies");
  redirect(`/residencies/${data.id}`);
}

export async function updateResidency(id: string, partnerId: string, _prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const parsed = validateResidency(form, partnerId);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("residency").update(parsed.value).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error, "program") };
  revalidatePath(`/residencies/${id}`);
  revalidatePath("/residencies");
  return { status: "saved" };
}

export async function addResidencySite(residencyId: string, _prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const siteId = String(form.get("site_id") ?? "");
  if (!isId(siteId)) return { status: "error", errors: { site_id: "Pick a site." } };
  const supabase = await createClient();
  const { error } = await supabase.from("residency_site").insert({ residency_id: residencyId, site_id: siteId });
  if (error) return { status: "error", message: dbMessage(error, "site") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function addSeason(residencyId: string, _prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const parsed = validateSeason(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("season").insert({ ...parsed.value, residency_id: residencyId });
  if (error) return { status: "error", message: dbMessage(error, "season") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function addRosterMember(residencyId: string, seasonId: string, _prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const parsed = validateRosterMember(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  const { error } = await supabase.from("roster_member").insert({ ...parsed.value, season_id: seasonId });
  if (error) return { status: "error", message: dbMessage(error, "roster entry") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

/** Changes a roster member's core / admin-lead flags, or marks them as having left. */
export async function updateRosterMember(
  residencyId: string,
  memberId: string,
  change: { is_core?: boolean; is_admin_lead?: boolean; leave?: boolean },
): Promise<SetupFormState> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  if (change.is_core !== undefined) patch.is_core = change.is_core;
  if (change.is_admin_lead !== undefined) patch.is_admin_lead = change.is_admin_lead;
  if (change.leave) patch.left_on = today();
  const supabase = await createClient();
  const { error } = await supabase.from("roster_member").update(patch).eq("id", memberId);
  if (error) return { status: "error", message: dbMessage(error, "roster entry") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function addStaffAssignment(residencyId: string, _prev: SetupFormState, form: FormData): Promise<SetupFormState> {
  await requireAdmin();
  const parsed = validateStaffAssignment(form);
  if (!parsed.ok) return { status: "error", errors: parsed.errors };
  const supabase = await createClient();
  if (parsed.value.role === "point_person") {
    // One current Iris Supervisor per residency (DOMAIN-MODEL): end the previous one.
    const yesterday = new Date(Date.parse(parsed.value.starts_on) - 86_400_000).toISOString().slice(0, 10);
    await supabase
      .from("staff_assignment")
      .update({ ends_on: yesterday })
      .eq("residency_id", residencyId)
      .eq("role", "point_person")
      .is("ends_on", null)
      .lt("starts_on", parsed.value.starts_on);
  }
  const { error } = await supabase.from("staff_assignment").insert({ ...parsed.value, residency_id: residencyId });
  if (error) return { status: "error", message: dbMessage(error, "staff assignment") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function endStaffAssignment(residencyId: string, assignmentId: string): Promise<SetupFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("staff_assignment").update({ ends_on: today() }).eq("id", assignmentId);
  if (error) return { status: "error", message: dbMessage(error, "staff assignment") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

// ---- Pay: contract rate and stipend payments (admins only; v0.19) ----

const STIPEND_KINDS = ["project_support", "admin_lead", "training", "other"];

export async function setContractRate(residencyId: string, seasonId: string, personId: string, rate: number): Promise<SetupFormState> {
  await requireAdmin();
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000) return { status: "error", message: "Enter an hourly rate." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contract")
    .upsert({ season_id: seasonId, person_id: personId, hourly_rate: Math.round(rate * 100) / 100 }, { onConflict: "person_id,season_id" });
  if (error) return { status: "error", message: dbMessage(error, "contract") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function addStipend(residencyId: string, contractId: string, kind: string, dueOn: string, amount: number): Promise<SetupFormState> {
  await requireAdmin();
  if (!STIPEND_KINDS.includes(kind)) return { status: "error", message: "Pick a kind." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return { status: "error", message: "Enter the date it's due." };
  if (!Number.isFinite(amount) || amount <= 0) return { status: "error", message: "Enter an amount." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stipend_installment")
    .insert({ contract_id: contractId, kind, due_on: dueOn, amount: Math.round(amount * 100) / 100 });
  if (error) return { status: "error", message: dbMessage(error, "stipend") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function removeStipend(residencyId: string, stipendId: string): Promise<SetupFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("stipend_installment").delete().eq("id", stipendId);
  if (error) return { status: "error", message: dbMessage(error, "stipend") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

// ---- Detailed one-to-one notes per site (admins; v0.21) ----

export async function setSiteDetailedNotes(residencyId: string, siteId: string, on: boolean): Promise<SetupFormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("site").update({ detailed_relationship_notes: on }).eq("id", siteId);
  if (error) return { status: "error", message: dbMessage(error, "site") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

// ---- Community contacts per building (Iris Supervisor or admin; v0.26) ----

export type ContactInput = { name: string; title: string; email: string; phone: string };

export async function saveSiteContact(residencyId: string, siteId: string, contactId: string | null, input: ContactInput): Promise<SetupFormState> {
  await requirePerson();
  if (!input.name.trim()) return { status: "error", message: "Enter the contact's name." };
  if (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return { status: "error", message: "Check the email address." };
  if (input.phone.length > 40 || input.title.length > 200 || input.name.length > 200) return { status: "error", message: "That's too long." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_site_contact", {
    p_site: siteId,
    p_contact: contactId,
    p_name: input.name,
    p_title: input.title,
    p_email: input.email,
    p_phone: input.phone,
  });
  if (error) return { status: "error", message: dbMessage(error, "contact") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}

export async function retireSiteContact(residencyId: string, siteId: string, contactId: string): Promise<SetupFormState> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_site_contact", { p_site: siteId, p_contact: contactId });
  if (error) return { status: "error", message: dbMessage(error, "contact") };
  revalidatePath(`/residencies/${residencyId}`);
  return { status: "saved" };
}
