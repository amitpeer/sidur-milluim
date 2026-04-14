"use client";

import { useState } from "react";
import { dateToString, eachDayInRange } from "@/lib/date-utils";

interface DayState {
  readonly dateStr: string;
  readonly day: Date;
  readonly status: "default" | "selected" | "existing" | "removing" | "disabled";
}

interface MonthCalendarGridProps {
  readonly seasonStart: Date;
  readonly seasonEnd: Date;
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

interface MonthData {
  readonly year: number;
  readonly month: number;
  readonly days: Date[];
}

function buildFullMonths(seasonStart: Date, seasonEnd: Date): MonthData[] {
  const startYear = seasonStart.getUTCFullYear();
  const startMonth = seasonStart.getUTCMonth();
  const endYear = seasonEnd.getUTCFullYear();
  const endMonth = seasonEnd.getUTCMonth();

  const months: MonthData[] = [];
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const firstDay = new Date(Date.UTC(y, m, 1));
    const lastDay = new Date(Date.UTC(y, m + 1, 0));
    months.push({ year: y, month: m, days: eachDayInRange(firstDay, lastDay) });

    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }

  return months;
}

export function MonthCalendarGrid({
  seasonStart,
  seasonEnd,
  getDayStatus,
  onDayClick,
}: MonthCalendarGridProps) {
  const months = buildFullMonths(seasonStart, seasonEnd);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (months.length === 0) return null;

  const startStr = dateToString(seasonStart);
  const endStr = dateToString(seasonEnd);

  const current = months[currentIndex];
  const label = `${MONTH_NAMES_HE[current.month]} ${current.year}`;
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
          const inRange = dateStr >= startStr && dateStr <= endStr;
          const status = inRange ? getDayStatus(dateStr) : "disabled";
          const dayOfWeek = day.getUTCDay();

          return (
            <button
              key={dateStr}
              type="button"
              onClick={(e) => onDayClick(dateStr, e)}
              disabled={status === "disabled"}
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
      return "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800";
    case "removing":
      return "bg-red-50 text-red-400 line-through opacity-60 hover:opacity-80 dark:bg-red-950 dark:text-red-400";
    case "selected":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
    case "disabled":
      return "cursor-not-allowed opacity-30 bg-zinc-50 text-zinc-400 dark:bg-zinc-900";
    default:
      return "bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";
  }
}
