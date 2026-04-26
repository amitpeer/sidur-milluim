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
const HARD_MIN_GAP = 3;
const HARD_MAX_CONSECUTIVE = 10;

interface RotationConfig {
  readonly soldiers: readonly SeasonSoldier[];
  readonly operationalDays: readonly Date[];
  readonly headcount: number;
  readonly targetBlock: number;
  readonly targetGap: number;
  readonly constraintSet: Set<string>;
  readonly soldierDays: Map<string, number>;
  readonly roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>;
  readonly farAwayExtraDays: number;
  readonly cityGroupingEnabled: boolean;
  readonly rng: { next: () => number; shuffle: <T>(arr: T[]) => T[] };
  readonly trailingTrainingStreak: Map<string, number>;
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

  const trailingTrainingStreak = new Map<string, number>();
  for (const soldier of soldiers) {
    let streak = 0;
    for (let i = trainingDays.length - 1; i >= 0; i--) {
      const ds = dateToString(trainingDays[i]);
      if (daySlots.get(ds)?.has(soldier.id)) streak++;
      else break;
    }
    if (streak > 0) trailingTrainingStreak.set(soldier.id, streak);
  }

  const rotationSlots = buildRotationTemplate({
    soldiers,
    operationalDays,
    headcount,
    targetBlock,
    targetGap,
    constraintSet,
    soldierDays,
    roleMinimums: season.roleMinimums,
    farAwayExtraDays: season.farAwayExtraDays ?? 0,
    cityGroupingEnabled: season.cityGroupingEnabled,
    rng,
    trailingTrainingStreak,
  });

  for (const day of operationalDays) {
    const dateStr = dateToString(day);
    const onBase = rotationSlots.get(dateStr)!;
    const slots = daySlots.get(dateStr)!;

    for (const sid of onBase) {
      if (slots.has(sid)) continue;
      addSoldierToDay(sid, day, daySlots, soldierDays, assignments);
    }
  }

  return refineSchedule({
    assignments,
    season,
    soldiers,
    constraints,
    seed: (rng.next() * 0xFFFFFFFF) | 0,
  });
}

function buildRotationTemplate(config: RotationConfig): Map<string, Set<string>> {
  const {
    soldiers, operationalDays, headcount, targetBlock, targetGap,
    constraintSet, soldierDays, roleMinimums, farAwayExtraDays,
    cityGroupingEnabled, rng, trailingTrainingStreak,
  } = config;

  const cycle = targetBlock + targetGap;
  const N = soldiers.length;
  const rawDuration = cycle * headcount / N;
  const onDuration = Math.max(1, Math.ceil(rawDuration));

  const ordered = orderSoldiersForRotation(soldiers, cityGroupingEnabled, rng);

  const offsets = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) {
    offsets.set(ordered[i].id, Math.round(i * cycle / N));
  }

  const localDays = new Map<string, number>();
  for (const s of soldiers) {
    localDays.set(s.id, soldierDays.get(s.id) ?? 0);
  }

  const soldiersById = new Map(soldiers.map((s) => [s.id, s]));
  const roleEntries = Object.entries(roleMinimums) as [SoldierRole, number][];
  const result = new Map<string, Set<string>>();

  for (let dayIdx = 0; dayIdx < operationalDays.length; dayIdx++) {
    const day = operationalDays[dayIdx];
    const dateStr = dateToString(day);

    const rawOnBase = new Set<string>();
    for (const soldier of soldiers) {
      if (isConstrained(soldier.id, dateStr, constraintSet)) continue;

      const extra = soldier.isFarAway ? farAwayExtraDays : 0;
      const soldierOnDuration = onDuration + extra;
      const offset = offsets.get(soldier.id) ?? 0;
      const pos = ((dayIdx - offset) % cycle + cycle) % cycle;

      if (
        pos < soldierOnDuration &&
        hasMinGapSinceLastBlock(soldier.id, dayIdx, result, operationalDays) &&
        !wouldExceedMaxConsecutive(soldier.id, dayIdx, result, operationalDays, trailingTrainingStreak)
      ) {
        rawOnBase.add(soldier.id);
      }
    }

    const trimmed = trimToHeadcount(
      rawOnBase, headcount, localDays, soldiers, dateStr, roleMinimums,
      dayIdx, offsets, onDuration, cycle, farAwayExtraDays,
    );
    const capped = capExcessDrivers(
      trimmed, localDays, soldiers, dateStr,
      constraintSet, roleMinimums, result, dayIdx, operationalDays, trailingTrainingStreak,
    );
    const padded = padToHeadcount(
      capped, headcount, localDays, soldiers, dateStr,
      constraintSet, roleMinimums, result, dayIdx, operationalDays, trailingTrainingStreak,
    );
    const fixed = fixRolesAtHeadcount(
      padded, localDays, soldiers, dateStr, constraintSet,
      soldiersById, roleEntries, result, dayIdx, operationalDays, trailingTrainingStreak,
    );

    for (const sid of fixed) {
      localDays.set(sid, (localDays.get(sid) ?? 0) + 1);
    }

    result.set(dateStr, fixed);
  }

  return result;
}

function orderSoldiersForRotation(
  soldiers: readonly SeasonSoldier[],
  cityGroupingEnabled: boolean,
  rng: { shuffle: <T>(arr: T[]) => T[] },
): SeasonSoldier[] {
  const N = soldiers.length;
  const roleHolders = rng.shuffle(soldiers.filter((s) => s.roles.length > 0));
  const nonRoleHolders = soldiers.filter((s) => s.roles.length === 0);

  let orderedNonRole: SeasonSoldier[];
  if (cityGroupingEnabled) {
    const cityGroups = new Map<string, SeasonSoldier[]>();
    const noCity: SeasonSoldier[] = [];
    for (const s of nonRoleHolders) {
      if (s.city) {
        const group = cityGroups.get(s.city) ?? [];
        group.push(s);
        cityGroups.set(s.city, group);
      } else {
        noCity.push(s);
      }
    }
    orderedNonRole = [];
    for (const group of rng.shuffle([...cityGroups.values()])) {
      orderedNonRole.push(...rng.shuffle(group));
    }
    orderedNonRole.push(...rng.shuffle(noCity));
  } else {
    orderedNonRole = rng.shuffle([...nonRoleHolders]);
  }

  if (roleHolders.length === 0) return orderedNonRole;

  const result: (SeasonSoldier | null)[] = new Array(N).fill(null);
  const spacing = N / roleHolders.length;

  for (let i = 0; i < roleHolders.length; i++) {
    const target = Math.round(i * spacing) % N;
    for (let d = 0; d < N; d++) {
      const idx = (target + d) % N;
      if (result[idx] === null) {
        result[idx] = roleHolders[i];
        break;
      }
    }
  }

  let nrhIdx = 0;
  for (let i = 0; i < N; i++) {
    if (result[i] === null) {
      result[i] = orderedNonRole[nrhIdx++];
    }
  }

  return result as SeasonSoldier[];
}

function trimToHeadcount(
  rawOnBase: Set<string>,
  headcount: number,
  soldierDays: Map<string, number>,
  soldiers: readonly SeasonSoldier[],
  dateStr: string,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  dayIdx: number,
  offsets: Map<string, number>,
  onDuration: number,
  cycle: number,
  farAwayExtraDays: number,
): Set<string> {
  if (rawOnBase.size <= headcount) return rawOnBase;

  const roleEntries = Object.entries(roleMinimums) as [SoldierRole, number][];
  const soldiersById = new Map(soldiers.map((s) => [s.id, s]));

  const roleCounts = new Map<string, number>();
  for (const sid of rawOnBase) {
    const soldier = soldiersById.get(sid);
    if (soldier) {
      for (const role of soldier.roles) {
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
      }
    }
  }

  const removable = [...rawOnBase].sort((a, b) => {
    const aExcess = hasExcessRole(a, soldiersById, roleEntries, roleCounts);
    const bExcess = hasExcessRole(b, soldiersById, roleEntries, roleCounts);
    if (aExcess !== bExcess) return aExcess ? -1 : 1;

    const daysDiff = (soldierDays.get(b) ?? 0) - (soldierDays.get(a) ?? 0);
    if (daysDiff !== 0) return daysDiff;

    const posA = ((dayIdx - (offsets.get(a) ?? 0)) % cycle + cycle) % cycle;
    const posB = ((dayIdx - (offsets.get(b) ?? 0)) % cycle + cycle) % cycle;
    return posB - posA;
  });

  const result = new Set(rawOnBase);
  for (const sid of removable) {
    if (result.size <= headcount) break;
    if (wouldBreakRoleMinimums(sid, result, soldiersById, roleEntries)) continue;
    result.delete(sid);
  }

  return result;
}

function capExcessDrivers(
  onBase: Set<string>,
  soldierDays: Map<string, number>,
  soldiers: readonly SeasonSoldier[],
  dateStr: string,
  constraintSet: Set<string>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  previousSlots: Map<string, Set<string>>,
  dayIdx: number,
  operationalDays: readonly Date[],
  trailingTrainingStreak: Map<string, number>,
): Set<string> {
  const driverMin = (roleMinimums as Record<string, number>)["driver"] ?? 0;
  if (driverMin === 0) return onBase;

  const soldiersById = new Map(soldiers.map((s) => [s.id, s]));
  const roleEntries = Object.entries(roleMinimums) as [SoldierRole, number][];

  const driversOnBase = [...onBase].filter((sid) =>
    soldiersById.get(sid)?.roles.includes("driver" as SoldierRole),
  );
  const excess = driversOnBase.length - driverMin;
  if (excess <= 0) return onBase;

  const prevDayStr = dayIdx > 0 ? dateToString(operationalDays[dayIdx - 1]) : null;
  const prevSlots = prevDayStr ? previousSlots.get(prevDayStr) : null;

  const removable = driversOnBase
    .filter((sid) => !wouldBreakRoleMinimums(sid, onBase, soldiersById, roleEntries))
    .sort((a, b) => {
      const daysDiff = (soldierDays.get(b) ?? 0) - (soldierDays.get(a) ?? 0);
      if (daysDiff !== 0) return daysDiff;
      const aEdge = isBlockEdge(a, dayIdx, previousSlots, operationalDays);
      const bEdge = isBlockEdge(b, dayIdx, previousSlots, operationalDays);
      if (aEdge !== bEdge) return aEdge ? -1 : 1;
      return 0;
    });

  const replaceable = soldiers
    .filter((s) =>
      !onBase.has(s.id) &&
      !isConstrained(s.id, dateStr, constraintSet) &&
      !s.roles.includes("driver" as SoldierRole) &&
      hasMinGapSinceLastBlock(s.id, dayIdx, previousSlots, operationalDays) &&
      !wouldExceedMaxConsecutive(s.id, dayIdx, previousSlots, operationalDays, trailingTrainingStreak),
    )
    .sort((a, b) => {
      const aAdj = prevSlots?.has(a.id) ? 0 : 1;
      const bAdj = prevSlots?.has(b.id) ? 0 : 1;
      if (aAdj !== bAdj) return aAdj - bAdj;
      return (soldierDays.get(a.id) ?? 0) - (soldierDays.get(b.id) ?? 0);
    });

  const result = new Set(onBase);
  let swapped = 0;
  let replIdx = 0;

  for (const driverId of removable) {
    if (swapped >= excess) break;
    if (replIdx >= replaceable.length) break;
    result.delete(driverId);
    result.add(replaceable[replIdx].id);
    replIdx++;
    swapped++;
  }

  return result;
}

function isBlockEdge(
  soldierId: string,
  dayIdx: number,
  previousSlots: Map<string, Set<string>>,
  operationalDays: readonly Date[],
): boolean {
  if (dayIdx === 0) return true;
  const prevDayStr = dateToString(operationalDays[dayIdx - 1]);
  const prevSlots = previousSlots.get(prevDayStr);
  if (!prevSlots) return true;
  return !prevSlots.has(soldierId);
}

function padToHeadcount(
  currentOnBase: Set<string>,
  headcount: number,
  soldierDays: Map<string, number>,
  soldiers: readonly SeasonSoldier[],
  dateStr: string,
  constraintSet: Set<string>,
  roleMinimums: Readonly<Partial<Record<SoldierRole, number>>>,
  previousSlots: Map<string, Set<string>>,
  dayIdx: number,
  operationalDays: readonly Date[],
  trailingTrainingStreak: Map<string, number>,
): Set<string> {
  if (currentOnBase.size >= headcount) return currentOnBase;

  const roleEntries = Object.entries(roleMinimums) as [SoldierRole, number][];
  const soldiersById = new Map(soldiers.map((s) => [s.id, s]));
  const result = new Set(currentOnBase);

  // Find soldiers who were on-base yesterday (adjacent = extends their block)
  const prevDayStr = dayIdx > 0 ? dateToString(operationalDays[dayIdx - 1]) : null;
  const prevSlots = prevDayStr ? previousSlots.get(prevDayStr) : null;

  const neededRoles = findNeededRoles(result, soldiersById, roleEntries);

  if (neededRoles.length > 0) {
    const roleHolders = soldiers
      .filter((s) =>
        !result.has(s.id) &&
        !isConstrained(s.id, dateStr, constraintSet) &&
        s.roles.some((r) => neededRoles.includes(r)) &&
        hasMinGapSinceLastBlock(s.id, dayIdx, previousSlots, operationalDays) &&
        !wouldExceedMaxConsecutive(s.id, dayIdx, previousSlots, operationalDays, trailingTrainingStreak),
      )
      .sort((a, b) => {
        const aAdj = prevSlots?.has(a.id) ? 0 : 1;
        const bAdj = prevSlots?.has(b.id) ? 0 : 1;
        if (aAdj !== bAdj) return aAdj - bAdj;
        return (soldierDays.get(a.id) ?? 0) - (soldierDays.get(b.id) ?? 0);
      });

    for (const s of roleHolders) {
      if (result.size >= headcount) break;
      result.add(s.id);
    }
  }

  // Prefer soldiers adjacent to their existing block (were on-base yesterday)
  const available = soldiers
    .filter((s) =>
      !result.has(s.id) &&
      !isConstrained(s.id, dateStr, constraintSet) &&
      hasMinGapSinceLastBlock(s.id, dayIdx, previousSlots, operationalDays) &&
      !wouldExceedMaxConsecutive(s.id, dayIdx, previousSlots, operationalDays, trailingTrainingStreak),
    )
    .sort((a, b) => {
      const aAdj = prevSlots?.has(a.id) ? 0 : 1;
      const bAdj = prevSlots?.has(b.id) ? 0 : 1;
      if (aAdj !== bAdj) return aAdj - bAdj;
      return (soldierDays.get(a.id) ?? 0) - (soldierDays.get(b.id) ?? 0);
    });

  for (const s of available) {
    if (result.size >= headcount) break;
    result.add(s.id);
  }

  return result;
}

function fixRolesAtHeadcount(
  onBase: Set<string>,
  soldierDays: Map<string, number>,
  soldiers: readonly SeasonSoldier[],
  dateStr: string,
  constraintSet: Set<string>,
  soldiersById: Map<string, SeasonSoldier>,
  roleEntries: [SoldierRole, number][],
  previousSlots: Map<string, Set<string>>,
  dayIdx: number,
  operationalDays: readonly Date[],
  trailingTrainingStreak: Map<string, number>,
): Set<string> {
  if (roleEntries.length === 0) return onBase;

  const prevDayStr = dayIdx > 0 ? dateToString(operationalDays[dayIdx - 1]) : null;
  const prevSlots = prevDayStr ? previousSlots.get(prevDayStr) : null;
  const result = new Set(onBase);

  for (const [role, min] of roleEntries) {
    let roleCount = 0;
    for (const sid of result) {
      if (soldiersById.get(sid)?.roles.includes(role)) roleCount++;
    }

    while (roleCount < min) {
      const candidates = soldiers
        .filter((s) =>
          s.roles.includes(role) &&
          !result.has(s.id) &&
          !isConstrained(s.id, dateStr, constraintSet) &&
          hasMinGapSinceLastBlock(s.id, dayIdx, previousSlots, operationalDays) &&
          !wouldExceedMaxConsecutive(s.id, dayIdx, previousSlots, operationalDays, trailingTrainingStreak),
        )
        .sort((a, b) => {
          const aAdj = prevSlots?.has(a.id) ? 0 : 1;
          const bAdj = prevSlots?.has(b.id) ? 0 : 1;
          if (aAdj !== bAdj) return aAdj - bAdj;
          return (soldierDays.get(a.id) ?? 0) - (soldierDays.get(b.id) ?? 0);
        });

      const replacement = candidates[0];
      if (!replacement) break;

      const removable = [...result]
        .filter((sid) => {
          const s = soldiersById.get(sid);
          return s && !s.roles.some((r) => {
            const rMin = roleEntries.find(([rr]) => rr === r)?.[1] ?? 0;
            if (rMin <= 0) return false;
            let cnt = 0;
            for (const id of result) {
              if (soldiersById.get(id)?.roles.includes(r)) cnt++;
            }
            return cnt <= rMin;
          });
        })
        .sort((a, b) => {
          const aAdj = prevSlots?.has(a) ? 1 : 0;
          const bAdj = prevSlots?.has(b) ? 1 : 0;
          if (aAdj !== bAdj) return aAdj - bAdj;
          return (soldierDays.get(b) ?? 0) - (soldierDays.get(a) ?? 0);
        });

      if (removable.length === 0) break;

      result.delete(removable[0]);
      result.add(replacement.id);
      roleCount++;
    }
  }

  return result;
}

function hasExcessRole(
  soldierId: string,
  soldiersById: Map<string, SeasonSoldier>,
  roleEntries: [SoldierRole, number][],
  roleCounts: Map<string, number>,
): boolean {
  const soldier = soldiersById.get(soldierId);
  if (!soldier || soldier.roles.length === 0) return false;

  return soldier.roles.some((role) => {
    const min = roleEntries.find(([r]) => r === role)?.[1] ?? 0;
    const count = roleCounts.get(role) ?? 0;
    return count > min;
  });
}

function wouldBreakRoleMinimums(
  soldierIdToRemove: string,
  onBase: Set<string>,
  soldiersById: Map<string, SeasonSoldier>,
  roleEntries: [SoldierRole, number][],
): boolean {
  const soldier = soldiersById.get(soldierIdToRemove);
  if (!soldier || soldier.roles.length === 0) return false;

  for (const [role, min] of roleEntries) {
    if (!soldier.roles.includes(role)) continue;

    let count = 0;
    for (const sid of onBase) {
      if (soldiersById.get(sid)?.roles.includes(role)) count++;
    }
    if (count <= min) return true;
  }
  return false;
}

function findNeededRoles(
  onBase: Set<string>,
  soldiersById: Map<string, SeasonSoldier>,
  roleEntries: [SoldierRole, number][],
): SoldierRole[] {
  const needed: SoldierRole[] = [];
  for (const [role, min] of roleEntries) {
    let count = 0;
    for (const sid of onBase) {
      if (soldiersById.get(sid)?.roles.includes(role)) count++;
    }
    if (count < min) needed.push(role);
  }
  return needed;
}

function wouldExceedMaxConsecutive(
  soldierId: string,
  dayIdx: number,
  previousSlots: Map<string, Set<string>>,
  operationalDays: readonly Date[],
  trailingTrainingStreak: Map<string, number>,
): boolean {
  let streak = 0;
  let i = dayIdx - 1;
  while (i >= 0) {
    const ds = dateToString(operationalDays[i]);
    if (previousSlots.get(ds)?.has(soldierId)) {
      streak++;
      i--;
    } else break;
  }
  if (i < 0) {
    streak += trailingTrainingStreak.get(soldierId) ?? 0;
  }
  return streak >= HARD_MAX_CONSECUTIVE;
}

function hasMinGapSinceLastBlock(
  soldierId: string,
  dayIdx: number,
  previousSlots: Map<string, Set<string>>,
  operationalDays: readonly Date[],
): boolean {
  // If the soldier was on-base yesterday, this extends their block — always OK
  if (dayIdx > 0) {
    const prevStr = dateToString(operationalDays[dayIdx - 1]);
    if (previousSlots.get(prevStr)?.has(soldierId)) return true;
  }

  // Check that the soldier has been off for at least HARD_MIN_GAP days
  for (let i = 1; i <= HARD_MIN_GAP && dayIdx - i >= 0; i++) {
    const ds = dateToString(operationalDays[dayIdx - i]);
    if (previousSlots.get(ds)?.has(soldierId)) return false;
  }

  return true;
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

