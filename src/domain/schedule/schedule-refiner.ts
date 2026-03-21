import type { SoldierRole } from "@/lib/constants";
import type { Season } from "@/domain/season/season.types";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";
import { dateToString, eachDayInRange } from "@/lib/date-utils";
import { createSeededRandom } from "@/lib/seeded-random";

interface RefineInput {
  readonly assignments: readonly ScheduleAssignment[];
  readonly season: Season;
  readonly soldiers: readonly SeasonSoldier[];
  readonly constraints: readonly { soldierProfileId: string; date: Date }[];
  readonly seed: number;
}

const FAIRNESS_WEIGHT = 200;
const BLOCK_PENALTY = 50;
const GAP_PENALTY = 3;
const ROLE_VIOLATION_PENALTY = 10000;
const START_TEMP = 100;
const COOLING = 0.9985;
const MIN_TEMP = 0.01;

interface SwapMove {
  readonly dayStr: string;
  readonly removeId: string;
  readonly addId: string;
}

export function refineSchedule(input: RefineInput): ScheduleAssignment[] {
  const { season, soldiers, constraints, seed } = input;
  const rng = createSeededRandom(seed);

  const days = eachDayInRange(season.startDate, season.endDate);
  const opDays = season.trainingEndDate
    ? days.filter((d) => d > season.trainingEndDate!)
    : days;
  const opDayStrs = opDays.map(dateToString);

  const constraintSet = buildConstraintSet(constraints);
  const soldierIds = soldiers.map((s) => s.id);
  const rolesById = new Map(soldiers.map((s) => [s.id, s.roles]));

  const daySlots = buildDaySlots(input.assignments, opDayStrs);
  const soldierDays = buildSoldierDays(soldierIds, daySlots);

  const hardMax = season.avgDaysArmy != null
    ? season.avgDaysArmy + 5
    : null;
  const minBlock = Math.min(4, season.avgDaysArmy ?? 7);
  const targetGap = season.avgDaysHome ?? 7;

  let currentCost = computeCost(
    soldierDays, daySlots, opDayStrs, rolesById,
    season.roleMinimums, soldiers, minBlock, targetGap,
  );

  let temp = START_TEMP;
  while (temp > MIN_TEMP) {
    const move = generateSwapMove(
      opDayStrs, daySlots, soldierIds, constraintSet, rng,
    );

    if (move && isValidMove(move, daySlots, opDayStrs, hardMax, minBlock, constraintSet)) {
      applyMove(move, daySlots, soldierDays);

      const newCost = computeCost(
        soldierDays, daySlots, opDayStrs, rolesById,
        season.roleMinimums, soldiers, minBlock, targetGap,
      );
      const delta = newCost - currentCost;

      if (delta < 0 || rng.next() < Math.exp(-delta / temp)) {
        currentCost = newCost;
      } else {
        undoMove(move, daySlots, soldierDays);
      }
    }

    temp *= COOLING;
  }

  return rebuildAssignments(input.assignments, daySlots, opDayStrs, days);
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

function buildDaySlots(
  assignments: readonly ScheduleAssignment[],
  opDayStrs: readonly string[],
): Map<string, Set<string>> {
  const daySlots = new Map<string, Set<string>>();
  for (const ds of opDayStrs) {
    daySlots.set(ds, new Set());
  }
  for (const a of assignments) {
    if (!a.isOnBase) continue;
    const ds = dateToString(a.date);
    daySlots.get(ds)?.add(a.soldierProfileId);
  }
  return daySlots;
}

function buildSoldierDays(
  soldierIds: readonly string[],
  daySlots: Map<string, Set<string>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of soldierIds) counts.set(id, 0);
  for (const slots of daySlots.values()) {
    for (const id of slots) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function computeCost(
  soldierDays: Map<string, number>,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  rolesById: Map<string, readonly SoldierRole[]>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  soldiers: readonly SeasonSoldier[],
  minBlock: number,
  targetGap: number,
): number {
  const counts = [...soldierDays.values()];
  const maxDays = Math.max(...counts);
  const minDays = Math.min(...counts);
  let cost = FAIRNESS_WEIGHT * (maxDays - minDays);

  cost += BLOCK_PENALTY * countShortBlocks(daySlots, opDayStrs, soldierDays, minBlock);
  cost += GAP_PENALTY * countBadGaps(daySlots, opDayStrs, soldierDays, targetGap);
  cost += ROLE_VIOLATION_PENALTY * countRoleViolations(daySlots, opDayStrs, rolesById, roleMinimums, soldiers);

  return cost;
}

function countShortBlocks(
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  soldierDays: Map<string, number>,
  minBlock: number,
): number {
  let count = 0;
  for (const [sid] of soldierDays) {
    let blockLen = 0;
    for (const ds of opDayStrs) {
      if (daySlots.get(ds)?.has(sid)) {
        blockLen++;
      } else {
        if (blockLen > 0 && blockLen < minBlock) count++;
        blockLen = 0;
      }
    }
    if (blockLen > 0 && blockLen < minBlock) count++;
  }
  return count;
}

function countBadGaps(
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  soldierDays: Map<string, number>,
  targetGap: number,
): number {
  let count = 0;
  for (const [sid] of soldierDays) {
    let gapLen = 0;
    let wasOnBase = false;
    for (const ds of opDayStrs) {
      if (daySlots.get(ds)?.has(sid)) {
        if (wasOnBase === false && gapLen > 0) {
          const diff = Math.abs(gapLen - targetGap);
          if (diff > 2) count++;
        }
        gapLen = 0;
        wasOnBase = true;
      } else {
        gapLen++;
        wasOnBase = false;
      }
    }
  }
  return count;
}

function countRoleViolations(
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  rolesById: Map<string, readonly SoldierRole[]>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  soldiers: readonly SeasonSoldier[],
): number {
  const entries = Object.entries(roleMinimums) as [SoldierRole, number][];
  if (entries.length === 0) return 0;

  let violations = 0;
  for (const ds of opDayStrs) {
    const slots = daySlots.get(ds);
    if (!slots) continue;
    for (const [role, min] of entries) {
      let roleCount = 0;
      for (const sid of slots) {
        if (rolesById.get(sid)?.includes(role)) roleCount++;
      }
      if (roleCount < min) violations++;
    }
  }
  return violations;
}

function generateSwapMove(
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  soldierIds: readonly string[],
  constraintSet: Set<string>,
  rng: { next: () => number },
): SwapMove | null {
  const dayIdx = (rng.next() * opDayStrs.length) | 0;
  const dayStr = opDayStrs[dayIdx];
  const slots = daySlots.get(dayStr)!;

  const onBase = [...slots];
  if (onBase.length === 0) return null;

  const removeId = onBase[(rng.next() * onBase.length) | 0];

  const offBase = soldierIds.filter(
    (id) => !slots.has(id) && !constraintSet.has(`${id}:${dayStr}`),
  );
  if (offBase.length === 0) return null;

  const addId = offBase[(rng.next() * offBase.length) | 0];

  return { dayStr, removeId, addId };
}

function isValidMove(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  minBlock: number,
  constraintSet: Set<string>,
): boolean {
  if (constraintSet.has(`${move.addId}:${move.dayStr}`)) return false;

  const dayIdx = opDayStrs.indexOf(move.dayStr);
  if (dayIdx === -1) return false;

  if (hardMax !== null) {
    let streak = 1;
    for (let i = dayIdx - 1; i >= 0; i--) {
      if (daySlots.get(opDayStrs[i])?.has(move.addId)) streak++;
      else break;
    }
    for (let i = dayIdx + 1; i < opDayStrs.length; i++) {
      if (daySlots.get(opDayStrs[i])?.has(move.addId)) streak++;
      else break;
    }
    if (streak > hardMax) return false;
  }

  if (wouldCreateShortRemoveBlock(move.removeId, dayIdx, opDayStrs, daySlots, minBlock)) {
    return false;
  }

  const hasLeft = dayIdx > 0 &&
    (daySlots.get(opDayStrs[dayIdx - 1])?.has(move.addId) ?? false);
  const hasRight = dayIdx < opDayStrs.length - 1 &&
    (daySlots.get(opDayStrs[dayIdx + 1])?.has(move.addId) ?? false);

  if (!hasLeft && !hasRight) return false;

  let blockLen = 1;
  for (let i = dayIdx - 1; i >= 0; i--) {
    if (daySlots.get(opDayStrs[i])?.has(move.addId)) blockLen++;
    else break;
  }
  for (let i = dayIdx + 1; i < opDayStrs.length; i++) {
    if (daySlots.get(opDayStrs[i])?.has(move.addId)) blockLen++;
    else break;
  }
  if (blockLen < minBlock) return false;

  return true;
}

function wouldCreateShortRemoveBlock(
  soldierId: string,
  removeDayIdx: number,
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  minBlock: number,
): boolean {
  let leftLen = 0;
  for (let i = removeDayIdx - 1; i >= 0; i--) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) leftLen++;
    else break;
  }

  let rightLen = 0;
  for (let i = removeDayIdx + 1; i < opDayStrs.length; i++) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) rightLen++;
    else break;
  }

  if (leftLen > 0 && leftLen < minBlock) return true;
  if (rightLen > 0 && rightLen < minBlock) return true;

  return false;
}

function applyMove(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
): void {
  const slots = daySlots.get(move.dayStr)!;
  slots.delete(move.removeId);
  slots.add(move.addId);
  soldierDays.set(move.removeId, (soldierDays.get(move.removeId) ?? 0) - 1);
  soldierDays.set(move.addId, (soldierDays.get(move.addId) ?? 0) + 1);
}

function undoMove(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
): void {
  applyMove(
    { dayStr: move.dayStr, removeId: move.addId, addId: move.removeId },
    daySlots,
    soldierDays,
  );
}

function rebuildAssignments(
  original: readonly ScheduleAssignment[],
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  allDays: readonly Date[],
): ScheduleAssignment[] {
  const opDaySet = new Set(opDayStrs);
  const result: ScheduleAssignment[] = [];

  for (const a of original) {
    const ds = dateToString(a.date);
    if (!opDaySet.has(ds) || !a.isOnBase) {
      result.push(a);
    }
  }

  const dayMap = new Map<string, Date>();
  for (const d of allDays) dayMap.set(dateToString(d), d);

  for (const ds of opDayStrs) {
    const slots = daySlots.get(ds);
    if (!slots) continue;
    const date = dayMap.get(ds)!;
    for (const sid of slots) {
      result.push({
        soldierProfileId: sid,
        date,
        isOnBase: true,
        isUnavailable: false,
        absentReason: null,
        replacedById: null,
        manualOverride: false,
      });
    }
  }

  return result;
}
