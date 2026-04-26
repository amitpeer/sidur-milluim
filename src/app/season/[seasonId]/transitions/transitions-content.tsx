"use client";

import { useState } from "react";
import { dateToString, addDays } from "@/lib/date-utils";
import { formatTransitionsText } from "@/domain/transitions/format-transitions-text";
import type { getTransitionsDataAction } from "@/server/actions/schedule-actions";

type TransitionsData = NonNullable<
  Awaited<ReturnType<typeof getTransitionsDataAction>>
>;
type Assignment = TransitionsData["assignments"][number];

const MAX_DAYS_AHEAD = 10;

interface Props {
  readonly assignments: Assignment[];
  readonly referenceDate: string;
}

export function TransitionsContent({ assignments, referenceDate }: Props) {
  const [copied, setCopied] = useState(false);
  const [daysAhead, setDaysAhead] = useState(3);

  const ref = new Date(referenceDate + "T00:00:00.000Z");

  const getSoldiersOnDate = (dateStr: string) =>
    new Set(
      assignments
        .filter((a) => dateToString(new Date(a.date)) === dateStr && a.isOnBase)
        .map((a) => a.soldierProfileId),
    );

  const getName = (id: string) =>
    assignments.find((a) => a.soldierProfileId === id)?.soldierProfile
      .fullName ?? id;

  const sortByFamilyName = (names: string[]) =>
    names.sort((a, b) => {
      const aFamily = a.split(" ").slice(-1)[0];
      const bFamily = b.split(" ").slice(-1)[0];
      const cmp = aFamily.localeCompare(bFamily, "he");
      return cmp !== 0 ? cmp : a.localeCompare(b, "he");
    });

  const formatDayOfWeek = (d: Date) =>
    d.toLocaleDateString("he-IL", { weekday: "long" });

  const formatShortDate = (d: Date) => {
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  };

  const formatDateLong = (d: Date) =>
    d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });

  const todayReal = new Date();
  todayReal.setUTCHours(0, 0, 0, 0);
  const isRefToday = dateToString(ref) === dateToString(todayReal);

  const sections = Array.from({ length: daysAhead }, (_, i) => {
    const day = addDays(ref, i);
    const prevDay = addDays(ref, i - 1);
    const dayStr = dateToString(day);
    const prevStr = dateToString(prevDay);

    const prevSet = getSoldiersOnDate(prevStr);
    const daySet = getSoldiersOnDate(dayStr);

    const arriving = sortByFamilyName([...daySet].filter((id) => !prevSet.has(id)).map(getName));
    const leaving = sortByFamilyName([...prevSet].filter((id) => !daySet.has(id)).map(getName));

    const dayOfWeek = formatDayOfWeek(day);
    const shortDate = formatShortDate(day);

    let title = `${dayOfWeek}, ${shortDate}`;
    if (isRefToday && i === 0) title = `היום — ${formatDateLong(day)}`;
    else if (isRefToday && i === 1) title = `מחר — ${formatDateLong(day)}`;

    return { title, dayOfWeek, shortDate, arriving, leaving };
  });

  const handleCopy = async () => {
    const text = formatTransitionsText(
      sections.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        shortDate: s.shortDate,
        arriving: s.arriving,
        leaving: s.leaving,
      })),
    );
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">דמבו</h2>
        <div className="flex items-center gap-2">
          <select
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {Array.from({ length: MAX_DAYS_AHEAD }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "יום" : "ימים"}
              </option>
            ))}
          </select>
          <button
            onClick={handleCopy}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {copied ? "הועתק!" : "העתק"}
          </button>
        </div>
      </div>

      {sections.map((s) => (
        <TransitionSection
          key={s.shortDate}
          title={s.title}
          arriving={s.arriving}
          leaving={s.leaving}
        />
      ))}
    </div>
  );
}

function TransitionSection({
  title,
  arriving,
  leaving,
}: {
  title: string;
  arriving: string[];
  leaving: string[];
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-base font-medium">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <h4 className="mb-2 text-sm font-medium text-green-700 dark:text-green-300">
            מגיעים
          </h4>
          {arriving.length > 0 ? (
            <ul className="space-y-1">
              {arriving.map((name) => (
                <li key={name} className="text-sm">{name}</li>
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
                <li key={name} className="text-sm">{name}</li>
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
