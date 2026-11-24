import { redirect } from "next/navigation";
import { todayIn } from "@/shared/domain/time";

/** /residencies/[id]/month → this month's schedule (Eastern time, not the server's UTC clock). */
export default async function CurrentMonth({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/residencies/${id}/month/${todayIn().slice(0, 7)}`);
}
