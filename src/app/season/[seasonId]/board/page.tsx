"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getHomePageDataAction } from "@/server/actions/home-actions";
import { buildChecklistItems } from "@/domain/home/build-checklist-items";

type HomeData = NonNullable<Awaited<ReturnType<typeof getHomePageDataAction>>>;

export default function BoardPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHomePageDataAction(seasonId).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [seasonId]);

  if (loading) {
    return <div className="p-6 text-zinc-400">טוען...</div>;
  }

  if (!data) {
    return <div className="p-6 text-zinc-500">לא ניתן לטעון נתונים.</div>;
  }

  const today = new Date();
  const checklistItems = buildChecklistItems({
    hasCity: data.hasCity,
    hasConstraints: data.hasConstraints,
    constraintDeadline: data.constraintDeadline
      ? new Date(data.constraintDeadline)
      : null,
    hasActiveSchedule: data.hasActiveSchedule,
    now: today,
  });

  const todayLabel = today.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-lg p-6">
      <h2 className="mb-1 text-xl font-semibold">{todayLabel}</h2>
      <p className="mb-6 text-sm text-zinc-400">מה צריך לעשות?</p>

      <div className="mb-6 flex flex-col gap-3">
        {checklistItems.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-3 rounded-lg border p-4 ${
              item.isComplete
                ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                : item.urgency === "overdue"
                  ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                  : item.urgency === "warning"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            }`}
          >
            <span className="text-lg">
              {item.isComplete ? "✓" : "○"}
            </span>
            <div className="flex-1">
              <span
                className={`text-sm font-medium ${
                  item.isComplete
                    ? "text-green-700 line-through dark:text-green-300"
                    : ""
                }`}
              >
                {item.label}
              </span>
              {item.daysLeft !== null && !item.isComplete && (
                <span className="mr-2 text-xs text-zinc-500">
                  {item.daysLeft > 0
                    ? `(${item.daysLeft} ימים נותרו)`
                    : item.daysLeft === 0
                      ? "(היום!)"
                      : `(באיחור של ${Math.abs(item.daysLeft)} ימים)`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.sheetUrl ? (
        <a
          href={data.sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          פתח גיליון
        </a>
      ) : (
        <button
          disabled
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-200 px-6 py-3 text-sm font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
        >
          אין גיליון פעיל
        </button>
      )}
    </div>
  );
}
