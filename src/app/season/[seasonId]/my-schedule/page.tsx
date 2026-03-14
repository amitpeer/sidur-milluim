"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyScheduleAction } from "@/server/actions/schedule-actions";
import { groupScheduleBySequence } from "@/domain/schedule/group-schedule-by-sequence";

type ScheduleDay = NonNullable<Awaited<ReturnType<typeof getMyScheduleAction>>>[number];

function formatSequenceDate(startDate: Date, endDate: Date, dayCount: number): string {
  if (dayCount === 1) {
    return startDate.toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  const startLabel = startDate.toLocaleDateString("he-IL", {
    day: "numeric",
  });
  const endLabel = endDate.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
  });

  return `${startLabel}-${endLabel} (${dayCount} ימים)`;
}

export default function MySchedulePage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyScheduleAction(seasonId).then((s) => {
      setSchedule(s);
      setLoading(false);
    });
  }, [seasonId]);

  if (loading) return <div className="p-6 text-zinc-400">טוען...</div>;
  if (!schedule) {
    return <div className="p-6 text-zinc-500">אין סידור פעיל.</div>;
  }

  const onBaseDays = schedule.filter((d) => d.status === "on-base");
  const constraintOffDays = schedule.filter((d) => d.status === "constraint-off");
  const rotationOffDays = schedule.filter((d) => d.status === "rotation-off");
  const sickDays = schedule.filter((d) => d.status === "sick");
  const courseDays = schedule.filter((d) => d.status === "course");

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-6 text-xl font-semibold">הסידור שלי</h2>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900 dark:text-green-200">
          {onBaseDays.length} ימים בבסיס
        </span>
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900 dark:text-red-200">
          {constraintOffDays.length} ימי אילוץ
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {rotationOffDays.length} ימי בבית
        </span>
        {sickDays.length > 0 && (
          <span className="rounded-full bg-yellow-100 px-3 py-1 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
            {sickDays.length} ימי מחלה
          </span>
        )}
        {courseDays.length > 0 && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
            {courseDays.length} ימי קורס
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <DaySection
          title="ימים בבסיס"
          days={onBaseDays}
          emptyText="אין ימים בבסיס"
          dotColor="bg-green-500"
        />
        <DaySection
          title="ימי חופש — אילוץ"
          days={constraintOffDays}
          emptyText="אין ימי אילוץ"
          dotColor="bg-red-500"
        />
        <DaySection
          title="ימי בבית"
          days={rotationOffDays}
          emptyText="אין ימי בבית"
          dotColor="bg-zinc-400"
        />
        {sickDays.length > 0 && (
          <DaySection
            title="ימי מחלה"
            days={sickDays}
            emptyText="אין ימי מחלה"
            dotColor="bg-yellow-500"
          />
        )}
        {courseDays.length > 0 && (
          <DaySection
            title="ימי קורס"
            days={courseDays}
            emptyText="אין ימי קורס"
            dotColor="bg-blue-500"
          />
        )}
      </div>
    </div>
  );
}

function DaySection({
  title,
  days,
  emptyText,
  dotColor,
}: {
  title: string;
  days: ScheduleDay[];
  emptyText: string;
  dotColor: string;
}) {
  const [open, setOpen] = useState(false);

  const sequences = groupScheduleBySequence(
    days.map((d) => ({ date: new Date(d.date), status: d.status })),
  );

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-right text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <span>{title} ({days.length})</span>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {sequences.map((seq) => (
            <div
              key={seq.startDate.toISOString()}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              <span>
                {formatSequenceDate(seq.startDate, seq.endDate, seq.dayCount)}
              </span>
            </div>
          ))}
          {days.length === 0 && (
            <p className="px-4 py-4 text-center text-sm text-zinc-400">
              {emptyText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
