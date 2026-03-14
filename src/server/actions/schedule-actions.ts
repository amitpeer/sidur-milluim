"use server";

import { auth } from "@/server/auth/auth";
import {
  getSeasonById,
  getSeasonDates,
  getSeasonSettings,
} from "@/server/db/stores/season-store";
import { getSeasonMembers } from "@/server/db/stores/soldier-store";
import {
  getConstraintsForSeason,
  getConstraintsForSoldier,
} from "@/server/db/stores/constraint-store";
import {
  getActiveScheduleVersion,
  getActiveScheduleVersionId,
  getAssignmentsForSoldier,
  getAssignmentsForDateRange,
  toggleAssignment,
  setAbsentReason,
} from "@/server/db/stores/schedule-store";
import type { AbsentReason } from "@/domain/schedule/schedule.types";
import { validateSchedule } from "@/domain/schedule/schedule-validator";
import { suggestReplacements } from "@/domain/schedule/replacement-suggester";
import { getSoldierProfile } from "@/server/db/stores/soldier-store";
import { getScheduleVersions } from "@/server/db/stores/schedule-store";
import { dateToString } from "@/lib/date-utils";
import { prisma } from "@/server/db/client";
import { buildSeasonSoldiers, toDomainSeason } from "./schedule-mappers";

export async function getActiveScheduleAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getActiveScheduleVersion(seasonId);
}

export async function getTransitionsDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [seasonDates, activeVersion] = await Promise.all([
    getSeasonDates(seasonId),
    getActiveScheduleVersionId(seasonId),
  ]);

  if (!activeVersion || !seasonDates) {
    return { assignments: [], hasActiveSchedule: false, referenceDate: null };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const seasonStart = new Date(seasonDates.startDate);
  seasonStart.setUTCHours(0, 0, 0, 0);
  const seasonEnd = new Date(seasonDates.endDate);
  seasonEnd.setUTCHours(0, 0, 0, 0);

  // Clamp reference to season range so we always show useful data
  let reference = today;
  if (today < seasonStart) reference = seasonStart;
  else if (today > seasonEnd) reference = seasonEnd;

  const dayBefore = new Date(reference);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const rangeEnd = new Date(reference);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 10);

  const assignments = await getAssignmentsForDateRange(seasonId, dayBefore, rangeEnd);

  return {
    assignments,
    hasActiveSchedule: true,
    referenceDate: dateToString(reference),
  };
}

export async function getDayAssignmentsAction(
  seasonId: string,
  dateStr: string,
) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const date = new Date(dateStr + "T00:00:00.000Z");
  return getAssignmentsForDateRange(seasonId, date, date);
}

export async function getScheduleWarningsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  const season = await getSeasonById(seasonId);
  if (!season) return [];

  const version = await getActiveScheduleVersion(seasonId);
  if (!version) return [];

  const members = await getSeasonMembers(seasonId);
  const soldiers = buildSeasonSoldiers(members);

  return validateSchedule({
    season: toDomainSeason(season),
    soldiers,
    assignments: version.assignments.map((a) => ({
      soldierProfileId: a.soldierProfileId,
      date: a.date,
      isOnBase: a.isOnBase,
      isUnavailable: a.isUnavailable,
      absentReason: (a.absentReason as AbsentReason | null) ?? null,
      replacedById: a.replacedById,
      manualOverride: a.manualOverride,
    })),
  });
}

export async function toggleAssignmentAction(
  assignmentId: string,
  isOnBase: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  await toggleAssignment(assignmentId, isOnBase);
  return { success: true };
}

export async function getMyScheduleAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const [myAssignments, seasonDates, myConstraints] = await Promise.all([
    getAssignmentsForSoldier(seasonId, profile.id),
    getSeasonDates(seasonId),
    getConstraintsForSoldier(seasonId, profile.id),
  ]);
  if (!seasonDates) return null;

  const myConstraintDates = new Set(
    myConstraints.map((c) => dateToString(new Date(c.date))),
  );

  const assignmentMap = new Map(
    myAssignments.map((a) => [dateToString(new Date(a.date)), a]),
  );

  const start = new Date(seasonDates.startDate);
  const end = new Date(seasonDates.endDate);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  type ScheduleStatus = "on-base" | "constraint-off" | "rotation-off" | "sick" | "course";
  const days: { date: Date; status: ScheduleStatus; isUnavailable: boolean }[] = [];
  const current = new Date(start);
  while (current <= end) {
    const ds = dateToString(current);
    const assignment = assignmentMap.get(ds);

    if (assignment?.absentReason === "sick") {
      days.push({ date: new Date(current), status: "sick", isUnavailable: false });
    } else if (assignment?.absentReason === "course") {
      days.push({ date: new Date(current), status: "course", isUnavailable: false });
    } else if (assignment?.isOnBase) {
      days.push({ date: new Date(current), status: "on-base", isUnavailable: assignment.isUnavailable });
    } else if (myConstraintDates.has(ds)) {
      days.push({ date: new Date(current), status: "constraint-off", isUnavailable: false });
    } else {
      days.push({ date: new Date(current), status: "rotation-off", isUnavailable: false });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
}

export async function getScheduleVersionsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getScheduleVersions(seasonId);
}

export async function restoreVersionAction(
  versionId: string,
  seasonId: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  await prisma.scheduleVersion.updateMany({
    where: { seasonId, isActive: true },
    data: { isActive: false },
  });

  await prisma.scheduleVersion.update({
    where: { id: versionId },
    data: { isActive: true, deletedAt: null },
  });

  return { success: true };
}

export async function markUnavailableAction(
  seasonId: string,
  soldierProfileId: string,
  dateStr: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const version = await getActiveScheduleVersion(seasonId);
  if (!version) return { error: "אין סידור פעיל" };

  const assignment = version.assignments.find(
    (a) =>
      a.soldierProfileId === soldierProfileId &&
      dateToString(new Date(a.date)) === dateStr,
  );

  if (assignment) {
    await prisma.scheduleAssignment.update({
      where: { id: assignment.id },
      data: { isUnavailable: true, isOnBase: false },
    });
  }

  return { success: true };
}

export async function getReplacementSuggestionsAction(
  seasonId: string,
  soldierProfileId: string,
  dateStr: string,
) {
  const session = await auth();
  if (!session?.user?.id) return [];

  const season = await getSeasonById(seasonId);
  if (!season) return [];

  const version = await getActiveScheduleVersion(seasonId);
  if (!version) return [];

  const members = await getSeasonMembers(seasonId);
  const constraints = await getConstraintsForSeason(seasonId);
  const soldiers = buildSeasonSoldiers(members);

  const soldier = soldiers.find((s) => s.id === soldierProfileId);
  const requiredRoles = soldier?.roles ?? [];

  return suggestReplacements({
    unavailableSoldierId: soldierProfileId,
    date: new Date(dateStr + "T00:00:00.000Z"),
    soldiers,
    assignments: version.assignments.map((a) => ({
      soldierProfileId: a.soldierProfileId,
      date: a.date,
      isOnBase: a.isOnBase,
      isUnavailable: a.isUnavailable,
      absentReason: (a.absentReason as AbsentReason | null) ?? null,
      replacedById: a.replacedById,
      manualOverride: a.manualOverride,
    })),
    constraints: constraints.map((c) => ({
      soldierProfileId: c.soldierProfileId,
      date: c.date,
    })),
    requiredRoles,
  });
}

export interface SoldierStats {
  id: string;
  fullName: string;
  daysOnBase: number;
  totalDaysOff: number;
  constraintDaysOff: number;
  sickDays: number;
  courseDays: number;
}

export async function getSoldierStatsAction(
  seasonId: string,
): Promise<SoldierStats[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const [seasonDates, version, constraints] = await Promise.all([
    getSeasonDates(seasonId),
    getActiveScheduleVersion(seasonId),
    getConstraintsForSeason(seasonId),
  ]);
  if (!seasonDates || !version) return [];

  const start = new Date(seasonDates.startDate);
  const end = new Date(seasonDates.endDate);
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const constraintCounts = new Map<string, number>();
  for (const c of constraints) {
    constraintCounts.set(c.soldierProfileId, (constraintCounts.get(c.soldierProfileId) ?? 0) + 1);
  }

  const onBaseCounts = new Map<string, number>();
  const sickCounts = new Map<string, number>();
  const courseCounts = new Map<string, number>();
  const soldierNames = new Map<string, string>();
  for (const a of version.assignments) {
    soldierNames.set(a.soldierProfile.id, a.soldierProfile.fullName);
    if (a.isOnBase) {
      onBaseCounts.set(a.soldierProfileId, (onBaseCounts.get(a.soldierProfileId) ?? 0) + 1);
    }
    if (a.absentReason === "sick") {
      sickCounts.set(a.soldierProfileId, (sickCounts.get(a.soldierProfileId) ?? 0) + 1);
    }
    if (a.absentReason === "course") {
      courseCounts.set(a.soldierProfileId, (courseCounts.get(a.soldierProfileId) ?? 0) + 1);
    }
  }

  return [...soldierNames.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "he"))
    .map(([id, fullName]) => {
      const daysOnBase = onBaseCounts.get(id) ?? 0;
      const constraintDaysOff = constraintCounts.get(id) ?? 0;
      const sickDays = sickCounts.get(id) ?? 0;
      const courseDays = courseCounts.get(id) ?? 0;
      const totalDaysOff = totalDays - daysOnBase;
      return { id, fullName, daysOnBase, totalDaysOff, constraintDaysOff, sickDays, courseDays };
    });
}

export async function setAbsentReasonAction(
  assignmentId: string,
  reason: AbsentReason | null,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  await setAbsentReason(assignmentId, reason);
  return { success: true };
}

export async function getManagementPageDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [settings, versions, season, version, members] = await Promise.all([
    getSeasonSettings(seasonId),
    getScheduleVersions(seasonId),
    getSeasonById(seasonId),
    getActiveScheduleVersion(seasonId),
    getSeasonMembers(seasonId),
  ]);
  if (!settings || !season) return null;

  const warnings = version
    ? validateSchedule({
        season: toDomainSeason(season),
        soldiers: buildSeasonSoldiers(members),
        assignments: version.assignments.map((a) => ({
          soldierProfileId: a.soldierProfileId,
          date: a.date,
          isOnBase: a.isOnBase,
          isUnavailable: a.isUnavailable,
          absentReason: (a.absentReason as AbsentReason | null) ?? null,
          replacedById: a.replacedById,
          manualOverride: a.manualOverride,
        })),
      })
    : [];

  return { season: settings, versions, warnings };
}

