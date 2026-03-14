import { redirect } from "next/navigation";
import { getMyScheduleAction } from "@/server/actions/schedule-actions";
import { getConstraintsPageDataAction } from "@/server/actions/constraint-actions";
import { MyScheduleContent } from "./my-schedule-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function MySchedulePage({ params }: Props) {
  const { seasonId } = await params;

  const [schedule, constraintsData] = await Promise.all([
    getMyScheduleAction(seasonId),
    getConstraintsPageDataAction(seasonId),
  ]);

  if (!schedule && !constraintsData) redirect("/");

  return (
    <MyScheduleContent
      seasonId={seasonId}
      initialSchedule={schedule}
      initialConstraintsData={constraintsData}
    />
  );
}
