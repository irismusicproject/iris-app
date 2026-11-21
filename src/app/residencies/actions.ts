"use server";

// Program setup (a "program" is a Residency in the code; see docs/GLOSSARY.md).
// Admin-only actions; Row Level Security checks every write again.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  validateResidency,
  validateRosterMember,
  validateSeason,
  validateStaffAssignment,
} from "@/shared/domain/scheduling";

export type SetupFormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  errors?: Record<string, string>;
};

function dbMessage(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") {
    if (error.message.includes("one_admin_lead")) return "This season already has an admin lead. Remove that role from them first.";
    return `That ${what} already exists.`;
  }
  if (error.code === "23514") return error.message.includes("partner") ? "That site belongs to a different partner." : "That doesn't fit this program's rules.";
  if (error.code === "42501") return "You don't have permission to make that change.";
  console.error(`save ${what} failed:`, error.code, error.message);
  return "We couldn't save that. Please try again.";
}

const today = () => new Date().toISOString().slice(0, 10);
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
    // One current point person per residency (DOMAIN-MODEL): end the previous one.
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
