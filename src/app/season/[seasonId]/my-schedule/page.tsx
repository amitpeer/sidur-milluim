import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getMyScheduleAction } from "@/server/actions/schedule-actions";
import { getConstraintsPageDataAction } from "@/server/actions/constraint-actions";
import { getSeasonName } from "@/server/db/stores/season-store";
import { getSoldierProfile, isSeasonAdmin } from "@/server/db/stores/soldier-store";
import { MyScheduleContent } from "./my-schedule-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function MySchedulePage({ params }: Props) {
  const { seasonId } = await params;

  const [season, session] = await Promise.all([
    getSeasonName(seasonId),
    auth(),
  ]);

  let showSchedule = season?.scheduleVisible ?? false;
  if (!showSchedule && session?.user?.id) {
    const profile = await getSoldierProfile(session.user.id);
    if (profile && await isSeasonAdmin(seasonId, profile.id)) {
      showSchedule = true;
    }
  }

  const [schedule, constraintsData] = await Promise.all([
    showSchedule ? getMyScheduleAction(seasonId) : Promise.resolve(null),
    getConstraintsPageDataAction(seasonId),
  ]);

  if (!schedule && !constraintsData) redirect("/");

  return (
    <MyScheduleContent
      seasonId={seasonId}
      initialSchedule={schedule}
      initialConstraintsData={constraintsData}
      showSchedule={showSchedule}
    />
  );
}
