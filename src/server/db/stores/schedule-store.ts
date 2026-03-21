import { prisma } from "@/server/db/client";
import type { AbsentReason, ScheduleAssignment } from "@/domain/schedule/schedule.types";
import { dateToString } from "@/lib/date-utils";

export function deduplicateAssignments(assignments: ScheduleAssignment[]): ScheduleAssignment[] {
  const seen = new Map<string, ScheduleAssignment>();
  for (const a of assignments) {
    seen.set(`${a.soldierProfileId}-${dateToString(a.date)}`, a);
  }
  return [...seen.values()];
}

export async function getActiveScheduleVersionId(seasonId: string) {
  return prisma.scheduleVersion.findFirst({
    where: { seasonId, isActive: true, deletedAt: null },
    select: { id: true },
    orderBy: { version: "desc" },
  });
}

export async function getActiveScheduleVersion(seasonId: string) {
  return prisma.scheduleVersion.findFirst({
    where: { seasonId, isActive: true, deletedAt: null },
    include: {
      assignments: {
        include: {
          soldierProfile: { select: { id: true, fullName: true, roles: true } },
        },
      },
    },
    orderBy: { version: "desc" },
  });
}

export async function getScheduleVersionById(versionId: string) {
  return prisma.scheduleVersion.findUnique({
    where: { id: versionId },
    include: {
      assignments: {
        include: {
          soldierProfile: { select: { id: true, fullName: true, roles: true } },
        },
      },
    },
  });
}

export async function deleteAllScheduleVersions(seasonId: string) {
  return prisma.scheduleVersion.deleteMany({
    where: { seasonId },
  });
}

export async function createScheduleVersion(
  seasonId: string,
  assignments: ScheduleAssignment[],
  regeneratedFromDate?: Date,
  options?: { isActive?: boolean },
) {
  const shouldActivate = options?.isActive ?? true;

  return prisma.$transaction(async (tx) => {
    const lastVersion = await tx.scheduleVersion.findFirst({
      where: { seasonId },
      orderBy: { version: "desc" },
    });

    const newVersion = (lastVersion?.version ?? 0) + 1;

    if (shouldActivate) {
      await tx.scheduleVersion.updateMany({
        where: { seasonId, isActive: true },
        data: { isActive: false, deletedAt: new Date() },
      });
    }

    const deduplicated = deduplicateAssignments(assignments);

    return tx.scheduleVersion.create({
      data: {
        seasonId,
        version: newVersion,
        isActive: shouldActivate,
        regeneratedFromDate,
        assignments: {
          createMany: {
            data: deduplicated.map((a) => ({
              soldierProfileId: a.soldierProfileId,
              date: a.date,
              isOnBase: a.isOnBase,
              isUnavailable: a.isUnavailable,
              absentReason: a.absentReason,
              replacedById: a.replacedById,
              manualOverride: a.manualOverride,
            })),
          },
        },
      },
      include: { assignments: true },
    });
  });
}

export async function getAssignmentsForDateRange(
  seasonId: string,
  startDate: Date,
  endDate: Date,
) {
  return prisma.scheduleAssignment.findMany({
    where: {
      scheduleVersion: { seasonId, isActive: true, deletedAt: null },
      date: { gte: startDate, lte: endDate },
    },
    include: {
      soldierProfile: { select: { id: true, fullName: true, roles: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function getAssignmentsForSoldier(
  seasonId: string,
  soldierProfileId: string,
) {
  return prisma.scheduleAssignment.findMany({
    where: {
      scheduleVersion: { seasonId, isActive: true, deletedAt: null },
      soldierProfileId,
    },
    select: { date: true, isOnBase: true, isUnavailable: true, absentReason: true },
    orderBy: { date: "asc" },
  });
}

export async function getScheduleVersions(seasonId: string) {
  return prisma.scheduleVersion.findMany({
    where: { seasonId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      generatedAt: true,
      isActive: true,
      deletedAt: true,
    },
  });
}

export async function toggleAssignment(
  assignmentId: string,
  isOnBase: boolean,
) {
  return prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: {
      isOnBase,
      manualOverride: true,
      ...(isOnBase && { absentReason: null }),
    },
  });
}

export async function setAbsentReason(
  assignmentId: string,
  reason: AbsentReason | null,
) {
  return prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: {
      absentReason: reason,
      isOnBase: reason ? false : undefined,
      manualOverride: true,
    },
  });
}

export async function createSingleAssignment(
  scheduleVersionId: string,
  soldierProfileId: string,
  date: Date,
  isOnBase: boolean,
) {
  return prisma.scheduleAssignment.create({
    data: {
      scheduleVersionId,
      soldierProfileId,
      date,
      isOnBase,
      manualOverride: true,
    },
  });
}

export async function findAssignment(
  scheduleVersionId: string,
  soldierProfileId: string,
  date: Date,
) {
  return prisma.scheduleAssignment.findFirst({
    where: { scheduleVersionId, soldierProfileId, date },
  });
}
