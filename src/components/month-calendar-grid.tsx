"use client";

import { useState } from "react";
import { dateToString } from "@/lib/date-utils";

interface DayState {
  readonly dateStr: string;
  readonly day: Date;
  readonly status: "default" | "selected" | "existing" | "disabled";
}

interface MonthCalendarGridProps {
  readonly days: Date[];
  readonly getDayStatus: (dateStr: string) => DayState["status"];
  readonly onDayClick: (dateStr: string, event: React.MouseEvent) => void;
}

const WEEKDAY_HEADERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const MONTH_NAMES_HE: Record<number, string> = {
  0: "ינואר",
  1: "פברואר",
  2: "מרץ",
  3: "אפריל",
  4: "מאי",
  5: "יוני",
  6: "יולי",
  7: "אוגוסט",
  8: "ספטמבר",
  9: "אוקטובר",
  10: "נובמבר",
  11: "דצמבר",
};

function groupByMonth(days: Date[]): Array<{ key: string; days: Date[] }> {
  const map = new Map<string, Date[]>();
  for (const day of days) {
    const key = `${day.getUTCFullYear()}-${day.getUTCMonth()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(day);
  }
  return [...map.entries()].map(([key, days]) => ({ key, days }));
}

export function MonthCalendarGrid({
  days,
  getDayStatus,
  onDayClick,
}: MonthCalendarGridProps) {
  const months = groupByMonth(days);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (months.length === 0) return null;

  const current = months[currentIndex];
  const year = current.days[0].getUTCFullYear();
  const month = current.days[0].getUTCMonth();
  const label = `${MONTH_NAMES_HE[month]} ${year}`;

  const hasMultipleMonths = months.length > 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {hasMultipleMonths ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => i - 1)}
            disabled={currentIndex === 0}
            className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            →
          </button>
        ) : (
          <span />
        )}
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </h4>
        {hasMultipleMonths ? (
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => i + 1)}
            disabled={currentIndex === months.length - 1}
            className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ←
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-medium text-zinc-500"
          >
            {d}
          </div>
        ))}
        {current.days.map((day, idx) => {
          const dateStr = dateToString(day);
          const status = getDayStatus(dateStr);
          const dayOfWeek = day.getUTCDay();

          return (
            <button
              key={dateStr}
              type="button"
              onClick={(e) => onDayClick(dateStr, e)}
              disabled={status === "existing" || status === "disabled"}
              style={{
                gridColumnStart: idx === 0 ? dayOfWeek + 1 : undefined,
              }}
              className={`rounded-lg p-2 text-center text-sm transition-colors ${statusClassName(status)}`}
            >
              {day.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function statusClassName(status: DayState["status"]): string {
  switch (status) {
    case "existing":
      return "cursor-not-allowed bg-red-100 text-red-700 opacity-50 dark:bg-red-900 dark:text-red-200";
    case "selected":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
    case "disabled":
      return "cursor-not-allowed opacity-30 bg-zinc-50 text-zinc-400 dark:bg-zinc-900";
    default:
      return "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
  }
}
