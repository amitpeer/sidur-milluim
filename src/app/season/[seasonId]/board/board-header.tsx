"use client";

import type { RefObject } from "react";
import type { DayColumnMeta, MonthGroup } from "./board.types";

interface BoardHeaderProps {
  readonly monthGroups: readonly MonthGroup[];
  readonly dayColumns: readonly DayColumnMeta[];
  readonly monthRowRef: RefObject<HTMLTableRowElement | null>;
  readonly monthRowHeight: number;
}

export function BoardHeader({
  monthGroups,
  dayColumns,
  monthRowRef,
  monthRowHeight,
}: BoardHeaderProps) {
  return (
    <thead>
      <tr ref={monthRowRef}>
        <th className="sticky right-0 top-0 z-40 border border-zinc-200 bg-white px-3 py-1 shadow-[inset_-2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-950" />
        {monthGroups.map((group, i) => (
          <th
            key={i}
            colSpan={group.colSpan}
            className="sticky top-0 z-30 border border-zinc-200 bg-zinc-50 px-2 py-1 text-center text-[11px] font-semibold shadow-[0_2px_4px_rgba(0,0,0,0.06)] dark:border-zinc-700 dark:bg-zinc-900"
          >
            {group.month}
          </th>
        ))}
      </tr>
      <tr>
        <th
          className="sticky right-0 z-40 border border-zinc-200 bg-white px-3 py-2 text-right font-medium shadow-[inset_-2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-950"
          style={{ top: monthRowHeight }}
        >
          חייל
        </th>
        {dayColumns.map((col) => (
          <th
            key={col.dateStr}
            className={`sticky z-30 min-w-[2.5rem] border border-zinc-200 bg-white px-1 py-1.5 text-center font-normal shadow-[0_2px_4px_rgba(0,0,0,0.06)] dark:border-zinc-700 dark:bg-zinc-950 ${col.isMonthStart ? "border-r-2 border-r-zinc-400 dark:border-r-zinc-500" : ""}`}
            style={{ top: monthRowHeight }}
          >
            <div>{col.dayName}</div>
            <div className="text-zinc-400">{col.dateNumber}</div>
            <div className="text-[9px] leading-tight text-zinc-400">
              {col.monthLabel}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}
