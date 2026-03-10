"use server";

import { auth } from "@/server/auth/auth";
import {
  getSeasonById,
  getSeasonDates,
  getSeasonConfig,
  getSeasonSettings,
} from "@/server/db/stores/season-store";
import {
  getSeasonMembers,
  isSeasonAdmin,
} from "@/server/db/stores/soldier-store";
import {
  getConstraintsForSeason,
  getConstraintKeys,
  getConstraintsForSoldier,
  addDayOffConstraint,
  removeDayOffConstraint,
} from "@/server/db/stores/constraint-store";
import {
  getActiveScheduleVersion,
  getActiveScheduleVersionId,
  getAssignmentsForSoldier,
  getAssignmentsForDateRange,
  createScheduleVersion,
  deleteAllScheduleVersions,
  toggleAssignment,
  createSingleAssignment,
  findAssignment,
} from "@/server/db/stores/schedule-store";
import { generateSchedule } from "@/domain/schedule/schedule-generator";
import { validateSchedule } from "@/domain/schedule/schedule-validator";
import { suggestReplacements } from "@/domain/schedule/replacement-suggester";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "@/domain/schedule/schedule.types";
import { getSoldierProfile } from "@/server/db/stores/soldier-store";
import { getScheduleVersions } from "@/server/db/stores/schedule-store";
import { dateToString } from "@/lib/date-utils";
import { prisma } from "@/server/db/client";
import type { Season } from "@/domain/season/season.types";
import type { SoldierRole } from "@/lib/constants";

export type ScheduleActionState = {
  error?: string;
  success?: boolean;
};

export async function generateScheduleAction(
  seasonId: string,
): Promise<ScheduleActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const season = await getSeasonById(seasonId);
  if (!season) return { error: "עונה לא נמצאה" };

  const members = await getSeasonMembers(seasonId);
  const constraints = await getConstraintsForSeason(seasonId);

  const soldiers = buildSeasonSoldiers(members);

  const assignments = generateSchedule({
    season: toDomainSeason(season),
    soldiers,
    constraints: constraints.map((c) => ({
      soldierProfileId: c.soldierProfileId,
      date: c.date,
    })),
  });

  await createScheduleVersion(seasonId, assignments);
  return { success: true };
}

export async function getActiveScheduleAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getActiveScheduleVersion(seasonId);
}

export async function getTransitionsDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return getAssignmentsForDateRange(seasonId, yesterday, tomorrow);
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

export async function getBoardDataAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return null;

  const [schedule, season, constraintKeys, myConstraints, admin] =
    await Promise.all([
      getActiveScheduleVersion(seasonId),
      getSeasonConfig(seasonId),
      getConstraintKeys(seasonId),
      getConstraintsForSoldier(seasonId, profile.id),
      isSeasonAdmin(seasonId, profile.id),
    ]);
  if (!season) return null;

  return {
    schedule,
    season,
    constraintKeys,
    isAdmin: admin,
    profileId: profile.id,
    completion: {
      hasCity: !!profile.city,
      hasConstraints: myConstraints.length > 0,
    },
  };
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
      replacedById: a.replacedById,
      manualOverride: a.manualOverride,
    })),
  });
}

export async function toggleAssignmentAction(
  assignmentId: string,
  isOnBase: boolean,
): Promise<ScheduleActionState> {
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

  const days: { date: Date; status: "on-base" | "constraint-off" | "rotation-off"; isUnavailable: boolean }[] = [];
  const current = new Date(start);
  while (current <= end) {
    const ds = dateToString(current);
    const assignment = assignmentMap.get(ds);

    if (assignment?.isOnBase) {
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

export async function regenerateFromDateAction(
  seasonId: string,
  fromDateStr: string,
): Promise<ScheduleActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const season = await getSeasonById(seasonId);
  if (!season) return { error: "עונה לא נמצאה" };

  const currentVersion = await getActiveScheduleVersion(seasonId);
  if (!currentVersion) return { error: "אין סידור פעיל" };

  const fromDate = new Date(fromDateStr + "T00:00:00.000Z");

  const existingAssignments: ScheduleAssignment[] = currentVersion.assignments
    .filter((a) => new Date(a.date) < fromDate)
    .map((a) => ({
      soldierProfileId: a.soldierProfileId,
      date: a.date,
      isOnBase: a.isOnBase,
      isUnavailable: a.isUnavailable,
      replacedById: a.replacedById,
      manualOverride: a.manualOverride,
    }));

  const members = await getSeasonMembers(seasonId);
  const constraints = await getConstraintsForSeason(seasonId);
  const soldiers = buildSeasonSoldiers(members);

  const newAssignments = generateSchedule({
    season: toDomainSeason(season),
    soldiers,
    constraints: constraints.map((c) => ({
      soldierProfileId: c.soldierProfileId,
      date: c.date,
    })),
    fromDate,
    existingAssignments,
  });

  await createScheduleVersion(seasonId, newAssignments, fromDate);
  return { success: true };
}

export async function hardResetScheduleAction(
  seasonId: string,
): Promise<ScheduleActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const season = await getSeasonById(seasonId);
  if (!season) return { error: "עונה לא נמצאה" };

  await deleteAllScheduleVersions(seasonId);

  const members = await getSeasonMembers(seasonId);
  const constraints = await getConstraintsForSeason(seasonId);
  const soldiers = buildSeasonSoldiers(members);

  const assignments = generateSchedule({
    season: toDomainSeason(season),
    soldiers,
    constraints: constraints.map((c) => ({
      soldierProfileId: c.soldierProfileId,
      date: c.date,
    })),
  });

  await createScheduleVersion(seasonId, assignments);
  return { success: true };
}

export async function getScheduleVersionsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];
  return getScheduleVersions(seasonId);
}

export async function restoreVersionAction(
  versionId: string,
  seasonId: string,
): Promise<ScheduleActionState> {
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
): Promise<ScheduleActionState> {
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
  const soldierNames = new Map<string, string>();
  for (const a of version.assignments) {
    soldierNames.set(a.soldierProfile.id, a.soldierProfile.fullName);
    if (a.isOnBase) {
      onBaseCounts.set(a.soldierProfileId, (onBaseCounts.get(a.soldierProfileId) ?? 0) + 1);
    }
  }

  return [...soldierNames.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "he"))
    .map(([id, fullName]) => {
      const daysOnBase = onBaseCounts.get(id) ?? 0;
      const constraintDaysOff = constraintCounts.get(id) ?? 0;
      const totalDaysOff = totalDays - daysOnBase;
      return { id, fullName, daysOnBase, totalDaysOff, constraintDaysOff };
    });
}

export async function adminSetCellStatusAction(
  seasonId: string,
  soldierProfileId: string,
  dateStr: string,
  status: "present" | "rotation-off" | "constraint-off",
): Promise<ScheduleActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const [profile, version] = await Promise.all([
    getSoldierProfile(session.user.id),
    getActiveScheduleVersionId(seasonId),
  ]);
  if (!profile) return { error: "פרופיל לא נמצא" };
  if (!version) return { error: "אין סידור פעיל" };

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) return { error: "אין הרשאה" };

  const date = new Date(dateStr + "T00:00:00.000Z");
  const existing = await findAssignment(version.id, soldierProfileId, date);

  const isOnBase = status === "present";

  if (existing) {
    await toggleAssignment(existing.id, isOnBase);
  } else {
    await createSingleAssignment(version.id, soldierProfileId, date, isOnBase);
  }

  if (status === "constraint-off") {
    await addDayOffConstraint({ seasonId, soldierProfileId, date });
  } else {
    try {
      await removeDayOffConstraint(seasonId, soldierProfileId, date);
    } catch {
      // constraint may not exist
    }
  }

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
          replacedById: a.replacedById,
          manualOverride: a.manualOverride,
        })),
      })
    : [];

  return { season: settings, versions, warnings };
}

function toDomainSeason(
  season: NonNullable<Awaited<ReturnType<typeof getSeasonById>>>,
): Season {
  return {
    ...season,
    roleMinimums: (season.roleMinimums ?? {}) as Partial<Record<SoldierRole, number>>,
    cityGroupingEnabled: season.cityGroupingEnabled ?? true,
    maxConsecutiveDays: season.maxConsecutiveDays ?? null,
  };
}

function buildSeasonSoldiers(
  members: Awaited<ReturnType<typeof getSeasonMembers>>,
): SeasonSoldier[] {
  return members.map((m) => ({
    id: m.soldierProfile.id,
    fullName: m.soldierProfile.fullName,
    phone: m.soldierProfile.phone,
    city: m.soldierProfile.city,
    roles: [...m.soldierProfile.roles] as SoldierRole[],
    isFarAway: m.soldierProfile.isFarAway,
    memberRole: m.role as "admin" | "soldier",
  }));
}
