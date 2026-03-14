import { redirect } from "next/navigation";
import { getDayAssignmentsAction } from "@/server/actions/schedule-actions";
import { DayContent } from "./day-content";

interface Props {
  params: Promise<{ seasonId: string; date: string }>;
}

export default async function DayPage({ params }: Props) {
  const { seasonId, date } = await params;
  const assignments = await getDayAssignmentsAction(seasonId, date);

  if (!assignments) redirect("/");

  return (
    <DayContent
      seasonId={seasonId}
      date={date}
      initialAssignments={assignments}
    />
  );
}
