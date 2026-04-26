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

const FAIRNESS_WEIGHT = 300;
const BLOCK_PENALTY = 200;
const GAP_PENALTY = 3;
const ROLE_VIOLATION_PENALTY = 10000;
const HEADCOUNT_PENALTY = 5000;
const START_TEMP = 150;
const COOLING = 0.99975;
const MIN_TEMP = 0.01;

interface SwapMove {
  readonly type: "swap";
  readonly dayStr: string;
  readonly removeId: string;
  readonly addId: string;
}

interface TransferMove {
  readonly type: "transfer";
  readonly fromDayStr: string;
  readonly toDayStr: string;
  readonly removeId: string;
  readonly addId: string;
}

type Move = SwapMove | TransferMove;

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
    ? Math.min(season.avgDaysArmy + 5, 10)
    : null;
  const hardMinGap = 3;
  const minBlock = Math.min(4, season.avgDaysArmy ?? 7);
  const targetGap = season.avgDaysHome ?? 7;
  const headcount = season.dailyHeadcount;

  let currentCost = computeCost(
    soldierDays, daySlots, opDayStrs, rolesById,
    season.roleMinimums, soldiers, minBlock, targetGap, headcount,
  );

  const driverMin = (season.roleMinimums as Record<string, number>)["driver"] ?? 0;

  let temp = START_TEMP;
  while (temp > MIN_TEMP) {
    let move: Move | null = null;
    let isFairness = false;
    let isCrossGroup = false;

    const roll = rng.next();
    if (roll < 0.10) {
      move = generateCrossGroupMove(
        opDayStrs, daySlots, soldierDays, constraintSet, rng, rolesById, driverMin,
      );
      if (move) isCrossGroup = true;
    } else if (roll < 0.22) {
      move = generateFairnessSwapMove(opDayStrs, daySlots, soldierDays, constraintSet, rng, rolesById);
      if (move) isFairness = true;
    }

    if (!move) {
      move = generateMove(
        opDayStrs, daySlots, soldierIds, constraintSet, rng, headcount, minBlock,
      );
    }

    const valid = move && (isFairness
      ? isValidFairnessSwap(move as SwapMove, daySlots, opDayStrs, hardMax, hardMinGap, constraintSet)
      : isCrossGroup
        ? isValidCrossGroupSwap(move as SwapMove, daySlots, opDayStrs, hardMax, hardMinGap, constraintSet, minBlock)
        : isValidMove(move, daySlots, opDayStrs, hardMax, hardMinGap, constraintSet, minBlock));

    if (valid && move) {
      applyMove(move, daySlots, soldierDays);

      const newCost = computeCost(
        soldierDays, daySlots, opDayStrs, rolesById,
        season.roleMinimums, soldiers, minBlock, targetGap, headcount,
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
  headcount: number,
): number {
  const counts = [...soldierDays.values()];
  const maxDays = Math.max(...counts);
  const minDays = Math.min(...counts);
  let cost = FAIRNESS_WEIGHT * (maxDays - minDays);

  cost += BLOCK_PENALTY * countShortBlockPenalty(daySlots, opDayStrs, soldierDays, minBlock);
  cost += GAP_PENALTY * countBadGaps(daySlots, opDayStrs, soldierDays, targetGap);
  cost += ROLE_VIOLATION_PENALTY * countRoleViolations(daySlots, opDayStrs, rolesById, roleMinimums, soldiers);
  cost += HEADCOUNT_PENALTY * countHeadcountViolations(daySlots, opDayStrs, headcount);

  return cost;
}

function countHeadcountViolations(
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  headcount: number,
): number {
  let violations = 0;
  for (const ds of opDayStrs) {
    const slots = daySlots.get(ds);
    if (!slots || slots.size !== headcount) violations++;
  }
  return violations;
}

function countShortBlockPenalty(
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  soldierDays: Map<string, number>,
  minBlock: number,
): number {
  let penalty = 0;
  for (const [sid] of soldierDays) {
    let blockLen = 0;
    for (const ds of opDayStrs) {
      if (daySlots.get(ds)?.has(sid)) {
        blockLen++;
      } else {
        if (blockLen > 0 && blockLen < minBlock) {
          penalty += minBlock - blockLen;
        }
        blockLen = 0;
      }
    }
    if (blockLen > 0 && blockLen < minBlock) {
      penalty += minBlock - blockLen;
    }
  }
  return penalty;
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

function generateMove(
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  soldierIds: readonly string[],
  constraintSet: Set<string>,
  rng: { next: () => number },
  headcount: number,
  minBlock: number,
): Move | null {
  if (rng.next() < 0.2) {
    const transfer = generateTransferMove(
      opDayStrs, daySlots, soldierIds, constraintSet, rng, headcount,
    );
    if (transfer) return transfer;
  }

  return generateSwapMove(opDayStrs, daySlots, soldierIds, constraintSet, rng);
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

  return { type: "swap", dayStr, removeId, addId };
}

function generateTransferMove(
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  soldierIds: readonly string[],
  constraintSet: Set<string>,
  rng: { next: () => number },
  headcount: number,
): TransferMove | null {
  const overDays: string[] = [];
  const underDays: string[] = [];

  for (const ds of opDayStrs) {
    const size = daySlots.get(ds)?.size ?? 0;
    if (size > headcount) overDays.push(ds);
    else if (size < headcount) underDays.push(ds);
  }

  if (overDays.length === 0 || underDays.length === 0) return null;

  const fromDayStr = overDays[(rng.next() * overDays.length) | 0];
  const toDayStr = underDays[(rng.next() * underDays.length) | 0];

  const fromSlots = daySlots.get(fromDayStr)!;
  const toSlots = daySlots.get(toDayStr)!;

  const removable = [...fromSlots];
  const removeId = removable[(rng.next() * removable.length) | 0];

  const addable = soldierIds.filter(
    (id) => !toSlots.has(id) && !constraintSet.has(`${id}:${toDayStr}`),
  );
  if (addable.length === 0) return null;

  const addId = addable[(rng.next() * addable.length) | 0];

  return { type: "transfer", fromDayStr, toDayStr, removeId, addId };
}

function generateFairnessSwapMove(
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
  constraintSet: Set<string>,
  rng: { next: () => number },
  rolesById: Map<string, readonly SoldierRole[]>,
): SwapMove | null {
  const driverIds: string[] = [];
  const nonDriverIds: string[] = [];
  for (const [id, roles] of rolesById) {
    if (roles.includes("driver" as SoldierRole)) {
      driverIds.push(id);
    } else {
      nonDriverIds.push(id);
    }
  }

  const group = rng.next() < 0.6 ? driverIds : nonDriverIds;
  if (group.length < 2) return null;

  const sorted = group
    .map((id) => ({ id, days: soldierDays.get(id) ?? 0 }))
    .sort((a, b) => b.days - a.days);

  const topN = Math.min(3, sorted.length);
  const high = sorted[(rng.next() * topN) | 0];

  const onDays = opDayStrs.filter((ds) => daySlots.get(ds)?.has(high.id));
  if (onDays.length === 0) return null;

  // Prefer block edges (removing from edge doesn't split a block)
  const edgeDays = onDays.filter((ds) => {
    const idx = opDayStrs.indexOf(ds);
    const prevOn = idx > 0 && daySlots.get(opDayStrs[idx - 1])?.has(high.id);
    const nextOn = idx < opDayStrs.length - 1 && daySlots.get(opDayStrs[idx + 1])?.has(high.id);
    return !prevOn || !nextOn;
  });
  const removeDayCandidates = edgeDays.length > 0 ? edgeDays : onDays;
  const dayStr = removeDayCandidates[(rng.next() * removeDayCandidates.length) | 0];
  const dayIdx = opDayStrs.indexOf(dayStr);

  const lowCandidates = sorted
    .filter((s) =>
      s.id !== high.id &&
      !daySlots.get(dayStr)?.has(s.id) &&
      !constraintSet.has(`${s.id}:${dayStr}`),
    )
    .sort((a, b) => {
      // Prefer soldiers adjacent to this day (extends their block)
      const aAdj = (dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(a.id)) ||
        (dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(a.id)) ? 1 : 0;
      const bAdj = (dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(b.id)) ||
        (dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(b.id)) ? 1 : 0;
      if (aAdj !== bAdj) return bAdj - aAdj;
      return a.days - b.days;
    });

  if (lowCandidates.length === 0) return null;

  const bottomN = Math.min(3, lowCandidates.length);
  const low = lowCandidates[(rng.next() * bottomN) | 0];

  if (high.days <= low.days + 1) return null;

  return { type: "swap", dayStr, removeId: high.id, addId: low.id };
}

function generateCrossGroupMove(
  opDayStrs: readonly string[],
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
  constraintSet: Set<string>,
  rng: { next: () => number },
  rolesById: Map<string, readonly SoldierRole[]>,
  driverMin: number,
): SwapMove | null {
  if (driverMin === 0) return null;

  const excessDays = opDayStrs.filter((ds) => {
    const slots = daySlots.get(ds);
    if (!slots) return false;
    let driverCount = 0;
    for (const sid of slots) {
      if (rolesById.get(sid)?.includes("driver" as SoldierRole)) driverCount++;
    }
    return driverCount > driverMin;
  });
  if (excessDays.length === 0) return null;

  const dayStr = excessDays[(rng.next() * excessDays.length) | 0];
  const dayIdx = opDayStrs.indexOf(dayStr);
  const slots = daySlots.get(dayStr)!;

  const driversOnBase = [...slots]
    .filter((sid) => rolesById.get(sid)?.includes("driver" as SoldierRole))
    .map((id) => ({ id, days: soldierDays.get(id) ?? 0 }))
    .sort((a, b) => {
      const daysDiff = b.days - a.days;
      if (daysDiff !== 0) return daysDiff;
      const aEdge = isEdgeOfBlock(a.id, dayIdx, daySlots, opDayStrs);
      const bEdge = isEdgeOfBlock(b.id, dayIdx, daySlots, opDayStrs);
      if (aEdge !== bEdge) return aEdge ? -1 : 1;
      return 0;
    });

  const topN = Math.min(3, driversOnBase.length);
  const driver = driversOnBase[(rng.next() * topN) | 0];

  const nonDriverCandidates = [...soldierDays.entries()]
    .filter(([id]) =>
      !slots.has(id) &&
      !rolesById.get(id)?.includes("driver" as SoldierRole) &&
      !constraintSet.has(`${id}:${dayStr}`),
    )
    .map(([id, days]) => ({ id, days }))
    .sort((a, b) => {
      const aAdj = (dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(a.id)) ||
        (dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(a.id)) ? 1 : 0;
      const bAdj = (dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(b.id)) ||
        (dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(b.id)) ? 1 : 0;
      if (aAdj !== bAdj) return bAdj - aAdj;
      return a.days - b.days;
    });

  if (nonDriverCandidates.length === 0) return null;

  const bottomN = Math.min(3, nonDriverCandidates.length);
  const nonDriver = nonDriverCandidates[(rng.next() * bottomN) | 0];

  if (driver.days <= nonDriver.days + 2) return null;

  return { type: "swap", dayStr, removeId: driver.id, addId: nonDriver.id };
}

function isEdgeOfBlock(
  soldierId: string,
  dayIdx: number,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
): boolean {
  const prevOn = dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(soldierId);
  const nextOn = dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(soldierId);
  return !prevOn || !nextOn;
}

function isValidCrossGroupSwap(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  hardMinGap: number,
  constraintSet: Set<string>,
  minBlock: number,
): boolean {
  if (constraintSet.has(`${move.addId}:${move.dayStr}`)) return false;

  const dayIdx = opDayStrs.indexOf(move.dayStr);
  if (dayIdx === -1) return false;

  if (wouldCreateShortBlock(move.removeId, dayIdx, daySlots, opDayStrs, minBlock)) {
    return false;
  }

  if (wouldRemovalShrinkGapBelowMin(move.removeId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

  if (wouldShrinkGapBelowMin(move.addId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

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

  return true;
}

function isValidFairnessSwap(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  hardMinGap: number,
  constraintSet: Set<string>,
): boolean {
  if (constraintSet.has(`${move.addId}:${move.dayStr}`)) return false;

  const dayIdx = opDayStrs.indexOf(move.dayStr);
  if (dayIdx === -1) return false;

  if (wouldRemovalShrinkGapBelowMin(move.removeId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

  if (wouldShrinkGapBelowMin(move.addId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

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

  return true;
}

function isValidMove(
  move: Move,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  hardMinGap: number,
  constraintSet: Set<string>,
  minBlock: number,
): boolean {
  if (move.type === "swap") {
    return isValidSwapMove(move, daySlots, opDayStrs, hardMax, hardMinGap, constraintSet, minBlock);
  }
  return isValidTransferMove(move, daySlots, opDayStrs, hardMax, hardMinGap, constraintSet);
}

function isValidSwapMove(
  move: SwapMove,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  hardMinGap: number,
  constraintSet: Set<string>,
  minBlock: number,
): boolean {
  if (constraintSet.has(`${move.addId}:${move.dayStr}`)) return false;

  const dayIdx = opDayStrs.indexOf(move.dayStr);
  if (dayIdx === -1) return false;

  // addId must extend an existing block (have at least one adjacent day on-base)
  const hasLeft = dayIdx > 0 && daySlots.get(opDayStrs[dayIdx - 1])?.has(move.addId);
  const hasRight = dayIdx < opDayStrs.length - 1 && daySlots.get(opDayStrs[dayIdx + 1])?.has(move.addId);
  if (!hasLeft && !hasRight) return false;

  // Removing soldier shouldn't create a block shorter than minBlock
  if (wouldCreateShortBlock(move.removeId, dayIdx, daySlots, opDayStrs, minBlock)) {
    return false;
  }

  if (wouldRemovalShrinkGapBelowMin(move.removeId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

  if (wouldShrinkGapBelowMin(move.addId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

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

  return true;
}

function wouldCreateShortBlock(
  soldierId: string,
  removeDayIdx: number,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  minBlock: number,
): boolean {
  // Count block to the left of the removal point
  let leftLen = 0;
  for (let i = removeDayIdx - 1; i >= 0; i--) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) leftLen++;
    else break;
  }

  // Count block to the right of the removal point
  let rightLen = 0;
  for (let i = removeDayIdx + 1; i < opDayStrs.length; i++) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) rightLen++;
    else break;
  }

  // If removing from the edge, the remaining block is the other side
  // If removing from the middle, both sides become separate blocks
  if (leftLen > 0 && leftLen < minBlock) return true;
  if (rightLen > 0 && rightLen < minBlock) return true;

  return false;
}

function isValidTransferMove(
  move: TransferMove,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMax: number | null,
  hardMinGap: number,
  constraintSet: Set<string>,
): boolean {
  if (constraintSet.has(`${move.addId}:${move.toDayStr}`)) return false;

  const fromDayIdx = opDayStrs.indexOf(move.fromDayStr);
  if (fromDayIdx !== -1 && wouldRemovalShrinkGapBelowMin(move.removeId, fromDayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

  const dayIdx = opDayStrs.indexOf(move.toDayStr);
  if (dayIdx === -1) return false;

  if (wouldShrinkGapBelowMin(move.addId, dayIdx, daySlots, opDayStrs, hardMinGap)) {
    return false;
  }

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

  return true;
}

function wouldShrinkGapBelowMin(
  soldierId: string,
  addDayIdx: number,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMinGap: number,
): boolean {
  // Find the edges of the block that would form after placing the soldier
  let leftEdge = addDayIdx;
  while (leftEdge > 0 && daySlots.get(opDayStrs[leftEdge - 1])?.has(soldierId)) {
    leftEdge--;
  }
  let rightEdge = addDayIdx;
  while (rightEdge < opDayStrs.length - 1 && daySlots.get(opDayStrs[rightEdge + 1])?.has(soldierId)) {
    rightEdge++;
  }

  // Measure gap to the left of the resulting block
  let leftGap = 0;
  for (let i = leftEdge - 1; i >= 0; i--) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) break;
    leftGap++;
  }
  const leftBounded = leftEdge - 1 - leftGap >= 0;
  if (leftBounded && leftGap > 0 && leftGap < hardMinGap) return true;

  // Measure gap to the right of the resulting block
  let rightGap = 0;
  for (let i = rightEdge + 1; i < opDayStrs.length; i++) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) break;
    rightGap++;
  }
  const rightBounded = rightEdge + 1 + rightGap < opDayStrs.length;
  if (rightBounded && rightGap > 0 && rightGap < hardMinGap) return true;

  return false;
}

function wouldRemovalShrinkGapBelowMin(
  soldierId: string,
  removeDayIdx: number,
  daySlots: Map<string, Set<string>>,
  opDayStrs: readonly string[],
  hardMinGap: number,
): boolean {
  let leftBlockEnd = -1;
  for (let i = removeDayIdx - 1; i >= 0; i--) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) {
      leftBlockEnd = i;
      break;
    }
  }

  let rightBlockStart = -1;
  for (let i = removeDayIdx + 1; i < opDayStrs.length; i++) {
    if (daySlots.get(opDayStrs[i])?.has(soldierId)) {
      rightBlockStart = i;
      break;
    }
  }

  if (leftBlockEnd === -1 || rightBlockStart === -1) return false;

  const gapLength = rightBlockStart - leftBlockEnd - 1;
  return gapLength < hardMinGap;
}

function applyMove(
  move: Move,
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
): void {
  if (move.type === "swap") {
    const slots = daySlots.get(move.dayStr)!;
    slots.delete(move.removeId);
    slots.add(move.addId);
    soldierDays.set(move.removeId, (soldierDays.get(move.removeId) ?? 0) - 1);
    soldierDays.set(move.addId, (soldierDays.get(move.addId) ?? 0) + 1);
    return;
  }

  daySlots.get(move.fromDayStr)!.delete(move.removeId);
  soldierDays.set(move.removeId, (soldierDays.get(move.removeId) ?? 0) - 1);

  daySlots.get(move.toDayStr)!.add(move.addId);
  soldierDays.set(move.addId, (soldierDays.get(move.addId) ?? 0) + 1);
}

function undoMove(
  move: Move,
  daySlots: Map<string, Set<string>>,
  soldierDays: Map<string, number>,
): void {
  if (move.type === "swap") {
    applyMove(
      { type: "swap", dayStr: move.dayStr, removeId: move.addId, addId: move.removeId },
      daySlots,
      soldierDays,
    );
    return;
  }

  daySlots.get(move.toDayStr)!.delete(move.addId);
  soldierDays.set(move.addId, (soldierDays.get(move.addId) ?? 0) - 1);

  daySlots.get(move.fromDayStr)!.add(move.removeId);
  soldierDays.set(move.removeId, (soldierDays.get(move.removeId) ?? 0) + 1);
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
