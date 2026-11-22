import { redirect } from "next/navigation";

/** /residencies/[id]/month → this month's schedule. */
export default async function CurrentMonth({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = new Date();
  redirect(`/residencies/${id}/month/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
}
