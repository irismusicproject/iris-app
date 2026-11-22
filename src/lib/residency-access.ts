import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * What the signed-in person may do in one program (residency). Used only to
 * show or hide buttons; the database's Row Level Security decides for real.
 * See docs/DOMAIN-MODEL.md section 7 (v0.12).
 */
export type ResidencyAccess = {
  /** On the current roster: edits draft titles, rooms and who plays. */
  onRoster: boolean;
  /** Admin Lead, point person or admin: everything on the schedule. */
  canSchedule: boolean;
  /** Point person or admin: assigns leaders first, marks months reviewed. */
  isPointPerson: boolean;
};

export async function getResidencyAccess(residencyId: string, isAdmin: boolean): Promise<ResidencyAccess> {
  const supabase = await createClient();
  const [roster, schedule, point] = await Promise.all([
    supabase.rpc("is_on_current_roster", { p_residency: residencyId }),
    supabase.rpc("can_schedule", { p_residency: residencyId }),
    supabase.rpc("is_current_staff", { p_residency: residencyId, p_role: "point_person" }),
  ]);
  return {
    onRoster: roster.data === true,
    canSchedule: isAdmin || schedule.data === true,
    isPointPerson: isAdmin || point.data === true,
  };
}

/**
 * Names of a program's roster and staff (names only; DOMAIN-MODEL v0.13).
 * Non-admins can't read other people's records, so pages use this instead
 * of joining the person table.
 */
export async function getResidencyNames(residencyId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("residency_people", { p_residency: residencyId });
  return new Map(((data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
}
