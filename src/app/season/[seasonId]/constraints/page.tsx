"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  getConstraintsPageDataAction,
  addConstraintGroupAction,
  removeConstraintGroupAction,
} from "@/server/actions/constraint-actions";
import { eachDayInRange, dateToString, parseServerDate } from "@/lib/date-utils";
import { groupConstraintsByGroupId } from "@/domain/constraint/constraint-grouping";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";
import type { DayOffConstraint } from "@/domain/constraint/constraint.types";

type PageData = NonNullable<Awaited<ReturnType<typeof getConstraintsPageDataAction>>>;
type MyConstraint = PageData["constraints"][number];
type SeasonData = PageData["season"];

export default function ConstraintsPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const [constraints, setConstraints] = useState<MyConstraint[]>([]);
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [lastClickedDate, setLastClickedDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const constraintDates = new Set(
    constraints.map((c) => dateToString(parseServerDate(c.date))),
  );

  const groups = groupConstraintsByGroupId(
    constraints as DayOffConstraint[],
  );

  const seasonStart = parseServerDate(season.startDate);
  const seasonEnd = parseServerDate(season.endDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  seasonEnd.setUTCHours(0, 0, 0, 0);
  const days = eachDayInRange(seasonStart, seasonEnd);

  const handleCalendarClick = (dateStr: string, shiftKey: boolean) => {
    if (constraintDates.has(dateStr)) return;

    setSelectedDates((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastClickedDate) {
        const allDateStrs = days.map((d) => dateToString(d));
        const startIdx = allDateStrs.indexOf(lastClickedDate);
        const endIdx = allDateStrs.indexOf(dateStr);
        const [from, to] =
          startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

        for (let i = from; i <= to; i++) {
          if (!constraintDates.has(allDateStrs[i])) {
            next.add(allDateStrs[i]);
          }
        }
      } else {
        if (next.has(dateStr)) {
          next.delete(dateStr);
        } else {
          next.add(dateStr);
        }
      }

      return next;
    });
    setLastClickedDate(dateStr);
  };

  const handleSubmitGroup = async () => {
    if (selectedDates.size === 0) return;
    setSaving(true);
    await addConstraintGroupAction(
      seasonId,
      [...selectedDates],
      newReason || undefined,
    );
    setSelectedDates(new Set());
    setNewReason("");
    setShowAddPanel(false);
    setSaving(false);
    await load();
  };

  const handleRemoveGroup = async (groupId: string) => {
    await removeConstraintGroupAction(seasonId, groupId);
    await load();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-2 text-xl font-semibold">האילוצים שלי</h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        הוסיפו אילוצים עם סיבה ותאריכים.
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

      <ConstraintGroupList
        groups={groups}
        onRemoveGroup={handleRemoveGroup}
        disabled={!!deadlinePassed}
      />

      {!deadlinePassed && (
        <>
          {!showAddPanel ? (
            <button
              onClick={() => setShowAddPanel(true)}
              className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              הוסף אילוץ
            </button>
          ) : (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-3 text-base font-medium">אילוץ חדש</h3>

              <div className="mb-4">
                <input
                  type="text"
                  placeholder="סיבה (אופציונלי)"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>

              <p className="mb-2 text-xs text-zinc-500">
                לחצו על ימים לבחירה.
              </p>

              <MonthCalendarGrid
                days={days}
                getDayStatus={(dateStr) => {
                  if (constraintDates.has(dateStr)) return "existing";
                  if (selectedDates.has(dateStr)) return "selected";
                  return "default";
                }}
                onDayClick={(dateStr, e) =>
                  handleCalendarClick(dateStr, e.shiftKey)
                }
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSubmitGroup}
                  disabled={selectedDates.size === 0 || saving}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {saving
                    ? "שומר..."
                    : `שמור (${selectedDates.size} ימים)`}
                </button>
                <button
                  onClick={() => {
                    setShowAddPanel(false);
                    setSelectedDates(new Set());
                    setNewReason("");
                  }}
                  className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-sm text-zinc-500">
        {constraints.length} ימי אילוץ סה״כ
      </p>
    </div>
  );
}

function ConstraintGroupList({
  groups,
  onRemoveGroup,
  disabled,
}: {
  groups: Map<string, DayOffConstraint[]>;
  onRemoveGroup: (groupId: string) => void;
  disabled: boolean;
}) {
  if (groups.size === 0) {
    return (
      <p className="text-sm text-zinc-400">אין אילוצים עדיין.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[...groups.entries()].map(([groupId, items]) => {
        const reason = items[0]?.reason;
        const dateLabels = items.map((c) =>
          new Date(c.date).toLocaleDateString("he-IL", {
            day: "numeric",
            month: "short",
          }),
        );

        return (
          <div
            key={groupId}
            className="flex items-start justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div>
              {reason && (
                <p className="mb-1 text-sm font-medium">{reason}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {dateLabels.map((label, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            {!disabled && (
              <button
                onClick={() => onRemoveGroup(groupId)}
                className="mr-2 text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                מחק
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
