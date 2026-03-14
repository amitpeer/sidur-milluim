import { prisma } from "@/server/db/client";

export async function getActiveSheetUrl(
  seasonId: string,
): Promise<string | null> {
  const row = await prisma.sheetExport.findFirst({
    where: { seasonId, isActive: true },
    select: { url: true },
    orderBy: { createdAt: "desc" },
  });
  return row?.url ?? null;
}

export async function getSheetExports(seasonId: string) {
  return prisma.sheetExport.findMany({
    where: { seasonId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      isActive: true,
      isShared: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export async function createSheetExport(
  seasonId: string,
  url: string,
  userId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.sheetExport.updateMany({
      where: { seasonId, isActive: true },
      data: { isActive: false },
    }),
    prisma.sheetExport.create({
      data: { seasonId, url, createdById: userId },
    }),
  ]);
}

export async function deleteSheetExport(exportId: string) {
  return prisma.sheetExport.delete({
    where: { id: exportId },
  });
}

export async function deleteAllSheetExports(seasonId: string) {
  return prisma.sheetExport.deleteMany({
    where: { seasonId },
  });
}

export async function setActiveSheetExport(
  exportId: string,
  seasonId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.sheetExport.updateMany({
      where: { seasonId, isActive: true },
      data: { isActive: false },
    }),
    prisma.sheetExport.update({
      where: { id: exportId },
      data: { isActive: true },
    }),
  ]);
}

export async function getSheetExportById(exportId: string) {
  return prisma.sheetExport.findUnique({
    where: { id: exportId },
    select: { url: true },
  });
}

export async function markSheetAsShared(exportId: string): Promise<void> {
  await prisma.sheetExport.update({
    where: { id: exportId },
    data: { isShared: true },
  });
}

export async function getActiveSheetExport(seasonId: string) {
  return prisma.sheetExport.findFirst({
    where: { seasonId, isActive: true },
    select: { id: true, url: true },
    orderBy: { createdAt: "desc" },
  });
}
