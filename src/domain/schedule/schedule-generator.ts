import type { SoldierRole } from "@/lib/constants";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";
import { eachDayInRange, dateToString } from "@/lib/date-utils";

interface GenerateInput {
  readonly season: Season;
  readonly soldiers: readonly SeasonSoldier[];
  readonly constraints: readonly {
    readonly soldierProfileId: string;
    readonly date: Date;
  }[];
  readonly fromDate?: Date;
  readonly existingAssignments?: readonly ScheduleAssignment[];
}

const NEAR_BLOCK_MIN = 5;
const NEAR_BLOCK_MAX = 7;
const FAR_BLOCK_MIN = 7;
const FAR_BLOCK_MAX = 10;
const CITY_COHESION_BONUS = 3;

export function generateSchedule(input: GenerateInput): ScheduleAssignment[] {
  const { season, soldiers, constraints, fromDate, existingAssignments } = input;

  const startDate = fromDate ?? season.startDate;
  const days = eachDayInRange(startDate, season.endDate);

  const constraintSet = buildConstraintSet(constraints);

  const assignments: ScheduleAssignment[] = [];
  if (existingAssignments) {
    assignments.push(...existingAssignments);
  }

  const daySlots = new Map<string, Set<string>>();
  for (const day of days) {
    daySlots.set(dateToString(day), new Set());
  }

  for (const a of assignments) {
    const ds = dateToString(a.date);
    if (a.isOnBase) {
      daySlots.get(ds)?.add(a.soldierProfileId);
    }
  }

  const soldierDays = new Map<string, number>();
  for (const s of soldiers) {
    soldierDays.set(s.id, 0);
  }
  for (const a of assignments) {
    if (a.isOnBase) {
      soldierDays.set(
        a.soldierProfileId,
        (soldierDays.get(a.soldierProfileId) ?? 0) + 1,
      );
    }
  }

  const { trainingDays, operationalDays } = splitByTraining(days, season.trainingEndDate);

  for (const day of trainingDays) {
    const dateStr = dateToString(day);
    const slots = daySlots.get(dateStr)!;

    for (const soldier of soldiers) {
      if (isConstrained(soldier.id, dateStr, constraintSet)) continue;
      if (slots.has(soldier.id)) continue;

      slots.add(soldier.id);
      soldierDays.set(soldier.id, (soldierDays.get(soldier.id) ?? 0) + 1);
      assignments.push({
        soldierProfileId: soldier.id,
        date: day,
        isOnBase: true,
        isUnavailable: false,
        absentReason: null,
        replacedById: null,
        manualOverride: false,
      });
    }
  }

  const headcount = season.dailyHeadcount;
  const totalOperationalDays = operationalDays.length;
  const soldierDaysTarget = totalOperationalDays > 0
    ? Math.round((totalOperationalDays * headcount) / soldiers.length)
    : 0;

  const sorted = sortByDifficulty(soldiers, constraints);

  for (const soldier of sorted) {
    const isFar = soldier.isFarAway;
    const blockMin = isFar ? FAR_BLOCK_MIN : NEAR_BLOCK_MIN;
    const blockMax = isFar ? FAR_BLOCK_MAX : NEAR_BLOCK_MAX;
    const targetDays = isFar
      ? Math.round(soldierDaysTarget * 1.2)
      : soldierDaysTarget;

    let assigned = soldierDays.get(soldier.id) ?? 0;

    while (assigned < targetDays) {
      const blockStart = findBestBlockStart(
        soldier.id,
        operationalDays,
        daySlots,
        constraintSet,
        headcount,
        blockMin,
        blockMax,
        season.roleMinimums,
        soldier.roles,
        soldiers,
        season.cityGroupingEnabled ? soldier.city : null,
        season.maxConsecutiveDays,
        season.minConsecutiveDays,
      );

      if (blockStart === -1) break;

      const blockLen = calculateBlockLength(
        blockStart,
        operationalDays,
        soldier.id,
        constraintSet,
        daySlots,
        headcount,
        blockMin,
        blockMax,
        season.maxConsecutiveDays,
        season.minConsecutiveDays,
      );

      for (let i = blockStart; i < blockStart + blockLen && i < operationalDays.length; i++) {
        const dateStr = dateToString(operationalDays[i]);
        const slots = daySlots.get(dateStr)!;

        if (slots.size < headcount && !isConstrained(soldier.id, dateStr, constraintSet)) {
          slots.add(soldier.id);
          assignments.push({
            soldierProfileId: soldier.id,
            date: operationalDays[i],
            isOnBase: true,
            isUnavailable: false,
            absentReason: null,
            replacedById: null,
            manualOverride: false,
          });
          assigned++;
        }
      }

      soldierDays.set(soldier.id, assigned);
      if (assigned >= targetDays) break;
    }
  }

  fillUnderfilledDays(
    operationalDays,
    daySlots,
    headcount,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.cityGroupingEnabled,
    season.maxConsecutiveDays,
    season.minConsecutiveDays,
  );

  fixRoleCoverage(
    operationalDays,
    daySlots,
    season.roleMinimums,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.maxConsecutiveDays,
  );

  return assignments;
}

function buildConstraintSet(
  constraints: readonly { soldierProfileId: string; date: Date }[],
): Set<string> {
  const set = new Set<string>();
  for (const c of constraints) {
    set.add(`${c.soldierProfileId}:${dateToString(c.date)}`);
  }
  return set;
}

function isConstrained(
  soldierId: string,
  dateStr: string,
  constraintSet: Set<string>,
): boolean {
  return constraintSet.has(`${soldierId}:${dateStr}`);
}

function sortByDifficulty(
  soldiers: readonly SeasonSoldier[],
  constraints: readonly { soldierProfileId: string; date: Date }[],
): SeasonSoldier[] {
  const constraintCount = new Map<string, number>();
  for (const c of constraints) {
    constraintCount.set(
      c.soldierProfileId,
      (constraintCount.get(c.soldierProfileId) ?? 0) + 1,
    );
  }

  return [...soldiers].sort((a, b) => {
    const aCount = constraintCount.get(a.id) ?? 0;
    const bCount = constraintCount.get(b.id) ?? 0;
    return bCount - aCount;
  });
}

function findBestBlockStart(
  soldierId: string,
  days: Date[],
  daySlots: Map<string, Set<string>>,
  constraintSet: Set<string>,
  headcount: number,
  blockMin: number,
  _blockMax: number,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  soldierRoles: readonly SoldierRole[],
  allSoldiers: readonly SeasonSoldier[],
  soldierCity: string | null,
  maxConsecutiveDays: number | null,
  minConsecutiveDays: number | null,
): number {
  const flooredBlockMin = Math.max(blockMin, minConsecutiveDays ?? 0);
  const effectiveBlockMin = maxConsecutiveDays !== null
    ? Math.min(flooredBlockMin, maxConsecutiveDays)
    : flooredBlockMin;
  let bestStart = -1;
  let bestScore = -Infinity;

  for (let i = 0; i <= days.length - effectiveBlockMin; i++) {
    const dateStr = dateToString(days[i]);
    const slots = daySlots.get(dateStr)!;

    if (slots.has(soldierId)) continue;
    if (isConstrained(soldierId, dateStr, constraintSet)) continue;
    if (slots.size >= headcount) continue;

    if (wouldExceedMaxConsecutive(soldierId, dateStr, daySlots, days, maxConsecutiveDays)) continue;

    let consecutiveFree = 0;
    for (let j = i; j < days.length; j++) {
      const ds = dateToString(days[j]);
      if (
        isConstrained(soldierId, ds, constraintSet) ||
        daySlots.get(ds)!.has(soldierId)
      ) {
        break;
      }
      consecutiveFree++;
    }

    if (consecutiveFree < effectiveBlockMin) continue;

    let score = 0;
    for (let j = i; j < Math.min(i + effectiveBlockMin, days.length); j++) {
      const ds = dateToString(days[j]);
      const s = daySlots.get(ds)!;
      score += headcount - s.size;

      for (const [role, min] of Object.entries(roleMinimums) as [SoldierRole, number][]) {
        if (soldierRoles.includes(role)) {
          const currentRoleCount = countRoleOnDay(ds, role, daySlots, allSoldiers);
          if (currentRoleCount < min) {
            score += 10;
          }
        }
      }

      if (soldierCity) {
        const cityCount = countCityOnDay(ds, soldierCity, daySlots, allSoldiers);
        score += cityCount * CITY_COHESION_BONUS;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  return bestStart;
}

function calculateBlockLength(
  startIdx: number,
  days: Date[],
  soldierId: string,
  constraintSet: Set<string>,
  daySlots: Map<string, Set<string>>,
  headcount: number,
  blockMin: number,
  blockMax: number,
  maxConsecutiveDays: number | null,
  minConsecutiveDays: number | null,
): number {
  const effectiveMax = maxConsecutiveDays !== null
    ? Math.min(blockMax, maxConsecutiveDays)
    : blockMax;
  const effectiveMin = Math.max(blockMin, minConsecutiveDays ?? 0);
  let len = 0;
  for (let i = startIdx; i < days.length && len < effectiveMax; i++) {
    const dateStr = dateToString(days[i]);
    if (
      isConstrained(soldierId, dateStr, constraintSet) ||
      daySlots.get(dateStr)!.has(soldierId)
    ) {
      break;
    }
    if (daySlots.get(dateStr)!.size >= headcount && len >= effectiveMin) {
      break;
    }
    len++;
  }
  return Math.max(len, 1);
}

function fillUnderfilledDays(
  days: Date[],
  daySlots: Map<string, Set<string>>,
  headcount: number,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  cityGroupingEnabled: boolean,
  maxConsecutiveDays: number | null,
  minConsecutiveDays: number | null,
): void {
  for (const day of days) {
    const dateStr = dateToString(day);
    const slots = daySlots.get(dateStr)!;

    while (slots.size < headcount) {
      const available = soldiers.filter(
        (s) =>
          !slots.has(s.id) &&
          !isConstrained(s.id, dateStr, constraintSet) &&
          !wouldExceedMaxConsecutive(s.id, dateStr, daySlots, days, maxConsecutiveDays),
      );

      if (available.length === 0) break;

      available.sort((a, b) => {
        if (minConsecutiveDays !== null) {
          const aAdj = hasAdjacentDay(a.id, dateStr, daySlots, days);
          const bAdj = hasAdjacentDay(b.id, dateStr, daySlots, days);
          if (aAdj !== bAdj) return aAdj ? -1 : 1;
        }

        const daysDiff =
          (soldierDays.get(a.id) ?? 0) - (soldierDays.get(b.id) ?? 0);
        if (daysDiff !== 0) return daysDiff;

        if (cityGroupingEnabled) {
          const aCityBonus = a.city
            ? countCityOnDay(dateStr, a.city, daySlots, soldiers)
            : 0;
          const bCityBonus = b.city
            ? countCityOnDay(dateStr, b.city, daySlots, soldiers)
            : 0;
          return bCityBonus - aCityBonus;
        }

        return 0;
      });

      const soldier = available[0];
      slots.add(soldier.id);
      soldierDays.set(
        soldier.id,
        (soldierDays.get(soldier.id) ?? 0) + 1,
      );
      assignments.push({
        soldierProfileId: soldier.id,
        date: day,
        isOnBase: true,
        isUnavailable: false,
        absentReason: null,
        replacedById: null,
        manualOverride: false,
      });
    }
  }
}

function fixRoleCoverage(
  days: Date[],
  daySlots: Map<string, Set<string>>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  maxConsecutiveDays: number | null,
): void {
  if (Object.keys(roleMinimums).length === 0) return;

  for (const day of days) {
    const dateStr = dateToString(day);
    const slots = daySlots.get(dateStr)!;

    for (const [role, min] of Object.entries(roleMinimums) as [SoldierRole, number][]) {
      const currentCount = countRoleOnDay(dateStr, role, daySlots, soldiers);
      if (currentCount >= min) continue;

      const needed = min - currentCount;
      for (let n = 0; n < needed; n++) {
        const roleHolder = soldiers.find(
          (s) =>
            s.roles.includes(role) &&
            !slots.has(s.id) &&
            !isConstrained(s.id, dateStr, constraintSet) &&
            !wouldExceedMaxConsecutive(s.id, dateStr, daySlots, days, maxConsecutiveDays),
        );

        if (!roleHolder) continue;

        const nonRoleSoldier = [...slots].find((sid) => {
          const s = soldiers.find((sol) => sol.id === sid);
          return s && !s.roles.includes(role);
        });

        if (nonRoleSoldier) {
          slots.delete(nonRoleSoldier);
          removeAssignment(assignments, nonRoleSoldier, dateStr);
          soldierDays.set(
            nonRoleSoldier,
            (soldierDays.get(nonRoleSoldier) ?? 0) - 1,
          );
        }

        if (slots.size < soldiers.length) {
          slots.add(roleHolder.id);
          soldierDays.set(
            roleHolder.id,
            (soldierDays.get(roleHolder.id) ?? 0) + 1,
          );
          assignments.push({
            soldierProfileId: roleHolder.id,
            date: day,
            isOnBase: true,
            isUnavailable: false,
            absentReason: null,
            replacedById: null,
            manualOverride: false,
          });
        }
      }
    }
  }
}

function hasAdjacentDay(
  soldierId: string,
  dateStr: string,
  daySlots: Map<string, Set<string>>,
  days: Date[],
): boolean {
  const dayIndex = days.findIndex((d) => dateToString(d) === dateStr);
  if (dayIndex === -1) return false;

  if (dayIndex > 0) {
    const prev = dateToString(days[dayIndex - 1]);
    if (daySlots.get(prev)?.has(soldierId)) return true;
  }
  if (dayIndex < days.length - 1) {
    const next = dateToString(days[dayIndex + 1]);
    if (daySlots.get(next)?.has(soldierId)) return true;
  }

  return false;
}

function countCityOnDay(
  dateStr: string,
  city: string,
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
): number {
  const slots = daySlots.get(dateStr);
  if (!slots) return 0;
  let count = 0;
  for (const sid of slots) {
    const s = soldiers.find((sol) => sol.id === sid);
    if (s?.city === city) count++;
  }
  return count;
}

function countRoleOnDay(
  dateStr: string,
  role: SoldierRole,
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
): number {
  const slots = daySlots.get(dateStr);
  if (!slots) return 0;
  let count = 0;
  for (const sid of slots) {
    const s = soldiers.find((sol) => sol.id === sid);
    if (s?.roles.includes(role)) count++;
  }
  return count;
}

function splitByTraining(
  days: Date[],
  trainingEndDate: Date | null,
): { trainingDays: Date[]; operationalDays: Date[] } {
  if (!trainingEndDate) {
    return { trainingDays: [], operationalDays: days };
  }
  const trainingDays: Date[] = [];
  const operationalDays: Date[] = [];
  for (const day of days) {
    if (day <= trainingEndDate) {
      trainingDays.push(day);
    } else {
      operationalDays.push(day);
    }
  }
  return { trainingDays, operationalDays };
}

function wouldExceedMaxConsecutive(
  soldierId: string,
  dateStr: string,
  daySlots: Map<string, Set<string>>,
  days: Date[],
  maxConsecutive: number | null,
): boolean {
  if (maxConsecutive === null) return false;

  const dayIndex = days.findIndex((d) => dateToString(d) === dateStr);
  if (dayIndex === -1) return false;

  let streak = 1;

  for (let i = dayIndex - 1; i >= 0; i--) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) {
      streak++;
    } else {
      break;
    }
  }

  for (let i = dayIndex + 1; i < days.length; i++) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) {
      streak++;
    } else {
      break;
    }
  }

  return streak > maxConsecutive;
}

function removeAssignment(
  assignments: ScheduleAssignment[],
  soldierId: string,
  dateStr: string,
): void {
  const idx = assignments.findIndex(
    (a) =>
      a.soldierProfileId === soldierId &&
      dateToString(a.date) === dateStr &&
      a.isOnBase,
  );
  if (idx !== -1) assignments.splice(idx, 1);
}
