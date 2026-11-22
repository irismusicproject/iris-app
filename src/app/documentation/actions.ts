"use server";

// Weekly documentation (DOMAIN-MODEL section 4, v0.14). Writes run with the
// musician's own session, so the database decides what they may change.

import { revalidatePath } from "next/cache";
import { requirePerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_KINDS, RESIDENT_INVOLVEMENTS, residentsRequired, type ActivityKind, type ResidentInvolvement } from "@/shared/domain/documentation";

export type DocResult = { status: "idle" | "saved" | "error"; message?: string; errors?: Record<string, string>; savedAt?: number };
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function fail(error: { code?: string; message: string }): DocResult {
  if (error.code === "42501") return { status: "error", message: "You don't have permission to do that." };
  if (error.code === "23514") return { status: "error", message: error.message.charAt(0).toUpperCase() + error.message.slice(1) + "." };
  console.error("documentation save failed:", error.code, error.message);
  return { status: "error", message: "We couldn't save that. Please try again." };
}

export async function saveSessionReport(
  sessionId: string,
  input: { attendance: number; interactionTypeId: string; involvement: ResidentInvolvement; minutes: number; notes: string; siteId?: string | null },
): Promise<DocResult> {
  const { person } = await requirePerson();
  const e: Record<string, string> = {};
  if (!Number.isInteger(input.attendance) || input.attendance < 0 || input.attendance > 2000) e.attendance = "Enter how many people attended.";
  if (!isId(input.interactionTypeId)) e.interactionTypeId = "Pick a type.";
  if (!RESIDENT_INVOLVEMENTS.includes(input.involvement)) e.involvement = "Pick one.";
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 600) e.minutes = "Enter the length in minutes.";
  if (Object.keys(e).length) return { status: "error", errors: e, message: Object.values(e)[0] };
  const supabase = await createClient();
  const row = {
    session_id: sessionId,
    author_id: person.id,
    attendance: input.attendance,
    interaction_type_id: input.interactionTypeId,
    resident_involvement: input.involvement,
    actual_minutes: input.minutes,
    notes: input.notes.trim() || null,
    // The building it happened in (v0.24); the database checks it's one of the program's.
    site_id: input.siteId && isId(input.siteId) ? input.siteId : null,
  };
  const { error } = await supabase.from("session_report").upsert(row, { onConflict: "session_id" });
  if (error) return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

export async function logActivity(_prev: DocResult, form: FormData): Promise<DocResult> {
  const { person } = await requirePerson();
  const e: Record<string, string> = {};
  const residencyId = String(form.get("residency_id") ?? "");
  const siteId = String(form.get("site_id") ?? "");
  const occurredOn = String(form.get("occurred_on") ?? "");
  const kind = String(form.get("kind") ?? "") as ActivityKind;
  const minutes = Number(form.get("minutes"));
  const sessionId = String(form.get("session_id") ?? "");
  const residentIds = form.getAll("resident_id").filter(isId);
  const newNames = String(form.get("new_residents") ?? "")
    .split(",")
    .map((n) => n.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (!isId(residencyId) || !isId(siteId)) e.site_id = "Pick a program and site.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) e.occurred_on = "Enter the date.";
  if (!ACTIVITY_KINDS.includes(kind)) e.kind = "Pick a type.";
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) e.minutes = "Enter minutes (1–600).";
  if (newNames.some((n) => n.length > 80)) e.new_residents = "Keep each name short: first name and last initial.";
  if (ACTIVITY_KINDS.includes(kind) && residentsRequired(kind) && !residentIds.length && !newNames.length)
    e.residents = "Pick or add at least one resident.";
  if (Object.keys(e).length) return { status: "error", errors: e };

  const supabase = await createClient();
  // New residents (first name + last initial). Reuse one that already exists.
  for (const name of newNames) {
    const { data: found } = await supabase.from("resident").select("id").eq("site_id", siteId).ilike("display_name", name).eq("disambiguator", "").maybeSingle();
    if (found) { residentIds.push(found.id); continue; }
    const { data, error } = await supabase.from("resident").insert({ site_id: siteId, display_name: name, created_by: person.id }).select("id").single();
    if (error) return fail(error);
    residentIds.push(data.id);
  }
  const { data: activity, error } = await supabase
    .from("relationship_activity")
    .insert({
      person_id: person.id,
      residency_id: residencyId,
      site_id: siteId,
      session_id: isId(sessionId) ? sessionId : null,
      occurred_on: occurredOn,
      kind,
      minutes,
      collaborative: form.get("collaborative") === "yes",
      note: String(form.get("note") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) return fail(error);
  // Other musicians who shared it (v0.24): each is credited the minutes.
  const others = [...new Set(form.getAll("other_musician_id").map(String).filter((id) => isId(id) && id !== person.id))];
  if (others.length) {
    const { error: shareError } = await supabase.from("relationship_activity_musician").insert(others.map((person_id) => ({ activity_id: activity.id, person_id })));
    if (shareError) return fail(shareError);
  }
  if (residentIds.length) {
    const { error: linkError } = await supabase
      .from("relationship_activity_resident")
      .insert([...new Set(residentIds)].map((resident_id) => ({ activity_id: activity.id, resident_id })));
    if (linkError) return fail(linkError);
  }
  revalidatePath("/documentation");
  return { status: "saved", savedAt: Date.now() };
}

export async function deleteActivity(activityId: string): Promise<DocResult> {
  await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.from("relationship_activity").delete().eq("id", activityId);
  if (error) return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

export async function saveReflection(residencyId: string, month: string, _prev: DocResult, form: FormData): Promise<DocResult> {
  const { person } = await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_reflection").upsert(
    {
      person_id: person.id,
      residency_id: residencyId,
      month: `${month}-01`,
      highlights: String(form.get("highlights") ?? "").slice(0, 4000),
      challenges: String(form.get("challenges") ?? "").slice(0, 4000),
    },
    { onConflict: "person_id,residency_id,month" },
  );
  if (error) return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

// ---- Private calendar link (DOMAIN-MODEL v0.15) ----

export async function createCalendarLink(): Promise<DocResult> {
  const { person } = await requirePerson();
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_feed").insert({ person_id: person.id });
  if (error && error.code !== "23505") return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

/** A new secret link; the old one stops working at once. */
export async function resetCalendarLink(): Promise<DocResult> {
  const { person } = await requirePerson();
  const supabase = await createClient();
  const random = () => crypto.randomUUID().replace(/-/g, "");
  const { error } = await supabase.from("calendar_feed").update({ token: random() + random(), created_at: new Date().toISOString() }).eq("person_id", person.id);
  if (error) return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

// ---- Weekly hours (DOMAIN-MODEL section 5, v0.19) ----

/** Save a week's hours for one program; with submit, send them to the point person. */
/**
 * "Submit my week" (v0.21; v0.24: hours are calculated from documentation,
 * never typed). Submits every program's week at once. The database refuses
 * while a program the musician led that week is undocumented.
 */
export async function submitWeek(week: string, residencyIds: string[]): Promise<DocResult> {
  await requirePerson();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !residencyIds.every(isId)) return { status: "error", message: "Pick a week." };
  const supabase = await createClient();
  for (const id of residencyIds) {
    const { error } = await supabase.rpc("submit_week", { p_residency: id, p_week: week });
    if (error) {
      if (error.message.includes("document the programs")) return { status: "error", message: "Document the programs you led this week first, then submit your week." };
      if (error.message.includes("already approved")) continue;
      return fail(error);
    }
  }
  revalidatePath("/documentation");
  return { status: "saved" };
}

/** Take yourself off a relationship-building log someone else shared with you (v0.24). */
export async function leaveSharedActivity(activityId: string): Promise<DocResult> {
  const { person } = await requirePerson();
  if (!isId(activityId)) return { status: "error", message: "That log wasn't found." };
  const supabase = await createClient();
  const { error } = await supabase.from("relationship_activity_musician").delete().eq("activity_id", activityId).eq("person_id", person.id);
  if (error) return fail(error);
  revalidatePath("/documentation");
  return { status: "saved" };
}

