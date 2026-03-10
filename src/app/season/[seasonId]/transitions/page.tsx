"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTransitionsDataAction } from "@/server/actions/schedule-actions";
import { dateToString, addDays } from "@/lib/date-utils";

type Assignment = NonNullable<
  Awaited<ReturnType<typeof getTransitionsDataAction>>
>[number];

export default function TransitionsPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTransitionsDataAction(seasonId).then((data) => {
      setAssignments(data ?? []);
      setLoading(false);
    });
  }, [seasonId]);

  if (loading) return <div className="p-6 text-zinc-400">טוען...</div>;
  if (assignments.length === 0) {
    return (
      <div className="p-6 text-zinc-500">אין סידור פעיל. צרו סידור תחילה.</div>
    );
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  const todayStr = dateToString(today);
  const tomorrowStr = dateToString(tomorrow);
  const yesterdayStr = dateToString(yesterday);

  const getSoldiersOnDate = (dateStr: string) =>
    new Set(
      assignments
        .filter(
          (a) =>
            dateToString(new Date(a.date)) === dateStr && a.isOnBase,
        )
        .map((a) => a.soldierProfileId),
    );

  const yesterdaySet = getSoldiersOnDate(yesterdayStr);
  const todaySet = getSoldiersOnDate(todayStr);
  const tomorrowSet = getSoldiersOnDate(tomorrowStr);

  const arriving = [...todaySet].filter((id) => !yesterdaySet.has(id));
  const leaving = [...yesterdaySet].filter((id) => !todaySet.has(id));
  const arrivingTomorrow = [...tomorrowSet].filter((id) => !todaySet.has(id));
  const leavingTomorrow = [...todaySet].filter((id) => !tomorrowSet.has(id));

  const getName = (id: string) =>
    assignments.find((a) => a.soldierProfileId === id)?.soldierProfile
      .fullName ?? id;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-xl font-semibold">מעברים</h2>

      <TransitionSection
        title="היום"
        date={today.toLocaleDateString("he-IL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        arriving={arriving.map(getName)}
        leaving={leaving.map(getName)}
      />

      <TransitionSection
        title="מחר"
        date={tomorrow.toLocaleDateString("he-IL", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        arriving={arrivingTomorrow.map(getName)}
        leaving={leavingTomorrow.map(getName)}
      />
    </div>
  );
}

function TransitionSection({
  title,
  date,
  arriving,
  leaving,
}: {
  title: string;
  date: string;
  arriving: string[];
  leaving: string[];
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-1 text-lg font-medium">
        {title} — {date}
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <h4 className="mb-2 text-sm font-medium text-green-700 dark:text-green-300">
            מגיעים
          </h4>
          {arriving.length > 0 ? (
            <ul className="space-y-1">
              {arriving.map((name) => (
                <li key={name} className="text-sm">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-green-400">אין שינוי</p>
          )}
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <h4 className="mb-2 text-sm font-medium text-red-700 dark:text-red-300">
            עוזבים
          </h4>
          {leaving.length > 0 ? (
            <ul className="space-y-1">
              {leaving.map((name) => (
                <li key={name} className="text-sm">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-red-400">אין שינוי</p>
          )}
        </div>
      </div>
    </div>
  );
}
