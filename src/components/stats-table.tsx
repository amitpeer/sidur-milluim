"use client";

import { useState } from "react";
import type { SoldierStats } from "@/server/actions/schedule-actions";

type SortField = keyof Pick<
  SoldierStats,
  "fullName" | "daysInArmy" | "daysAtHome" | "constraintDaysOff" | "sickDays" | "courseDays"
>;

type SortDirection = "asc" | "desc";

const COLUMNS: readonly {
  readonly field: SortField;
  readonly label: string;
  readonly colorClass: string;
  readonly bgClass: string;
}[] = [
  { field: "daysInArmy", label: "בצבא", colorClass: "text-green-700 dark:text-green-300", bgClass: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" },
  { field: "daysAtHome", label: "בבית", colorClass: "text-zinc-500", bgClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  { field: "constraintDaysOff", label: "אילוצים", colorClass: "text-red-600 dark:text-red-300", bgClass: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" },
  { field: "sickDays", label: "מחלה", colorClass: "text-amber-700 dark:text-amber-300", bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  { field: "courseDays", label: "קורס", colorClass: "text-blue-600 dark:text-blue-300", bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
];

interface StatsTableProps {
  readonly stats: readonly SoldierStats[];
  readonly versionDate?: Date | null;
}

export function StatsTable({ stats, versionDate }: StatsTableProps) {
  const [sortField, setSortField] = useState<SortField>("daysInArmy");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "fullName" ? "asc" : "desc");
    }
  };

  const sorted = [...stats].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (typeof aVal === "string" && typeof bVal === "string") {
      const cmp = aVal.localeCompare(bVal, "he");
      return sortDirection === "asc" ? cmp : -cmp;
    }

    const diff = (aVal as number) - (bVal as number);
    return sortDirection === "asc" ? diff : -diff;
  });

  const arrow = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-1 text-sm font-medium">סטטיסטיקות ({stats.length})</h3>
      {versionDate && (
        <p className="mb-3 text-xs text-zinc-400">
          גרסה פעילה מתאריך{" "}
          {new Date(versionDate).toLocaleString("he-IL", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th
                className="cursor-pointer px-3 py-2 text-right font-medium"
                onClick={() => handleSort("fullName")}
              >
                חייל{arrow("fullName")}
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.field}
                  className="cursor-pointer px-2 py-2 text-center font-medium"
                  onClick={() => handleSort(col.field)}
                >
                  <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${col.bgClass}`}>
                    {col.label}{arrow(col.field)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr
                key={s.id}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-2 font-medium">{s.fullName}</td>
                {COLUMNS.map((col) => (
                  <td key={col.field} className={`px-2 py-2 text-center ${col.colorClass}`}>
                    {s[col.field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
