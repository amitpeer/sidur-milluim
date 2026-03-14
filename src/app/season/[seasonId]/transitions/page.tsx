"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTransitionsDataAction } from "@/server/actions/schedule-actions";
import { dateToString, addDays } from "@/lib/date-utils";
import { formatTransitionsText } from "@/domain/transitions/format-transitions-text";

type TransitionsData = NonNullable<
  Awaited<ReturnType<typeof getTransitionsDataAction>>
>;
type Assignment = TransitionsData["assignments"][number];

const MAX_DAYS_AHEAD = 10;

export default function TransitionsPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [hasActiveSchedule, setHasActiveSchedule] = useState(false);
  const [referenceDate, setReferenceDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [daysAhead, setDaysAhead] = useState(3);

  useEffect(() => {
    getTransitionsDataAction(seasonId).then((data) => {
      if (data) {
        setAssignments(data.assignments);
        setHasActiveSchedule(data.hasActiveSchedule);
        setReferenceDate(data.referenceDate);
      }
      setLoading(false);
    });
  }, [seasonId]);

  if (loading) return <div className="p-6 text-zinc-400">טוען...</div>;
  if (!hasActiveSchedule) {
    return (
      <div className="p-6 text-zinc-500">אין סידור פעיל. צרו סידור תחילה.</div>
    );
  }
  if (assignments.length === 0) {
    return (
      <div className="p-6 text-zinc-500">אין כניסות ויציאות לתאריכים הקרובים.</div>
    );
  }

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

    const arriving = [...daySet].filter((id) => !prevSet.has(id)).map(getName);
    const leaving = [...prevSet].filter((id) => !daySet.has(id)).map(getName);

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
        <h2 className="text-xl font-semibold">כניסות ויציאות</h2>
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
