"use client";

import { useCallback, useState } from "react";
import { getMyScheduleAction } from "@/server/actions/schedule-actions";
import {
  getConstraintsPageDataAction,
  saveConstraintChangesAction,
} from "@/server/actions/constraint-actions";
import { dateToString, parseServerDate } from "@/lib/date-utils";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";
import { ScheduleCalendar } from "@/components/schedule-calendar";

type ScheduleResult = NonNullable<Awaited<ReturnType<typeof getMyScheduleAction>>>;
type ScheduleDay = ScheduleResult["days"][number];
type ConstraintsData = NonNullable<Awaited<ReturnType<typeof getConstraintsPageDataAction>>>;
type SeasonData = ConstraintsData["season"];

interface Props {
  readonly seasonId: string;
  readonly initialSchedule: ScheduleResult | null;
  readonly initialConstraintsData: ConstraintsData | null;
  readonly showSchedule?: boolean;
}

export function MyScheduleContent({
  seasonId,
  initialSchedule,
  initialConstraintsData,
  showSchedule = true,
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
      showSchedule ? getMyScheduleAction(seasonId) : Promise.resolve(null),
      getConstraintsPageDataAction(seasonId),
    ]);
    setSchedule(scheduleData);
    if (constraintsData) {
      setSeason(constraintsData.season);
      setConstraints(constraintsData.constraints);
      setProfileId(constraintsData.profileId);
    }
  }, [seasonId, showSchedule]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      {showSchedule && (
        schedule && season ? (
          <ScheduleSection
            schedule={schedule.days}
            season={season}
            lastSyncedAt={schedule.lastSyncedAt}
          />
        ) : (
          <p className="mb-6 text-sm text-zinc-500">אין סידור פעיל.</p>
        )
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

function ScheduleSection({
  schedule,
  season,
  lastSyncedAt,
}: {
  readonly schedule: ScheduleDay[];
  readonly season: SeasonData;
  readonly lastSyncedAt: Date | string | null;
}) {
  const onBaseDays = schedule.filter((d) => d.status === "on-base");
  const constraintOffDays = schedule.filter((d) => d.status === "constraint-off");
  const rotationOffDays = schedule.filter((d) => d.status === "rotation-off");
  const sickDays = schedule.filter((d) => d.status === "sick");
  const courseDays = schedule.filter((d) => d.status === "course");

  const seasonStart = parseServerDate(season.startDate);
  const seasonEnd = parseServerDate(season.endDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  seasonEnd.setUTCHours(0, 0, 0, 0);

  return (
    <>
      <h2 className="mb-4 text-xl font-semibold">הסידור שלי</h2>

      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
        <p>הסידור המוצג הוא משוער בלבד. הגרסה הקובעת היא הגיליון המשותף.</p>
        {lastSyncedAt && (
          <p className="mt-1 text-xs">
            עודכן לאחרונה: <strong>{formatSyncedAgo(lastSyncedAt)}</strong>
          </p>
        )}
      </div>

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

      <div className="mb-8">
        <ScheduleCalendar
          seasonStart={seasonStart}
          seasonEnd={seasonEnd}
          days={schedule.map((d) => ({
            date: new Date(d.date),
            status: d.status,
          }))}
        />
      </div>
    </>
  );
}

function formatSyncedAgo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const dateStr = date.toLocaleDateString("he-IL");
  if (diffDays === 0) return `${dateStr} (היום)`;
  if (diffDays === 1) return `${dateStr} (אתמול)`;
  return `${dateStr} (לפני ${diffDays} ימים)`;
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
        seasonStart={seasonStart}
        seasonEnd={seasonEnd}
        getDayStatus={(dateStr) => {
          if (existingDates.has(dateStr)) return "existing";
          if (deadlinePassed) return "disabled";
          if (pendingRemoves.has(dateStr)) return "removing";
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

