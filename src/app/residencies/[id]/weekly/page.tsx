import { redirect } from "next/navigation";

// Weekly and monthly programs are set up from each building's month view now (v0.34).
export default async function WeeklyMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/residencies/${id}/month`);
}
