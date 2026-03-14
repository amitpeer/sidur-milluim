"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getConstraintsPageDataAction,
  saveConstraintChangesAction,
} from "@/server/actions/constraint-actions";
import { eachDayInRange, dateToString, parseServerDate } from "@/lib/date-utils";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";

type PageData = NonNullable<Awaited<ReturnType<typeof getConstraintsPageDataAction>>>;
type MyConstraint = PageData["constraints"][number];
type SeasonData = PageData["season"];

export default function ConstraintsPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [constraints, setConstraints] = useState<MyConstraint[]>([]);
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(new Set());
  const [pendingRemoves, setPendingRemoves] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await getConstraintsPageDataAction(seasonId);
    if (!data) {
      setLoading(false);
      return;
    }
    setSeason(data.season);
    setConstraints(data.constraints);
    setMyProfileId(data.profileId);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !season) {
    return <div className="p-6 text-zinc-400">טוען...</div>;
  }

  if (!myProfileId) {
    return (
      <div className="p-6 text-zinc-500">
        אינך חבר בעונה זו.
      </div>
    );
  }

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

  const handleDayClick = (dateStr: string) => {
    if (deadlinePassed) return;

    const isExisting = existingDates.has(dateStr);
    const isMarkedForRemoval = pendingRemoves.has(dateStr);
    const isMarkedForAdd = pendingAdds.has(dateStr);

    if (isExisting) {
      setPendingRemoves((prev) => {
        const next = new Set(prev);
        if (isMarkedForRemoval) {
          next.delete(dateStr);
        } else {
          next.add(dateStr);
        }
        return next;
      });
    } else {
      setPendingAdds((prev) => {
        const next = new Set(prev);
        if (isMarkedForAdd) {
          next.delete(dateStr);
        } else {
          next.add(dateStr);
        }
        return next;
      });
    }
  };

  const handleSave = async () => {
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
  };

  const handleDiscard = () => {
    setPendingAdds(new Set());
    setPendingRemoves(new Set());
  };

  const totalAfterSave =
    constraints.length + pendingAdds.size - pendingRemoves.size;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-2 text-xl font-semibold">האילוצים שלי</h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
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
        onDayClick={(dateStr) => handleDayClick(dateStr)}
      />

      {hasPendingChanges && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving ? "שומר..." : "שמור שינויים"}
          </button>
          <button
            onClick={handleDiscard}
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
    </div>
  );
}
