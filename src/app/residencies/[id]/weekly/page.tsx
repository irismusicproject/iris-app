import { redirect } from "next/navigation";

// Weekly and monthly programs are set up in the season view now (v0.18).
export default async function WeeklyMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/residencies/${id}/season`);
}
