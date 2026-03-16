"use server";

import { auth } from "@/server/auth/auth";
import {
  getSoldierProfile,
  isSeasonAdmin,
  getSeasonMembers,
  getSeasonMemberNames,
} from "@/server/db/stores/soldier-store";
// getSeasonMembers is only used for shareSheetAction (needs user.email)
// Other actions use season.members from getSeasonById instead
import {
  getSeasonConfig,
  getSeasonName,
  getSeasonById,
  getSeasonDates,
} from "@/server/db/stores/season-store";
import {
  getActiveScheduleVersion,
  getScheduleVersionById,
  createScheduleVersion,
  deleteAllScheduleVersions,
} from "@/server/db/stores/schedule-store";
import {
  getConstraintKeys,
  getConstraintsForSeason,
} from "@/server/db/stores/constraint-store";
import {
  getActiveSheetUrl,
  getActiveSheetExport,
  getSheetExports,
  createSheetExport,
  setActiveSheetExport,
  deleteAllSheetExports,
  deleteSheetExport,
  getSheetExportById,
  markSheetAsShared,
} from "@/server/db/stores/sheet-store";
import { getGoogleDriveClient } from "@/server/sheets/google-auth";
import { prepareBoardData } from "@/app/season/[seasonId]/board/prepare-board-data";
import { createScheduleSheet } from "@/server/sheets/create-schedule-sheet";
import { readScheduleSheet } from "@/server/sheets/read-schedule-sheet";
import { dateToString } from "@/lib/date-utils";
import { patchSchedule } from "@/domain/schedule/schedule-patcher";
import { generateSchedule } from "@/domain/schedule/schedule-generator";
import { DayOffConstraintChecker } from "@/domain/schedule/day-off-constraint-checker";
import { applySheetSync } from "@/domain/schedule/apply-sheet-sync";
import { buildSeasonSoldiers, toDomainSeason } from "./schedule-mappers";
import type { ScheduleAssignment } from "@/domain/schedule/schedule.types";

async function exportCurrentSchedule(
  seasonId: string,
  userId: string,
  versionId?: string,
  asDraft?: boolean,
): Promise<{ url: string }> {
  const schedule = versionId
    ? await getScheduleVersionById(versionId)
    : await getActiveScheduleVersion(seasonId);

  const [seasonConfig, rawConstraintKeys, seasonNameResult] =
    await Promise.all([
      getSeasonConfig(seasonId),
      getConstraintKeys(seasonId),
      getSeasonName(seasonId),
    ]);

  if (!schedule) throw new Error("אין סידור פעיל");
  if (!seasonConfig) throw new Error("עונה לא נמצאה");

  const constraintKeys = new Set<string>();
  for (const c of rawConstraintKeys) {
    constraintKeys.add(`${c.soldierProfileId}-${dateToString(new Date(c.date))}`);
  }

  const data = prepareBoardData(schedule, seasonConfig, constraintKeys);
  const seasonName = seasonNameResult?.name ?? "סידור";
  const roleMinimums = (seasonConfig.roleMinimums ?? {}) as Partial<Record<string, number>>;

  const url = await createScheduleSheet(data, seasonName, {
    dailyHeadcount: seasonConfig.dailyHeadcount,
    roleMinimums,
  });
  await createSheetExport(seasonId, url, userId, asDraft ? { isActive: false } : undefined);
  return { url };
}

function toAssignments(
  raw: { soldierProfileId: string; date: Date; isOnBase: boolean; isUnavailable: boolean; absentReason: string | null; replacedById: string | null; manualOverride: boolean }[],
): ScheduleAssignment[] {
  return raw.map((a) => ({
    soldierProfileId: a.soldierProfileId,
    date: a.date,
    isOnBase: a.isOnBase,
    isUnavailable: a.isUnavailable,
    absentReason: (a.absentReason === "sick" || a.absentReason === "course") ? a.absentReason : null,
    replacedById: a.replacedById,
    manualOverride: a.manualOverride,
  }));
}

async function requireAdmin(seasonId: string): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("לא מחובר");

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) throw new Error("פרופיל לא נמצא");

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) throw new Error("אין הרשאה");

  return session.user.id;
}

export async function updateAndExportAction(
  seasonId: string,
): Promise<{ url: string; isDraft: boolean } | { error: string }> {
  try {
    const userId = await requireAdmin(seasonId);

    const existing = await getActiveScheduleVersion(seasonId);

    if (!existing) {
      const [season, constraints] = await Promise.all([
        getSeasonById(seasonId),
        getConstraintsForSeason(seasonId),
      ]);
      if (!season) throw new Error("עונה לא נמצאה");

      const soldiers = buildSeasonSoldiers(season.members);
      const assignments = generateSchedule({
        season: toDomainSeason(season),
        soldiers,
        constraints: constraints.map((c) => ({
          soldierProfileId: c.soldierProfileId,
          date: c.date,
        })),
      });
      await createScheduleVersion(seasonId, assignments);
      const { url } = await exportCurrentSchedule(seasonId, userId);
      return { url, isDraft: false };
    }

    const [season, constraints] = await Promise.all([
      getSeasonById(seasonId),
      getConstraintsForSeason(seasonId),
    ]);
    if (!season) throw new Error("עונה לא נמצאה");

    const soldiers = buildSeasonSoldiers(season.members);
    const dayOffChecker = new DayOffConstraintChecker(
      constraints.map((c) => ({ soldierProfileId: c.soldierProfileId, date: c.date })),
    );

    const { assignments: patched, changeCount } = patchSchedule({
      assignments: toAssignments(existing.assignments),
      constraintCheckers: [dayOffChecker],
      soldiers,
      season: toDomainSeason(season),
    });

    if (changeCount > 0) {
      const draftVersion = await createScheduleVersion(seasonId, patched, undefined, { isActive: false });
      const { url } = await exportCurrentSchedule(seasonId, userId, draftVersion.id, true);
      return { url, isDraft: true };
    }

    const { url } = await exportCurrentSchedule(seasonId, userId, undefined, true);
    return { url, isDraft: true };
  } catch (err: unknown) {
    console.error("updateAndExportAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function patchFromDateAndExportAction(
  seasonId: string,
  fromDateStr: string,
): Promise<{ url: string; isDraft: boolean } | { error: string }> {
  try {
    const userId = await requireAdmin(seasonId);

    const [currentVersion, season, constraints] = await Promise.all([
      getActiveScheduleVersion(seasonId),
      getSeasonById(seasonId),
      getConstraintsForSeason(seasonId),
    ]);
    if (!currentVersion) throw new Error("אין סידור פעיל");
    if (!season) throw new Error("עונה לא נמצאה");

    const fromDate = new Date(fromDateStr + "T00:00:00.000Z");
    const soldiers = buildSeasonSoldiers(season.members);
    const dayOffChecker = new DayOffConstraintChecker(
      constraints.map((c) => ({ soldierProfileId: c.soldierProfileId, date: c.date })),
    );

    const { assignments: patched, changeCount } = patchSchedule({
      assignments: toAssignments(currentVersion.assignments),
      constraintCheckers: [dayOffChecker],
      soldiers,
      season: toDomainSeason(season),
      fromDate,
    });

    if (changeCount > 0) {
      const draftVersion = await createScheduleVersion(seasonId, patched, fromDate, { isActive: false });
      const { url } = await exportCurrentSchedule(seasonId, userId, draftVersion.id, true);
      return { url, isDraft: true };
    }

    const { url } = await exportCurrentSchedule(seasonId, userId, undefined, true);
    return { url, isDraft: true };
  } catch (err: unknown) {
    console.error("patchFromDateAndExportAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function regenerateFromDateAndExportAction(
  seasonId: string,
  fromDateStr: string,
): Promise<{ url: string; isDraft: boolean } | { error: string }> {
  try {
    const userId = await requireAdmin(seasonId);

    const [currentVersion, season, constraints] = await Promise.all([
      getActiveScheduleVersion(seasonId),
      getSeasonById(seasonId),
      getConstraintsForSeason(seasonId),
    ]);
    if (!season) throw new Error("עונה לא נמצאה");

    const fromDate = new Date(fromDateStr + "T00:00:00.000Z");
    const soldiers = buildSeasonSoldiers(season.members);
    const constraintList = constraints.map((c) => ({
      soldierProfileId: c.soldierProfileId,
      date: c.date,
    }));

    const existingBefore = currentVersion
      ? toAssignments(currentVersion.assignments).filter(
          (a) => a.date < fromDate,
        )
      : [];

    const assignments = generateSchedule({
      season: toDomainSeason(season),
      soldiers,
      constraints: constraintList,
      fromDate,
      existingAssignments: existingBefore,
    });

    const draftVersion = await createScheduleVersion(seasonId, assignments, fromDate, { isActive: false });
    const { url } = await exportCurrentSchedule(seasonId, userId, draftVersion.id, true);
    return { url, isDraft: true };
  } catch (err: unknown) {
    console.error("regenerateFromDateAndExportAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function clearScheduleAction(
  seasonId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAdmin(seasonId);
    await deleteAllScheduleVersions(seasonId);
    await deleteAllSheetExports(seasonId);
    return { success: true };
  } catch (err: unknown) {
    console.error("clearScheduleAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function getActiveSheetAction(
  seasonId: string,
): Promise<{ url: string } | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const url = await getActiveSheetUrl(seasonId);
  if (!url) return null;
  return { url };
}

export async function getSheetExportsAction(seasonId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  return getSheetExports(seasonId);
}

export async function setActiveSheetExportAction(
  exportId: string,
  seasonId: string,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "לא מחובר" };

  const profile = await getSoldierProfile(session.user.id);
  if (!profile) return { error: "פרופיל לא נמצא" };

  const admin = await isSeasonAdmin(seasonId, profile.id);
  if (!admin) return { error: "אין הרשאה" };

  await setActiveSheetExport(exportId, seasonId);
  return { success: true };
}

export async function deleteSheetExportAction(
  exportId: string,
  seasonId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    await requireAdmin(seasonId);
    await deleteSheetExport(exportId);
    return { success: true };
  } catch (err: unknown) {
    console.error("deleteSheetExportAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function shareSheetAction(
  exportId: string,
  seasonId: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAdmin(seasonId);

    const sheetExport = await getSheetExportById(exportId);
    if (!sheetExport) throw new Error("ייצוא לא נמצא");

    const spreadsheetId = sheetExport.url.split("/d/")[1]?.split("/")[0];
    if (!spreadsheetId) throw new Error("לא ניתן לחלץ מזהה גיליון");

    // TODO: filter by confirmed members once confirmation feature exists
    const members = await getSeasonMembers(seasonId);

    await shareWithMembers(spreadsheetId, members);

    await markSheetAsShared(exportId);
    return { success: true };
  } catch (err: unknown) {
    console.error("shareSheetAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

type MemberWithEmail = Awaited<ReturnType<typeof getSeasonMembers>>[number];

async function shareWithMembers(
  spreadsheetId: string,
  members: readonly MemberWithEmail[],
): Promise<void> {
  const drive = await getGoogleDriveClient();

  await Promise.allSettled(
    members
      .filter((m) => m.soldierProfile.user.email)
      .map((m) =>
        drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: {
            role: m.role === "admin" ? "writer" : "reader",
            type: "user",
            emailAddress: m.soldierProfile.user.email,
          },
          sendNotificationEmail: false,
        }),
      ),
  );
}

function extractSpreadsheetId(url: string): string | null {
  return url.split("/d/")[1]?.split("/")[0] ?? null;
}

interface SyncResult {
  readonly success: true;
  readonly changeCount: number;
  readonly warnings: string[];
  readonly debug: {
    readonly columnCount: number;
    readonly matchedSoldiers: number;
    readonly unmatchedValues: readonly string[];
  };
}

async function runSync(seasonId: string): Promise<SyncResult> {
  const [activeExport, currentVersion, seasonDates, members] = await Promise.all([
    getActiveSheetExport(seasonId),
    getActiveScheduleVersion(seasonId),
    getSeasonDates(seasonId),
    getSeasonMemberNames(seasonId),
  ]);

  if (!activeExport) throw new Error("אין גיליון פעיל");
  if (!currentVersion) throw new Error("אין סידור פעיל");
  if (!seasonDates) throw new Error("עונה לא נמצאה");

  const spreadsheetId = extractSpreadsheetId(activeExport.url);
  if (!spreadsheetId) throw new Error("לא ניתן לחלץ מזהה גיליון");

  const parsed = await readScheduleSheet(
    spreadsheetId,
    seasonDates.startDate,
  );

  const nameToId = new Map<string, string>();
  for (const m of members) {
    nameToId.set(m.soldierProfile.fullName, m.soldierProfile.id);
  }

  const columnDateKeys = parsed.columnDates.map(dateToString);

  const warnings: string[] = [];
  let matchedSoldiers = 0;
  const sheetRows = [];

  for (const row of parsed.soldierRows) {
    const soldierId = nameToId.get(row.name);
    if (!soldierId) {
      warnings.push(row.name);
      continue;
    }
    matchedSoldiers++;

    const cells = [];
    for (let colIdx = 0; colIdx < row.cellValues.length && colIdx < columnDateKeys.length; colIdx++) {
      cells.push({ dateKey: columnDateKeys[colIdx], value: row.cellValues[colIdx] });
    }
    sheetRows.push({ soldierId, cells });
  }

  const existingAssignments = toAssignments(currentVersion.assignments);
  const syncResult = applySheetSync(existingAssignments, sheetRows);

  if (syncResult.changeCount > 0) {
    await createScheduleVersion(seasonId, syncResult.assignments);
  }

  return {
    success: true,
    changeCount: syncResult.changeCount,
    warnings,
    debug: {
      columnCount: columnDateKeys.length,
      matchedSoldiers,
      unmatchedValues: syncResult.unmatchedValues,
    },
  };
}

export async function syncFromSheetAction(
  seasonId: string,
): Promise<SyncResult | { error: string }> {
  try {
    await requireAdmin(seasonId);
    return await runSync(seasonId);
  } catch (err: unknown) {
    console.error("syncFromSheetAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}

export async function activateAndSyncSheetAction(
  exportId: string,
  seasonId: string,
): Promise<SyncResult | { error: string }> {
  try {
    await requireAdmin(seasonId);
    await setActiveSheetExport(exportId, seasonId);

    const sheetExport = await getSheetExportById(exportId);
    if (sheetExport) {
      const spreadsheetId = extractSpreadsheetId(sheetExport.url);
      if (spreadsheetId) {
        const members = await getSeasonMembers(seasonId);
        await shareWithMembers(spreadsheetId, members);
        await markSheetAsShared(exportId);
      }
    }

    return await runSync(seasonId);
  } catch (err: unknown) {
    console.error("activateAndSyncSheetAction failed:", err);
    return { error: err instanceof Error ? err.message : "שגיאה לא צפויה" };
  }
}
