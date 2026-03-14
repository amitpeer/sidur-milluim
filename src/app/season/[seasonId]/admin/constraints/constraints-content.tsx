"use client";

import { useEffect, useState } from "react";
import {
  getAdminConstraintsPageDataAction,
  adminDeleteConstraintAction,
  adminAddConstraintAction,
} from "@/server/actions/constraint-actions";
import { dateToString, eachDayInRange, parseServerDate } from "@/lib/date-utils";
import { MonthCalendarGrid } from "@/components/month-calendar-grid";

type PageData = NonNullable<Awaited<ReturnType<typeof getAdminConstraintsPageDataAction>>>;
type Constraint = PageData["constraints"][number];
type Member = PageData["members"][number];

interface SoldierGroup {
  readonly fullName: string;
  readonly constraints: Constraint[];
}

function groupBySoldier(constraints: Constraint[]): Map<string, SoldierGroup> {
  const groups = new Map<string, SoldierGroup>();
  for (const c of constraints) {
    const key = c.soldierProfileId;
    if (!groups.has(key)) {
      groups.set(key, { fullName: c.soldierProfile.fullName, constraints: [] });
    }
    groups.get(key)!.constraints.push(c);
  }
  for (const group of groups.values()) {
    group.constraints.sort((a, b) => {
      const da = dateToString(parseServerDate(a.date));
      const db = dateToString(parseServerDate(b.date));
      return da.localeCompare(db);
    });
  }
  return groups;
}

interface Props {
  readonly seasonId: string;
  readonly initialData?: PageData;
}

export function AdminConstraintsContent({ seasonId, initialData }: Props) {
  const [constraints, setConstraints] = useState<Constraint[]>(initialData?.constraints ?? []);
  const [members, setMembers] = useState<Member[]>(initialData?.members ?? []);
  const [seasonDates, setSeasonDates] = useState<PageData["seasonDates"] | null>(initialData?.seasonDates ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addSoldierId, setAddSoldierId] = useState("");
  const [addDates, setAddDates] = useState<Set<string>>(new Set());
  const [expandedSoldiers, setExpandedSoldiers] = useState<Set<string>>(new Set());

  const load = async () => {
    const data = await getAdminConstraintsPageDataAction(seasonId);
    if (!data) return;
    setConstraints(data.constraints);
    setMembers(data.members);
    setSeasonDates(data.seasonDates);
    setLoading(false);
  };

  useEffect(() => {
    if (!initialData) load();
  }, [seasonId]);

  if (loading || !seasonDates) {
    return <div className="p-6 text-zinc-400">טוען...</div>;
  }

  const memberIds = new Set(members.map((m) => m.soldierProfileId));
  const activeConstraints = constraints.filter((c) => memberIds.has(c.soldierProfileId));

  const bySoldier = groupBySoldier(activeConstraints);
  const sortedSoldierIds = [...bySoldier.entries()]
    .sort(([, a], [, b]) => a.fullName.localeCompare(b.fullName, "he"))
    .map(([id]) => id);

  const seasonStart = parseServerDate(seasonDates.startDate);
  const seasonEnd = parseServerDate(seasonDates.endDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  seasonEnd.setUTCHours(0, 0, 0, 0);
  const days = eachDayInRange(seasonStart, seasonEnd);

  const toggleExpanded = (soldierId: string) => {
    setExpandedSoldiers((prev) => {
      const next = new Set(prev);
      if (next.has(soldierId)) next.delete(soldierId);
      else next.add(soldierId);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    await adminDeleteConstraintAction(id, seasonId);
    await load();
  };

  const handleAdd = async () => {
    if (!addSoldierId || addDates.size === 0) return;
    await adminAddConstraintAction(seasonId, addSoldierId, [...addDates]);
    setShowAddPanel(false);
    setAddSoldierId("");
    setAddDates(new Set());
    await load();
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h2 className="mb-6 text-xl font-semibold">ניהול אילוצים</h2>
      <p className="mb-4 text-sm text-zinc-500">{activeConstraints.length} אילוצים סה״כ</p>

      {sortedSoldierIds.length === 0 && !showAddPanel && (
        <p className="text-zinc-400">אין אילוצים עדיין.</p>
      )}

      <div className="flex flex-col gap-3">
        {sortedSoldierIds.map((soldierId) => {
          const group = bySoldier.get(soldierId)!;
          const isExpanded = expandedSoldiers.has(soldierId);

          return (
            <div
              key={soldierId}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800"
            >
              <button
                type="button"
                onClick={() => toggleExpanded(soldierId)}
                className="flex w-full items-center justify-between px-4 py-3 text-right"
              >
                <span className="font-medium">
                  {group.fullName}
                  <span className="mr-2 text-sm font-normal text-zinc-500">
                    ({group.constraints.length} אילוצים)
                  </span>
                </span>
                <span className="text-zinc-400">{isExpanded ? "▲" : "▼"}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div className="flex flex-wrap gap-2">
                    {group.constraints.map((c) => {
                      const dateStr = dateToString(parseServerDate(c.date));
                      const dateLabel = new Date(dateStr + "T00:00:00.000Z").toLocaleDateString("he-IL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      });

                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs text-red-700 dark:bg-red-900 dark:text-red-200"
                        >
                          <span>{dateLabel}</span>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-red-500 hover:text-red-800"
                            title="מחק אילוץ"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showAddPanel ? (
        <button
          onClick={() => setShowAddPanel(true)}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          הוסף אילוץ לחייל
        </button>
      ) : (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-3 text-base font-medium">הוספת אילוץ</h3>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">חייל</label>
            <select
              value={addSoldierId}
              onChange={(e) => setAddSoldierId(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">בחר חייל</option>
              {members.map((m) => (
                <option key={m.soldierProfile.id} value={m.soldierProfile.id}>
                  {m.soldierProfile.fullName}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-2 text-xs text-zinc-500">בחר תאריכים:</p>
          <MonthCalendarGrid
            days={days}
            getDayStatus={(dateStr) =>
              addDates.has(dateStr) ? "selected" : "default"
            }
            onDayClick={(dateStr) => {
              setAddDates((prev) => {
                const next = new Set(prev);
                if (next.has(dateStr)) next.delete(dateStr);
                else next.add(dateStr);
                return next;
              });
            }}
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAdd}
              disabled={!addSoldierId || addDates.size === 0}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              הוסף ({addDates.size} ימים)
            </button>
            <button
              onClick={() => {
                setShowAddPanel(false);
                setAddDates(new Set());
                setAddSoldierId("");
              }}
              className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
