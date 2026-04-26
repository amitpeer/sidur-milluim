import { redirect } from "next/navigation";
import { getTransitionsDataAction } from "@/server/actions/schedule-actions";
import { TransitionsContent } from "./transitions-content";

interface Props {
  params: Promise<{ seasonId: string }>;
}

export default async function TransitionsPage({ params }: Props) {
  const { seasonId } = await params;
  const data = await getTransitionsDataAction(seasonId);

  if (!data) redirect("/");

  if (!data.hasActiveSchedule) {
    return (
      <div className="p-6 text-zinc-500">אין סידור פעיל. צרו סידור תחילה.</div>
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
    />
  );
}
