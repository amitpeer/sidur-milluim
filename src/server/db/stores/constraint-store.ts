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

export async function syncConstraintsFromSheet(
  seasonId: string,
  sheetConstraints: readonly { soldierProfileId: string; date: Date }[],
): Promise<{ added: number; removed: number }> {
  const existing = await prisma.dayOffConstraint.findMany({
    where: { seasonId },
    select: { soldierProfileId: true, date: true },
  });

  const toKey = (sid: string, d: Date) => {
    const utc = new Date(d);
    utc.setUTCHours(0, 0, 0, 0);
    return `${sid}::${utc.toISOString().split("T")[0]}`;
  };

  const existingKeys = new Set(existing.map((c) => toKey(c.soldierProfileId, c.date)));
  const sheetKeys = new Set(sheetConstraints.map((c) => toKey(c.soldierProfileId, c.date)));

  const toAdd = sheetConstraints.filter((c) => !existingKeys.has(toKey(c.soldierProfileId, c.date)));
  const toRemove = existing.filter((c) => !sheetKeys.has(toKey(c.soldierProfileId, c.date)));

  for (const c of toAdd) {
    await prisma.dayOffConstraint.upsert({
      where: {
        seasonId_soldierProfileId_date: {
          seasonId,
          soldierProfileId: c.soldierProfileId,
          date: c.date,
        },
      },
      create: { seasonId, soldierProfileId: c.soldierProfileId, date: c.date },
      update: {},
    });
  }

  for (const c of toRemove) {
    await prisma.dayOffConstraint.deleteMany({
      where: {
        seasonId,
        soldierProfileId: c.soldierProfileId,
        date: c.date,
      },
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
}
