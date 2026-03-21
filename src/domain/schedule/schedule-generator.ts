import type { SoldierRole } from "@/lib/constants";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";
import { eachDayInRange, dateToString } from "@/lib/date-utils";
import { createSeededRandom } from "@/lib/seeded-random";
import { refineSchedule } from "./schedule-refiner";


interface GenerateInput {
  readonly season: Season;
  readonly soldiers: readonly SeasonSoldier[];
  readonly constraints: readonly {
    readonly soldierProfileId: string;
    readonly date: Date;
  }[];
  readonly fromDate?: Date;
  readonly existingAssignments?: readonly ScheduleAssignment[];
  readonly seed?: number;
}

const DEFAULT_AVG_ARMY = 7;
const DEFAULT_AVG_HOME = 7;
const HARD_MAX_BUFFER = 5;
const HARD_MIN = 4;
const CITY_COHESION_BONUS = 3;

function effectiveMinBlock(avgDaysArmy: number | null): number {
  const target = avgDaysArmy ?? DEFAULT_AVG_ARMY;
  return Math.min(HARD_MIN, target);
}

export function generateSchedule(input: GenerateInput): ScheduleAssignment[] {
  const { season, soldiers, constraints, fromDate, existingAssignments, seed } = input;
  const rng = createSeededRandom(seed ?? Date.now());

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
  const targetBlock = season.avgDaysArmy ?? DEFAULT_AVG_ARMY;
  const targetGap = season.avgDaysHome ?? DEFAULT_AVG_HOME;

  for (let dayIdx = 0; dayIdx < operationalDays.length; dayIdx++) {
    const day = operationalDays[dayIdx];
    const dateStr = dateToString(day);
    const slots = daySlots.get(dateStr)!;

    while (slots.size < headcount) {
      let bestSoldier: SeasonSoldier | null = null;
      let bestScore = -Infinity;

      for (const soldier of soldiers) {
        if (slots.has(soldier.id)) continue;
        if (isConstrained(soldier.id, dateStr, constraintSet)) continue;

        const extra = soldier.isFarAway ? (season.farAwayExtraDays ?? 0) : 0;
        const soldierTarget = targetBlock + extra;
        const hardMax = soldierTarget + HARD_MAX_BUFFER;

        if (wouldExceedMaxConsecutive(soldier.id, dateStr, daySlots, operationalDays, hardMax)) continue;

        const score = scoreSoldierForDay({
          soldierId: soldier.id,
          dayIdx,
          days: operationalDays,
          daySlots,
          soldierDays,
          targetBlock: soldierTarget,
          targetGap,
          roleMinimums: season.roleMinimums,
          soldierRoles: soldier.roles,
          allSoldiers: soldiers,
          cityGroupingEnabled: season.cityGroupingEnabled,
          soldierCity: season.cityGroupingEnabled ? soldier.city : null,
        });

        if (score > bestScore) {
          bestScore = score;
          bestSoldier = soldier;
        }
      }

      if (!bestSoldier) break;

      addSoldierToDay(bestSoldier.id, day, daySlots, soldierDays, assignments);
    }
  }

  fixRoleCoverage(
    operationalDays,
    daySlots,
    season.roleMinimums,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.avgDaysArmy,
  );

  mergeShortBlocks(
    operationalDays,
    daySlots,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.avgDaysArmy,
  );

  rebalanceDays(
    operationalDays,
    daySlots,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.avgDaysArmy,
    season.roleMinimums,
  );

  mergeShortBlocks(
    operationalDays,
    daySlots,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.avgDaysArmy,
  );

  fixRoleCoverage(
    operationalDays,
    daySlots,
    season.roleMinimums,
    soldiers,
    constraintSet,
    soldierDays,
    assignments,
    season.avgDaysArmy,
  );

  return refineSchedule({
    assignments,
    season,
    soldiers,
    constraints,
    seed: (rng.next() * 0xFFFFFFFF) | 0,
  });
}

interface ScoreInput {
  readonly soldierId: string;
  readonly dayIdx: number;
  readonly days: Date[];
  readonly daySlots: Map<string, Set<string>>;
  readonly soldierDays: Map<string, number>;
  readonly targetBlock: number;
  readonly targetGap: number;
  readonly roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>;
  readonly soldierRoles: readonly SoldierRole[];
  readonly allSoldiers: readonly SeasonSoldier[];
  readonly cityGroupingEnabled: boolean;
  readonly soldierCity: string | null;
}

function scoreSoldierForDay(input: ScoreInput): number {
  const {
    soldierId, dayIdx, days, daySlots, soldierDays,
    targetBlock, targetGap,
    roleMinimums, soldierRoles, allSoldiers,
    cityGroupingEnabled, soldierCity,
  } = input;

  const minBlock = Math.min(HARD_MIN, targetBlock);
  let score = 0;

  const prevAssigned = dayIdx > 0 &&
    daySlots.get(dateToString(days[dayIdx - 1]))?.has(soldierId);

  if (prevAssigned) {
    const blockLen = countBackwardBlock(soldierId, dayIdx - 1, days, daySlots);
    if (blockLen < minBlock) {
      score += 30;
    } else if (blockLen < targetBlock) {
      score += 20;
    } else {
      score -= (blockLen - targetBlock + 1) * 5;
    }
  } else {
    const gap = countGap(soldierId, dayIdx, days, daySlots);
    if (gap === -1 || gap >= targetGap) {
      score += 10;
    } else {
      score += 10 - (targetGap - gap) * 3;
    }
  }

  const totalDays = soldierDays.get(soldierId) ?? 0;
  score -= totalDays;

  const dateStr = dateToString(days[dayIdx]);
  for (const [role, min] of Object.entries(roleMinimums) as [SoldierRole, number][]) {
    if (soldierRoles.includes(role)) {
      const currentCount = countRoleOnDay(dateStr, role, daySlots, allSoldiers);
      if (currentCount < min) {
        score += 30;
      }
    }
  }

  if (cityGroupingEnabled && soldierCity) {
    const cityCount = countCityOnDay(dateStr, soldierCity, daySlots, allSoldiers);
    score += cityCount * CITY_COHESION_BONUS;
  }

  return score;
}

function countBackwardBlock(
  soldierId: string,
  fromIdx: number,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number {
  let count = 0;
  for (let i = fromIdx; i >= 0; i--) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) count++;
    else break;
  }
  return count;
}

function countGap(
  soldierId: string,
  dayIdx: number,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number {
  for (let i = dayIdx - 1; i >= 0; i--) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) {
      return dayIdx - 1 - i;
    }
  }
  return -1;
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

function addSoldierToDay(
  soldierId: string,
  day: Date,
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
): void {
  const dateStr = dateToString(day);
  daySlots.get(dateStr)!.add(soldierId);
  soldierDays.set(soldierId, (soldierDays.get(soldierId) ?? 0) + 1);
  assignments.push({
    soldierProfileId: soldierId,
    date: day,
    isOnBase: true,
    isUnavailable: false,
    absentReason: null,
    replacedById: null,
    manualOverride: false,
  });
}

function countCurrentBlock(
  soldierId: string,
  dayIdx: number,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number {
  let count = 1;
  for (let i = dayIdx - 1; i >= 0; i--) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) count++;
    else break;
  }
  for (let i = dayIdx + 1; i < days.length; i++) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) count++;
    else break;
  }
  return count;
}

function fixRoleCoverage(
  days: Date[],
  daySlots: Map<string, Set<string>>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  avgDaysArmy: number | null,
): void {
  if (Object.keys(roleMinimums).length === 0) return;

  const hardMax = avgDaysArmy != null ? avgDaysArmy + 5 : null;

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
            !wouldExceedMaxConsecutive(s.id, dateStr, daySlots, days, hardMax),
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

function mergeShortBlocks(
  days: Date[],
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  avgDaysArmy: number | null,
): void {
  const hardMax = avgDaysArmy != null ? avgDaysArmy + 5 : null;
  const minBlock = effectiveMinBlock(avgDaysArmy);
  const MAX_PASSES = 3;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let swapped = false;

    for (const soldier of soldiers) {
      const blocks = findSoldierBlocks(soldier.id, days, daySlots);

      for (const block of blocks) {
        if (block.length >= minBlock) continue;

        const extended = tryExtendBySwap(
          soldier.id, block, days, daySlots, soldiers,
          constraintSet, soldierDays, assignments, hardMax, minBlock,
        );
        if (extended) swapped = true;
      }
    }

    if (!swapped) break;
  }
}

function findSoldierBlocks(
  soldierId: string,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number[][] {
  const blocks: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < days.length; i++) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) {
      current.push(i);
    } else {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

function tryExtendBySwap(
  soldierId: string,
  blockIndices: number[],
  days: Date[],
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  hardMax: number | null,
  minBlock: number,
): boolean {
  const needed = minBlock - blockIndices.length;
  let extended = false;

  const directions = [1, -1];
  let remaining = needed;

  for (const dir of directions) {
    if (remaining <= 0) break;

    const edge = dir === 1
      ? blockIndices[blockIndices.length - 1]
      : blockIndices[0];

    for (let step = 1; step <= remaining; step++) {
      const targetIdx = edge + dir * step;
      if (targetIdx < 0 || targetIdx >= days.length) break;

      const ds = dateToString(days[targetIdx]);
      if (isConstrained(soldierId, ds, constraintSet)) break;
      if (wouldExceedMaxConsecutive(soldierId, ds, daySlots, days, hardMax)) break;

      const slots = daySlots.get(ds)!;
      if (slots.has(soldierId)) break;

      const victim = findSwapCandidate(soldierId, targetIdx, days, daySlots, soldiers, constraintSet, minBlock);
      if (!victim) break;

      slots.delete(victim);
      removeAssignment(assignments, victim, ds);
      soldierDays.set(victim, (soldierDays.get(victim) ?? 0) - 1);

      addSoldierToDay(soldierId, days[targetIdx], daySlots, soldierDays, assignments);
      extended = true;
      remaining--;
    }
  }

  return extended;
}

function findSwapCandidate(
  soldierId: string,
  dayIdx: number,
  days: Date[],
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  minBlock: number,
): string | null {
  const ds = dateToString(days[dayIdx]);
  const slots = daySlots.get(ds)!;

  let bestCandidate: string | null = null;
  let bestBlock = Infinity;

  for (const candidateId of slots) {
    if (candidateId === soldierId) continue;

    const blockLen = countCurrentBlock(candidateId, dayIdx, days, daySlots);

    if (blockLen <= minBlock) continue;

    const isEdge =
      dayIdx === 0 ||
      !daySlots.get(dateToString(days[dayIdx - 1]))?.has(candidateId) ||
      dayIdx === days.length - 1 ||
      !daySlots.get(dateToString(days[dayIdx + 1]))?.has(candidateId);
    if (!isEdge) continue;

    if (blockLen < bestBlock) {
      bestBlock = blockLen;
      bestCandidate = candidateId;
    }
  }

  return bestCandidate;
}

const MAX_VARIANCE = 5;

function rebalanceDays(
  days: Date[],
  daySlots: Map<string, Set<string>>,
  soldiers: readonly SeasonSoldier[],
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  avgDaysArmy: number | null,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
): void {
  const hardMax = avgDaysArmy != null ? avgDaysArmy + HARD_MAX_BUFFER : null;
  const soldierRolesMap = new Map(soldiers.map((s) => [s.id, s.roles]));
  const MAX_ITERATIONS = soldiers.length * 20;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const sorted = [...soldiers].sort(
      (a, b) => (soldierDays.get(b.id) ?? 0) - (soldierDays.get(a.id) ?? 0),
    );
    const maxDays = soldierDays.get(sorted[0].id) ?? 0;
    const minDaysVal = soldierDays.get(sorted[sorted.length - 1].id) ?? 0;

    if (maxDays - minDaysVal <= MAX_VARIANCE) break;

    const swapped = tryRebalanceSwap(
      sorted, days, daySlots, constraintSet, soldierDays,
      assignments, hardMax, soldierRolesMap, roleMinimums,
    );
    if (!swapped) break;
  }
}

function tryRebalanceSwap(
  sortedSoldiers: SeasonSoldier[],
  days: Date[],
  daySlots: Map<string, Set<string>>,
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  assignments: ScheduleAssignment[],
  hardMax: number | null,
  soldierRolesMap: Map<string, readonly SoldierRole[]>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
): boolean {
  const minDaysVal = soldierDays.get(sortedSoldiers[sortedSoldiers.length - 1].id) ?? 0;

  for (const overSoldier of sortedSoldiers) {
    const overDays = soldierDays.get(overSoldier.id) ?? 0;
    if (overDays - minDaysVal <= MAX_VARIANCE) break;

    const assignedDayIndices = getAssignedDayIndices(overSoldier.id, days, daySlots);
    const edges = getBlockEdgeIndices(overSoldier.id, days, daySlots);
    const interior = assignedDayIndices.filter((i) => !edges.includes(i));
    const candidates = [...edges, ...interior];

    for (const dayIdx of candidates) {
      const ds = dateToString(days[dayIdx]);

      if (wouldBreakRoles(overSoldier.id, ds, daySlots, soldierRolesMap, sortedSoldiers, roleMinimums)) {
        continue;
      }

      const underSoldier = findUnderSoldier(
        sortedSoldiers, overSoldier.id, dayIdx, days, daySlots,
        constraintSet, soldierDays, hardMax, overDays,
      );
      if (!underSoldier) continue;

      daySlots.get(ds)!.delete(overSoldier.id);
      removeAssignment(assignments, overSoldier.id, ds);
      soldierDays.set(overSoldier.id, overDays - 1);

      addSoldierToDay(underSoldier, days[dayIdx], daySlots, soldierDays, assignments);
      return true;
    }
  }

  return false;
}

function getAssignedDayIndices(
  soldierId: string,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < days.length; i++) {
    if (daySlots.get(dateToString(days[i]))?.has(soldierId)) {
      indices.push(i);
    }
  }
  return indices;
}

function getBlockEdgeIndices(
  soldierId: string,
  days: Date[],
  daySlots: Map<string, Set<string>>,
): number[] {
  const blocks = findSoldierBlocks(soldierId, days, daySlots);
  const edges: number[] = [];
  for (const block of blocks) {
    if (block.length > 1) {
      edges.push(block[block.length - 1]);
      edges.push(block[0]);
    }
  }
  return edges;
}

function wouldBreakRoles(
  soldierId: string,
  dateStr: string,
  daySlots: Map<string, Set<string>>,
  soldierRolesMap: Map<string, readonly SoldierRole[]>,
  soldiers: readonly SeasonSoldier[],
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
): boolean {
  const roles = soldierRolesMap.get(soldierId);
  if (!roles || roles.length === 0) return false;

  for (const role of roles) {
    const min = roleMinimums[role];
    if (min == null || min <= 0) continue;

    const count = countRoleOnDay(dateStr, role, daySlots, soldiers);
    if (count <= min) return true;
  }
  return false;
}

function findUnderSoldier(
  sortedSoldiers: SeasonSoldier[],
  overSoldierId: string,
  dayIdx: number,
  days: Date[],
  daySlots: Map<string, Set<string>>,
  constraintSet: Set<string>,
  soldierDays: Map<string, number>,
  hardMax: number | null,
  overDays: number,
): string | null {
  const ds = dateToString(days[dayIdx]);

  for (let i = sortedSoldiers.length - 1; i >= 0; i--) {
    const candidate = sortedSoldiers[i];
    const candidateDays = soldierDays.get(candidate.id) ?? 0;
    if (candidateDays >= overDays - 1) break;

    if (candidate.id === overSoldierId) continue;
    if (daySlots.get(ds)!.has(candidate.id)) continue;
    if (isConstrained(candidate.id, ds, constraintSet)) continue;
    if (wouldExceedMaxConsecutive(candidate.id, ds, daySlots, days, hardMax)) continue;

    return candidate.id;
  }

  return null;
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
