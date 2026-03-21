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
      versionNumber: true,
      lastSyncedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export async function createSheetExport(
  seasonId: string,
  url: string,
  userId: string,
  options?: { isActive?: boolean },
): Promise<void> {
  const shouldActivate = options?.isActive ?? true;

  const lastExport = await prisma.sheetExport.findFirst({
    where: { seasonId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const nextVersion = (lastExport?.versionNumber ?? 0) + 1;

  const ops = [];
  if (shouldActivate) {
    ops.push(
      prisma.sheetExport.updateMany({
        where: { seasonId, isActive: true },
        data: { isActive: false },
      }),
    );
  }
  ops.push(
    prisma.sheetExport.create({
      data: {
        seasonId,
        url,
        createdById: userId,
        isActive: shouldActivate,
        versionNumber: nextVersion,
      },
    }),
  );

  await prisma.$transaction(ops);
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

export async function updateLastSyncedAt(exportId: string): Promise<void> {
  await prisma.sheetExport.update({
    where: { id: exportId },
    data: { lastSyncedAt: new Date() },
  });
}

export async function getActiveSheetExport(seasonId: string) {
  return prisma.sheetExport.findFirst({
    where: { seasonId, isActive: true },
    select: { id: true, url: true, versionNumber: true, lastSyncedAt: true },
    orderBy: { createdAt: "desc" },
  });
}
