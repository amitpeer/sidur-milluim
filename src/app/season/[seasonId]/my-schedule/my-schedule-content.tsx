"use client";

import { useCallback, useState } from "react";
import {
  getMyScheduleAction,
  type SoldierStats,
} from "@/server/actions/schedule-actions";
import {
  getConstraintsPageDataAction,
  saveConstraintChangesAction,
} from "@/server/actions/constraint-actions";
import { groupScheduleBySequence } from "@/domain/schedule/group-schedule-by-sequence";
import { eachDayInRange, dateToString, parseServerDate } from "@/lib/date-utils";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";

type ScheduleDay = NonNullable<Awaited<ReturnType<typeof getMyScheduleAction>>>[number];
type ConstraintsData = NonNullable<Awaited<ReturnType<typeof getConstraintsPageDataAction>>>;
type SeasonData = ConstraintsData["season"];

interface Props {
  readonly seasonId: string;
  readonly initialSchedule: ScheduleDay[] | null;
  readonly initialConstraintsData: ConstraintsData | null;
}

export function MyScheduleContent({
  seasonId,
  initialSchedule,
  initialConstraintsData,
}: Props) {
  const [schedule, setSchedule] = useState(initialSchedule);
  const [constraints, setConstraints] = useState<ConstraintsData["constraints"]>(
    initialConstraintsData?.constraints ?? [],
  );
  const [season, setSeason] = useState<SeasonData | null>(
    initialConstraintsData?.season ?? null,
  );
  const [profileId, setProfileId] = useState<string | null>(
    initialConstraintsData?.profileId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [scheduleData, constraintsData] = await Promise.all([
      getMyScheduleAction(seasonId),
      getConstraintsPageDataAction(seasonId),
    ]);
    setSchedule(scheduleData);
    if (constraintsData) {
      setSeason(constraintsData.season);
      setConstraints(constraintsData.constraints);
      setProfileId(constraintsData.profileId);
    }
  }, [seasonId]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      {schedule ? (
        <ScheduleSection schedule={schedule} />
      ) : (
        <p className="mb-6 text-sm text-zinc-500">אין סידור פעיל.</p>
      )}

      {season && profileId && (
        <ConstraintsSection
          seasonId={seasonId}
          season={season}
          constraints={constraints}
          saving={saving}
          pendingAdds={pendingAdds}
          pendingRemoves={pendingRemoves}
          onDayClick={(dateStr) => handleDayClick(dateStr)}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  );

  function handleDayClick(dateStr: string) {
    const deadlinePassed =
      season?.constraintDeadline &&
      new Date() > new Date(season.constraintDeadline);
    if (deadlinePassed) return;

    const existingDates = new Set(
      constraints.map((c) => dateToString(parseServerDate(c.date))),
    );

    if (existingDates.has(dateStr)) {
      setPendingRemoves((prev) => {
        const next = new Set(prev);
        if (next.has(dateStr)) next.delete(dateStr);
        else next.add(dateStr);
        return next;
      });
    } else {
      setPendingAdds((prev) => {
        const next = new Set(prev);
        if (next.has(dateStr)) next.delete(dateStr);
        else next.add(dateStr);
        return next;
      });
    }
  }

  async function handleSave() {
    setSaving(true);
    await saveConstraintChangesAction(
      seasonId,
      [...pendingAdds],
      [...pendingRemoves],
    );
    setPendingAdds(new Set());
    setPendingRemoves(new Set());
    await load();
    setSaving(false);
  }

  function handleDiscard() {
    setPendingAdds(new Set());
    setPendingRemoves(new Set());
  }
}

function ScheduleSection({ schedule }: { readonly schedule: ScheduleDay[] }) {
  const onBaseDays = schedule.filter((d) => d.status === "on-base");
  const constraintOffDays = schedule.filter((d) => d.status === "constraint-off");
  const rotationOffDays = schedule.filter((d) => d.status === "rotation-off");
  const sickDays = schedule.filter((d) => d.status === "sick");
  const courseDays = schedule.filter((d) => d.status === "course");

  return (
    <>
      <h2 className="mb-6 text-xl font-semibold">הסידור שלי</h2>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900 dark:text-green-200">
          {onBaseDays.length} ימים בבסיס
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {rotationOffDays.length + constraintOffDays.length} ימים בבית
          {constraintOffDays.length > 0 && (
            <span className="mr-1 text-xs text-zinc-400">
              ({rotationOffDays.length} רוטציה · {constraintOffDays.length} אילוץ)
            </span>
          )}
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

      <div className="mb-8 flex flex-col gap-4">
        <DaySection title="ימים בבסיס" days={onBaseDays} emptyText="אין ימים בבסיס" dotColor="bg-green-500" />
        <DaySection title="ימי חופש — אילוץ" days={constraintOffDays} emptyText="אין ימי אילוץ" dotColor="bg-red-500" />
        <DaySection title="ימי בבית" days={rotationOffDays} emptyText="אין ימי בבית" dotColor="bg-zinc-400" />
        {sickDays.length > 0 && (
          <DaySection title="ימי מחלה" days={sickDays} emptyText="אין ימי מחלה" dotColor="bg-yellow-500" />
        )}
        {courseDays.length > 0 && (
          <DaySection title="ימי קורס" days={courseDays} emptyText="אין ימי קורס" dotColor="bg-blue-500" />
        )}
      </div>
    </>
  );
}

function ConstraintsSection({
  seasonId,
  season,
  constraints,
  saving,
  pendingAdds,
  pendingRemoves,
  onDayClick,
  onSave,
  onDiscard,
}: {
  readonly seasonId: string;
  readonly season: SeasonData;
  readonly constraints: ConstraintsData["constraints"];
  readonly saving: boolean;
  readonly pendingAdds: Set<string>;
  readonly pendingRemoves: Set<string>;
  readonly onDayClick: (dateStr: string) => void;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}) {
  const deadlinePassed =
    season.constraintDeadline &&
    new Date() > new Date(season.constraintDeadline);

  const existingDates = new Set(
    constraints.map((c) => dateToString(parseServerDate(c.date))),
  );

  const seasonStart = parseServerDate(season.startDate);
  const seasonEnd = parseServerDate(season.endDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  seasonEnd.setUTCHours(0, 0, 0, 0);
  const days = eachDayInRange(seasonStart, seasonEnd);

  const hasPendingChanges = pendingAdds.size > 0 || pendingRemoves.size > 0;
  const totalAfterSave = constraints.length + pendingAdds.size - pendingRemoves.size;

  return (
    <>
      <h2 className="mb-2 text-xl font-semibold">האילוצים שלי</h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        לחצו על תאריכים לבחירה, ואז שמרו.
        {season.constraintDeadline && (
          <>
            {" "}
            מועד אחרון:{" "}
            {new Date(season.constraintDeadline).toLocaleDateString("he-IL")}
          </>
        )}
      </p>

      {deadlinePassed && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          המועד האחרון להגשת אילוצים עבר. פנו למנהל לשינויים.
        </div>
      )}

      <MonthCalendarGrid
        days={days}
        getDayStatus={(dateStr) => {
          if (deadlinePassed) return "disabled";
          if (pendingRemoves.has(dateStr)) return "removing";
          if (existingDates.has(dateStr)) return "existing";
          if (pendingAdds.has(dateStr)) return "selected";
          return "default";
        }}
        onDayClick={(dateStr) => onDayClick(dateStr)}
      />

      {hasPendingChanges && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "שומר..." : "שמור שינויים"}
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ביטול
          </button>
          <span className="text-xs text-zinc-400">
            {pendingAdds.size > 0 && `+${pendingAdds.size}`}
            {pendingAdds.size > 0 && pendingRemoves.size > 0 && " / "}
            {pendingRemoves.size > 0 && `-${pendingRemoves.size}`}
          </span>
        </div>
      )}

      <p className="mt-4 text-sm text-zinc-500">
        {hasPendingChanges
          ? `${totalAfterSave} ימי אילוץ לאחר שמירה`
          : `${constraints.length} ימי אילוץ סה״כ`}
      </p>
    </>
  );
}

function formatSequenceDate(startDate: Date, endDate: Date, dayCount: number): string {
  if (dayCount === 1) {
    return startDate.toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  const startLabel = startDate.toLocaleDateString("he-IL", { day: "numeric" });
  const endLabel = endDate.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
  return `${startLabel}-${endLabel} (${dayCount} ימים)`;
}

function DaySection({
  title,
  days,
  emptyText,
  dotColor,
}: {
  readonly title: string;
  readonly days: ScheduleDay[];
  readonly emptyText: string;
  readonly dotColor: string;
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
