import { prisma } from "@/server/db/client";

export async function createSeason(data: {
  name: string;
  startDate: Date;
  endDate: Date;
  trainingEndDate?: Date | null;
  dailyHeadcount?: number;
  roleMinimums?: Record<string, number>;
  constraintDeadline?: Date | null;
  cityGroupingEnabled?: boolean;
  maxConsecutiveDays?: number | null;
}) {
  return prisma.season.create({
    data: {
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      trainingEndDate: data.trainingEndDate ?? null,
      dailyHeadcount: data.dailyHeadcount ?? 8,
      roleMinimums: data.roleMinimums ?? {},
      constraintDeadline: data.constraintDeadline ?? null,
      cityGroupingEnabled: data.cityGroupingEnabled ?? true,
      maxConsecutiveDays: data.maxConsecutiveDays ?? null,
    },
  });
}

export async function getSeasonById(id: string) {
  return prisma.season.findUnique({
    where: { id },
    include: {
      members: {
        include: { soldierProfile: true },
      },
    },
  });
}

export async function getSeasonName(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: { name: true },
  });
}

export async function getSeasonDates(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: { startDate: true, endDate: true },
  });
}

export async function getSeasonConfig(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      dailyHeadcount: true,
      roleMinimums: true,
    },
  });
}

export async function getSeasonSettings(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      trainingEndDate: true,
      dailyHeadcount: true,
      roleMinimums: true,
      constraintDeadline: true,
      cityGroupingEnabled: true,
      maxConsecutiveDays: true,
      minConsecutiveDays: true,
    },
  });
}

export async function getConstraintDeadline(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: { constraintDeadline: true },
  });
}

export async function getSeasonSchedule(id: string) {
  return prisma.season.findUnique({
    where: { id },
    select: {
      startDate: true,
      endDate: true,
      constraintDeadline: true,
    },
  });
}

export async function getActiveSeasons() {
  return prisma.season.findMany({
    where: { isActive: true },
    orderBy: { startDate: "desc" },
  });
}

export async function deleteSeason(id: string) {
  return prisma.season.delete({ where: { id } });
}

export async function updateSeason(
  id: string,
  data: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    trainingEndDate?: Date | null;
    dailyHeadcount?: number;
    roleMinimums?: Record<string, number>;
    constraintDeadline?: Date | null;
    cityGroupingEnabled?: boolean;
    maxConsecutiveDays?: number | null;
    minConsecutiveDays?: number | null;
    isActive?: boolean;
  },
) {
  return prisma.season.update({ where: { id }, data });
}
