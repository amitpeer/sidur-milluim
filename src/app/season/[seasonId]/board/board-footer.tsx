"use client";

import type { DailyTotal, DayColumnMeta } from "./board.types";
import type { SoldierRole } from "@/lib/constants";

interface BoardFooterProps {
  readonly dayColumns: readonly DayColumnMeta[];
  readonly dailyTotals: ReadonlyMap<string, DailyTotal>;
  readonly dailyMin: number;
  readonly roleMinimums: Partial<Record<SoldierRole, number>>;
}

const TOTAL_ROWS: readonly {
  readonly key: "commander" | "navigator" | "driver" | "total";
  readonly label: string;
}[] = [
  { key: "commander", label: "סה״כ מפקדים" },
  { key: "navigator", label: "סה״כ נווטים" },
  { key: "driver", label: "סה״כ נהגים" },
  { key: "total", label: "סה״כ" },
];

const STICKY_NAME =
  "sticky right-0 z-20 shadow-[inset_-2px_0_4px_-2px_rgba(0,0,0,0.08)]";

export function BoardFooter({
  dayColumns,
  dailyTotals,
  dailyMin,
  roleMinimums,
}: BoardFooterProps) {
  return (
    <tfoot>
      {TOTAL_ROWS.map((row) => {
        const minimum =
          row.key === "total"
            ? dailyMin
            : (roleMinimums[row.key as SoldierRole] ?? 0);
        return (
          <tr key={row.key}>
            <td
              className={`${STICKY_NAME} whitespace-nowrap border border-zinc-200 bg-zinc-100 px-3 py-2 font-semibold dark:border-zinc-700 dark:bg-zinc-900`}
            >
              {row.label}
            </td>
            {dayColumns.map((col) => {
              const totals = dailyTotals.get(col.dateStr);
              const value = totals?.[row.key] ?? 0;
              const isWarning = minimum > 0 && value < minimum;
              return (
                <td
                  key={col.dateStr}
                  className={`min-w-[2.5rem] border border-zinc-200 px-2 py-2 text-center font-semibold dark:border-zinc-700 ${col.isMonthStart ? "border-r-2 border-r-zinc-400 dark:border-r-zinc-500" : ""} ${isWarning ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"}`}
                >
                  {value}
                </td>
              );
            })}
          </tr>
        );
      })}
    </tfoot>
  );
}
