import { prisma } from "@/server/db/client";

export async function addDayOffConstraint(data: {
  seasonId: string;
  soldierProfileId: string;
  date: Date;
  reason?: string;
}) {
  return prisma.dayOffConstraint.upsert({
    where: {
      seasonId_soldierProfileId_date: {
        seasonId: data.seasonId,
        soldierProfileId: data.soldierProfileId,
        date: data.date,
      },
    },
    create: {
      seasonId: data.seasonId,
      soldierProfileId: data.soldierProfileId,
      date: data.date,
      reason: data.reason ?? null,
    },
    update: {
      reason: data.reason ?? null,
    },
  });
}

export async function removeDayOffConstraint(
  seasonId: string,
  soldierProfileId: string,
  date: Date,
) {
  return prisma.dayOffConstraint.delete({
    where: {
      seasonId_soldierProfileId_date: {
        seasonId,
        soldierProfileId,
        date,
      },
    },
  });
}

export async function getConstraintsForSeason(seasonId: string) {
  return prisma.dayOffConstraint.findMany({
    where: { seasonId },
    include: {
      soldierProfile: { select: { id: true, fullName: true } },
    },
    orderBy: { date: "asc" },
  });
}

export async function addDayOffConstraintBatch(data: {
  seasonId: string;
  soldierProfileId: string;
  dates: Date[];
  reason?: string;
  groupId: string;
}) {
  return prisma.dayOffConstraint.createMany({
    data: data.dates.map((date) => ({
      seasonId: data.seasonId,
      soldierProfileId: data.soldierProfileId,
      date,
      reason: data.reason ?? null,
      groupId: data.groupId,
    })),
    skipDuplicates: true,
  });
}

export async function removeConstraintGroup(groupId: string) {
  return prisma.dayOffConstraint.deleteMany({
    where: { groupId },
  });
}

export async function updateConstraint(
  id: string,
  data: { reason?: string | null },
) {
  return prisma.dayOffConstraint.update({
    where: { id },
    data,
  });
}

export async function deleteConstraint(id: string) {
  return prisma.dayOffConstraint.delete({
    where: { id },
  });
}

export async function getConstraintKeys(seasonId: string) {
  return prisma.dayOffConstraint.findMany({
    where: { seasonId },
    select: { soldierProfileId: true, date: true },
  });
}

export async function getConstraintsForSoldier(
  seasonId: string,
  soldierProfileId: string,
) {
  return prisma.dayOffConstraint.findMany({
    where: { seasonId, soldierProfileId },
    orderBy: { date: "asc" },
  });
}
