import { prisma } from "@/server/db/client";

export async function addDayOffConstraint(data: {
  seasonId: string;
  soldierProfileId: string;
  date: Date;
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
    },
    update: {},
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
