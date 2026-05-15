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
  readonly seasonStartDate: string;
  readonly seasonEndDate: string;
}

const CHIP_OPTIONS = [
  { label: "היום", offset: 0 },
  { label: "מחר", offset: 1 },
  { label: "מחרתיים", offset: 2 },
] as const;

export function TransitionsContent({
  assignments,
  referenceDate,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [daysAhead, setDaysAhead] = useState(3);
  const [startDateStr, setStartDateStr] = useState(referenceDate);

  const refDate = new Date(referenceDate + "T00:00:00.000Z");
  const ref = new Date(startDateStr + "T00:00:00.000Z");

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

  const activeChipIndex = CHIP_OPTIONS.findIndex(
    (chip) => dateToString(addDays(refDate, chip.offset)) === startDateStr,
  );

  const handleChipClick = (offset: number) => {
    setStartDateStr(dateToString(addDays(refDate, offset)));
  };

  const handleCustomDate = (value: string) => {
    if (value) setStartDateStr(value);
  };

  const sections = Array.from({ length: daysAhead }, (_, i) => {
    const day = addDays(ref, i);
    const nextDay = addDays(ref, i + 1);
    const dayStr = dateToString(day);
    const nextStr = dateToString(nextDay);

    const daySet = getSoldiersOnDate(dayStr);
    const nextSet = getSoldiersOnDate(nextStr);

    const arriving = sortByFamilyName([...nextSet].filter((id) => !daySet.has(id)).map(getName));
    const leaving = sortByFamilyName([...daySet].filter((id) => !nextSet.has(id)).map(getName));

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
      <div className="mb-4 flex items-center justify-between">
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

      <div className="mb-6">
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">החל מ:</p>
        <div className="flex flex-wrap items-center gap-2">
          {CHIP_OPTIONS.map((chip, i) => (
            <button
              key={chip.offset}
              onClick={() => handleChipClick(chip.offset)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeChipIndex === i
                  ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              }`}
            >
              {chip.label}
            </button>
          ))}
          <label className="relative cursor-pointer">
            <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors ${
              activeChipIndex === -1
                ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
              </svg>
              {activeChipIndex === -1 ? formatShortDate(ref) : "תאריך"}
            </span>
            <input
              type="date"
              value={activeChipIndex === -1 ? startDateStr : ""}
              min={seasonStartDate}
              max={seasonEndDate}
              onChange={(e) => handleCustomDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
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
            מגיעים ({arriving.length})
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
            עוזבים ({leaving.length})
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
