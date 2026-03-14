import type { ConstraintChecker } from "./constraint-checker";
import type { ScheduleAssignment } from "./schedule.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { Season } from "@/domain/season/season.types";
import type { SoldierRole } from "@/lib/constants";
import { eachDayInRange, dateToString } from "@/lib/date-utils";
import { suggestReplacements } from "./replacement-suggester";

interface PatchInput {
  readonly assignments: readonly ScheduleAssignment[];
  readonly constraintCheckers: readonly ConstraintChecker[];
  readonly soldiers: readonly SeasonSoldier[];
  readonly season: Season;
  readonly fromDate?: Date;
}

interface PatchResult {
  readonly assignments: ScheduleAssignment[];
  readonly changeCount: number;
}

export function patchSchedule(input: PatchInput): PatchResult {
  const { constraintCheckers, soldiers, season } = input;
  const fromDate = input.fromDate ?? season.startDate;
  let assignments = [...input.assignments];
  let changeCount = 0;

  const soldierIds = new Set(soldiers.map((s) => s.id));

  const removedByDeleted = removeDeletedSoldiers(assignments, soldierIds);
  changeCount += removedByDeleted.removed;
  assignments = removedByDeleted.assignments;

  const removedByConstraints = removeViolations(
    assignments,
    constraintCheckers,
    season,
    fromDate,
  );
  changeCount += removedByConstraints.removed;
  assignments = removedByConstraints.assignments;

  const rebalanced = rebalanceAssignments(
    assignments,
    soldiers,
    season,
    fromDate,
  );
  changeCount += rebalanced.removed;
  assignments = rebalanced.assignments;

  const filled = fillUnderstaffedDays(
    assignments,
    constraintCheckers,
    soldiers,
    season,
    fromDate,
  );
  changeCount += filled.added;
  assignments = filled.assignments;

  const fixed = fixRoleCoverage(
    assignments,
    constraintCheckers,
    soldiers,
    season,
    fromDate,
  );
  changeCount += fixed.changed;
  assignments = fixed.assignments;

  return { assignments, changeCount };
}

function removeDeletedSoldiers(
  assignments: ScheduleAssignment[],
  soldierIds: Set<string>,
): { assignments: ScheduleAssignment[]; removed: number } {
  const kept = assignments.filter((a) => soldierIds.has(a.soldierProfileId));
  return {
    assignments: kept,
    removed: assignments.length - kept.length,
  };
}

function removeViolations(
  assignments: ScheduleAssignment[],
  checkers: readonly ConstraintChecker[],
  season: Season,
  fromDate: Date,
): { assignments: ScheduleAssignment[]; removed: number } {
  const days = eachDayInRange(fromDate, season.endDate);
  const toRemove = new Set<ScheduleAssignment>();

  for (const day of days) {
    const dayAssignments = assignments.filter(
      (a) => dateToString(a.date) === dateToString(day),
    );

    for (const checker of checkers) {
      for (const violation of checker.findViolations(dayAssignments, day)) {
        toRemove.add(violation);
      }
    }
  }

  return {
    assignments: assignments.filter((a) => !toRemove.has(a)),
    removed: toRemove.size,
  };
}

function rebalanceAssignments(
  assignments: ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
  season: Season,
  fromDate: Date,
): { assignments: ScheduleAssignment[]; removed: number } {
  const editableDays = eachDayInRange(fromDate, season.endDate);
  const editableDateStrs = new Set(editableDays.map(dateToString));
  const targetPerSoldier = Math.floor(
    (editableDays.length * season.dailyHeadcount) / soldiers.length,
  );

  const result = [...assignments];
  let removed = 0;

  for (const soldier of soldiers) {
    const editableOnBase = result.filter(
      (a) =>
        a.soldierProfileId === soldier.id &&
        a.isOnBase &&
        editableDateStrs.has(dateToString(a.date)),
    ).length;

    const excess = editableOnBase - targetPerSoldier;
    if (excess <= 0) continue;

    const removable = result
      .map((a, idx) => ({ a, idx }))
      .filter(
        ({ a }) =>
          a.soldierProfileId === soldier.id &&
          a.isOnBase &&
          !a.manualOverride &&
          editableDateStrs.has(dateToString(a.date)),
      );

    const dayOverstaffing = (dateStr: string) =>
      result.filter((a) => a.isOnBase && dateToString(a.date) === dateStr).length -
      season.dailyHeadcount;

    removable.sort(
      (a, b) => dayOverstaffing(dateToString(b.a.date)) - dayOverstaffing(dateToString(a.a.date)),
    );

    const toRemove = Math.min(excess, removable.length);
    const indicesToRemove = new Set(
      removable.slice(0, toRemove).map(({ idx }) => idx),
    );

    for (let i = result.length - 1; i >= 0; i--) {
      if (indicesToRemove.has(i)) {
        result.splice(i, 1);
        removed++;
      }
    }
  }

  return { assignments: result, removed };
}

function isBlockedByAny(
  checkers: readonly ConstraintChecker[],
  soldierId: string,
  date: Date,
): boolean {
  return checkers.some((c) => c.isBlocked(soldierId, date));
}

function buildConstraintsForSuggester(
  checkers: readonly ConstraintChecker[],
  soldiers: readonly SeasonSoldier[],
  days: readonly Date[],
): { soldierProfileId: string; date: Date }[] {
  const result: { soldierProfileId: string; date: Date }[] = [];
  for (const day of days) {
    for (const soldier of soldiers) {
      if (isBlockedByAny(checkers, soldier.id, day)) {
        result.push({ soldierProfileId: soldier.id, date: day });
      }
    }
  }
  return result;
}

function activateOrCreate(
  result: ScheduleAssignment[],
  soldierId: string,
  day: Date,
): void {
  const dateStr = dateToString(day);
  const existingIdx = result.findIndex(
    (a) => a.soldierProfileId === soldierId && dateToString(a.date) === dateStr,
  );

  if (existingIdx !== -1) {
    result[existingIdx] = {
      ...result[existingIdx],
      isOnBase: true,
      absentReason: null,
      manualOverride: false,
    };
  } else {
    result.push({
      soldierProfileId: soldierId,
      date: day,
      isOnBase: true,
      isUnavailable: false,
      absentReason: null,
      replacedById: null,
      manualOverride: false,
    });
  }
}

function fillUnderstaffedDays(
  assignments: ScheduleAssignment[],
  checkers: readonly ConstraintChecker[],
  soldiers: readonly SeasonSoldier[],
  season: Season,
  fromDate: Date,
): { assignments: ScheduleAssignment[]; added: number } {
  const result = [...assignments];
  const allDays = eachDayInRange(season.startDate, season.endDate);
  const days = eachDayInRange(fromDate, season.endDate);
  const constraints = buildConstraintsForSuggester(checkers, soldiers, allDays);
  let added = 0;

  for (const day of days) {
    const dateStr = dateToString(day);

    let onBaseCount = result.filter(
      (a) => a.isOnBase && dateToString(a.date) === dateStr,
    ).length;

    while (onBaseCount < season.dailyHeadcount) {
      const suggestions = suggestReplacements({
        unavailableSoldierId: "",
        date: day,
        soldiers,
        assignments: result,
        constraints,
      });

      if (suggestions.length === 0) break;

      activateOrCreate(result, suggestions[0].soldierId, day);
      onBaseCount++;
      added++;
    }
  }

  return { assignments: result, added };
}

function fixRoleCoverage(
  assignments: ScheduleAssignment[],
  checkers: readonly ConstraintChecker[],
  soldiers: readonly SeasonSoldier[],
  season: Season,
  fromDate: Date,
): { assignments: ScheduleAssignment[]; changed: number } {
  const roleEntries = Object.entries(season.roleMinimums) as [SoldierRole, number][];
  if (roleEntries.length === 0) {
    return { assignments, changed: 0 };
  }

  const result = [...assignments];
  const allDays = eachDayInRange(season.startDate, season.endDate);
  const days = eachDayInRange(fromDate, season.endDate);
  const constraints = buildConstraintsForSuggester(checkers, soldiers, allDays);
  let changed = 0;

  for (const day of days) {
    const dateStr = dateToString(day);

    for (const [role, min] of roleEntries) {
      const onBase = result.filter(
        (a) => a.isOnBase && dateToString(a.date) === dateStr,
      );

      const roleCount = onBase.filter((a) => {
        const soldier = soldiers.find((s) => s.id === a.soldierProfileId);
        return soldier?.roles.includes(role);
      }).length;

      if (roleCount >= min) continue;

      const needed = min - roleCount;
      for (let i = 0; i < needed; i++) {
        const suggestions = suggestReplacements({
          unavailableSoldierId: "",
          date: day,
          soldiers,
          assignments: result,
          constraints,
          requiredRoles: [role],
        });

        const roleHolder = suggestions.find((s) => {
          const soldier = soldiers.find((sol) => sol.id === s.soldierId);
          return soldier?.roles.includes(role);
        });

        if (!roleHolder) continue;

        const currentOnBase = result.filter(
          (a) => a.isOnBase && dateToString(a.date) === dateStr,
        );

        if (currentOnBase.length >= season.dailyHeadcount) {
          const swapTarget = currentOnBase.find((a) => {
            const soldier = soldiers.find((s) => s.id === a.soldierProfileId);
            return soldier && !soldier.roles.includes(role);
          });

          if (!swapTarget) continue;

          const swapIdx = result.findIndex(
            (a) =>
              a === swapTarget &&
              a.isOnBase &&
              dateToString(a.date) === dateStr,
          );
          if (swapIdx !== -1) {
            result.splice(swapIdx, 1);
          }
        }

        activateOrCreate(result, roleHolder.soldierId, day);
        changed++;
      }
    }
  }

  return { assignments: result, changed };
}
