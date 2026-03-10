"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getDayAssignmentsAction } from "@/server/actions/schedule-actions";

type Assignment = NonNullable<
  Awaited<ReturnType<typeof getDayAssignmentsAction>>
>[number];

export default function DayPage() {
  const { seasonId, date } = useParams<{ seasonId: string; date: string }>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDayAssignmentsAction(seasonId, date).then((data) => {
      setAssignments(data ?? []);
      setLoading(false);
    });
  }, [seasonId, date]);

  if (loading) return <div className="p-6 text-zinc-400">טוען...</div>;

  const dayAssignments = assignments.filter((a) => a.isOnBase);

  if (dayAssignments.length === 0) {
    return <div className="p-6 text-zinc-500">אין חיילים בבסיס ביום זה.</div>;
  }

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
              <span className="text-xs text-zinc-400">
                {a.soldierProfile.roles.join(", ") || "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>

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
