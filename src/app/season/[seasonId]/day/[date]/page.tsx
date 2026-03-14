"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getDayAssignmentsAction,
  setAbsentReasonAction,
} from "@/server/actions/schedule-actions";

type Assignment = NonNullable<
  Awaited<ReturnType<typeof getDayAssignmentsAction>>
>[number];

export default function DayPage() {
  const { seasonId, date } = useParams<{ seasonId: string; date: string }>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadData = () => {
    getDayAssignmentsAction(seasonId, date).then((data) => {
      setAssignments(data ?? []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [seasonId, date]);

  const handleSetReason = async (
    assignmentId: string,
    reason: "sick" | "course" | null,
  ) => {
    setPendingId(assignmentId);
    await setAbsentReasonAction(assignmentId, reason);
    setPendingId(null);
    loadData();
  };

  if (loading) return <div className="p-6 text-zinc-400">טוען...</div>;

  const dayAssignments = assignments.filter((a) => a.isOnBase);
  const sickAssignments = assignments.filter((a) => a.absentReason === "sick");
  const courseAssignments = assignments.filter((a) => a.absentReason === "course");

  const displayDate = new Date(date + "T00:00:00.000Z").toLocaleDateString(
    "he-IL",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  );

  const roleGroups = new Map<string, string[]>();
  for (const a of dayAssignments) {
    const roles =
      a.soldierProfile.roles.length > 0
        ? a.soldierProfile.roles
        : ["ללא תפקיד"];
    for (const role of roles) {
      if (!roleGroups.has(role)) roleGroups.set(role, []);
      roleGroups.get(role)!.push(a.soldierProfile.fullName);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="mb-2 text-xl font-semibold">{displayDate}</h2>
      <p className="mb-6 text-sm text-zinc-500">
        {dayAssignments.length} חיילים בבסיס
      </p>

      <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <h3 className="border-b border-zinc-200 px-4 py-3 text-sm font-medium dark:border-zinc-800">
          נוכחים
        </h3>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {dayAssignments.map((a) => (
            <li key={a.soldierProfileId} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{a.soldierProfile.fullName}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  {a.soldierProfile.roles.join(", ") || "—"}
                </span>
                <AbsentReasonMenu
                  assignmentId={a.id}
                  currentReason={null}
                  pending={pendingId === a.id}
                  onSetReason={handleSetReason}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>

      {sickAssignments.length > 0 && (
        <AbsentSection
          title="חולים"
          assignments={sickAssignments}
          reason="sick"
          color="yellow"
          pendingId={pendingId}
          onSetReason={handleSetReason}
        />
      )}

      {courseAssignments.length > 0 && (
        <AbsentSection
          title="בקורס"
          assignments={courseAssignments}
          reason="course"
          color="blue"
          pendingId={pendingId}
          onSetReason={handleSetReason}
        />
      )}

      {roleGroups.size > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <h3 className="border-b border-zinc-200 px-4 py-3 text-sm font-medium dark:border-zinc-800">
            לפי תפקיד
          </h3>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...roleGroups.entries()].map(([role, names]) => (
              <div key={role} className="px-4 py-2.5">
                <span className="text-sm font-medium">{role}</span>
                <span className="mr-2 text-sm text-zinc-500">
                  ({names.length}): {names.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ABSENT_COLORS = {
  yellow: {
    container: "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950",
    header: "border-yellow-200 text-yellow-700 dark:border-yellow-900 dark:text-yellow-300",
    divider: "divide-yellow-100 dark:divide-yellow-900",
  },
  blue: {
    container: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
    header: "border-blue-200 text-blue-700 dark:border-blue-900 dark:text-blue-300",
    divider: "divide-blue-100 dark:divide-blue-900",
  },
} as const;

function AbsentSection({
  title,
  assignments,
  reason,
  color,
  pendingId,
  onSetReason,
}: {
  title: string;
  assignments: Assignment[];
  reason: "sick" | "course";
  color: keyof typeof ABSENT_COLORS;
  pendingId: string | null;
  onSetReason: (id: string, reason: "sick" | "course" | null) => void;
}) {
  const c = ABSENT_COLORS[color];
  return (
    <div className={`mb-6 rounded-lg border ${c.container}`}>
      <h3 className={`border-b px-4 py-3 text-sm font-medium ${c.header}`}>
        {title} ({assignments.length})
      </h3>
      <ul className={`divide-y ${c.divider}`}>
        {assignments.map((a) => (
          <li key={a.soldierProfileId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>{a.soldierProfile.fullName}</span>
            <button
              type="button"
              disabled={pendingId === a.id}
              onClick={() => onSetReason(a.id, null)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {pendingId === a.id ? "..." : "הסר"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbsentReasonMenu({
  assignmentId,
  currentReason,
  pending,
  onSetReason,
}: {
  assignmentId: string;
  currentReason: "sick" | "course" | null;
  pending: boolean;
  onSetReason: (id: string, reason: "sick" | "course" | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (currentReason) return null;

  return (
    <span className="relative">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(!open)}
        className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
      >
        {pending ? "..." : "סמן"}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => { setOpen(false); onSetReason(assignmentId, "sick"); }}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-right text-xs transition-colors hover:bg-yellow-50 dark:hover:bg-yellow-950"
          >
            ג׳ — מחלה
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onSetReason(assignmentId, "course"); }}
            className="whitespace-nowrap rounded-md px-3 py-1.5 text-right text-xs transition-colors hover:bg-yellow-50 dark:hover:bg-yellow-950"
          >
            ק׳ — קורס
          </button>
        </span>
      )}
    </span>
  );
}
