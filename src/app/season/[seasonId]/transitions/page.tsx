import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getTransitionsDataAction } from "@/server/actions/schedule-actions";
import { getSeasonName } from "@/server/db/stores/season-store";
import { getSoldierProfile, isSeasonAdmin } from "@/server/db/stores/soldier-store";
import { TransitionsContent } from "./transitions-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function TransitionsPage({ params }: Props) {
  const { seasonId } = await params;

  const [season, session] = await Promise.all([
    getSeasonName(seasonId),
    auth(),
  ]);

  if (!season?.scheduleVisible && session?.user?.id) {
    const profile = await getSoldierProfile(session.user.id);
    const admin = profile ? await isSeasonAdmin(seasonId, profile.id) : false;
    if (!admin) redirect(`/season/${seasonId}/board`);
  }

  const data = await getTransitionsDataAction(seasonId);

  if (!data) redirect("/");

  if (!data.hasActiveSchedule) {
    return (
      <div className="p-6 text-zinc-500">אין גיליון פעיל. יש לייצא גיליון תחילה.</div>
    );
  }

  if (data.assignments.length === 0) {
    return (
      <div className="p-6 text-zinc-500">אין נתוני דמבו לתאריכים הקרובים.</div>
    );
  }

  return (
    <TransitionsContent
      assignments={data.assignments}
      referenceDate={data.referenceDate!}
      seasonStartDate={data.seasonStartDate!}
      seasonEndDate={data.seasonEndDate!}
    />
  );
}
