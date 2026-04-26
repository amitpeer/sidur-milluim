import type { SoldierRole } from "@/lib/constants";
import type { SeasonSoldier } from "@/domain/soldier/soldier.types";
import type { ScheduleAssignment } from "./schedule.types";
import { dateToString, addDays } from "@/lib/date-utils";

const ADJACENCY_BONUS = 30;
const CITY_COHESION_BONUS = 3;
const HARD_MAX_BUFFER = 5;
const HARD_MIN_GAP = 3;

interface SuggestInput {
  readonly unavailableSoldierId: string;
  readonly date: Date;
  readonly soldiers: readonly SeasonSoldier[];
  readonly assignments: readonly ScheduleAssignment[];
  readonly constraints: readonly {
    readonly soldierProfileId: string;
    readonly date: Date;
  }[];
  readonly requiredRoles?: readonly SoldierRole[];
  readonly avgDaysArmy?: number | null;
  readonly cityGroupingEnabled?: boolean;
}

export interface ReplacementSuggestion {
  readonly soldierId: string;
  readonly fullName: string;
  readonly score: number;
  readonly reason: string;
}

export function suggestReplacements(
  input: SuggestInput,
): ReplacementSuggestion[] {
  const {
    unavailableSoldierId,
    date,
    soldiers,
    assignments,
    constraints,
    requiredRoles,
    avgDaysArmy,
    cityGroupingEnabled,
  } = input;

  const dateStr = dateToString(date);

  const constraintSet = new Set(
    constraints
      .filter((c) => dateToString(c.date) === dateStr)
      .map((c) => c.soldierProfileId),
  );

  const assignedOnDay = new Set(
    assignments
      .filter((a) => dateToString(a.date) === dateStr && a.isOnBase)
      .map((a) => a.soldierProfileId),
  );

  const totalDaysPerSoldier = new Map<string, number>();
  for (const a of assignments) {
    if (a.isOnBase) {
      totalDaysPerSoldier.set(
        a.soldierProfileId,
        (totalDaysPerSoldier.get(a.soldierProfileId) ?? 0) + 1,
      );
    }
  }

  const hardMax = deriveHardMax(avgDaysArmy);
  const candidates = soldiers.filter(
    (s) =>
      s.id !== unavailableSoldierId &&
      !constraintSet.has(s.id) &&
      !assignedOnDay.has(s.id) &&
      !wouldExceedMaxConsecutive(s.id, date, assignments, hardMax) &&
      !wouldShrinkGapBelowMin(s.id, date, assignments, HARD_MIN_GAP),
  );

  const scored: ReplacementSuggestion[] = candidates.map((s) => {
    let score = 0;
    const reasons: string[] = [];

    const daysAssigned = totalDaysPerSoldier.get(s.id) ?? 0;
    const fairnessScore = 100 - daysAssigned;
    score += fairnessScore;
    reasons.push(`${daysAssigned} ימים מוקצים`);

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((r) => s.roles.includes(r));
      if (hasRole) {
        score += 50;
        reasons.push("בעל תפקיד נדרש");
      }
    }

    if (!s.isFarAway) {
      score += 10;
      reasons.push("קרוב");
    }

    if (avgDaysArmy != null && hasAdjacentAssignment(s.id, date, assignments)) {
      score += ADJACENCY_BONUS;
      reasons.push("רציפות");
    }

    if (cityGroupingEnabled && s.city) {
      const sameCityCount = countSameCityOnDay(s.city, date, assignments, soldiers);
      if (sameCityCount > 0) {
        score += sameCityCount * CITY_COHESION_BONUS;
        reasons.push("אותה עיר");
      }
    }

    return {
      soldierId: s.id,
      fullName: s.fullName,
      score,
      reason: reasons.join(", "),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

function deriveHardMax(avgDaysArmy: number | null | undefined): number | null {
  if (avgDaysArmy == null) return null;
  return Math.min(avgDaysArmy + HARD_MAX_BUFFER, 10);
}

function wouldExceedMaxConsecutive(
  soldierId: string,
  date: Date,
  assignments: readonly ScheduleAssignment[],
  hardMax: number | null | undefined,
): boolean {
  if (hardMax == null) return false;

  const onBaseDates = new Set<string>();
  for (const a of assignments) {
    if (a.soldierProfileId === soldierId && a.isOnBase) {
      onBaseDates.add(dateToString(a.date));
    }
  }

  let streak = 1;

  let d = addDays(date, -1);
  while (onBaseDates.has(dateToString(d))) {
    streak++;
    d = addDays(d, -1);
  }

  d = addDays(date, 1);
  while (onBaseDates.has(dateToString(d))) {
    streak++;
    d = addDays(d, 1);
  }

  return streak > hardMax;
}

function wouldShrinkGapBelowMin(
  soldierId: string,
  date: Date,
  assignments: readonly ScheduleAssignment[],
  hardMinGap: number,
): boolean {
  const onBaseDates = new Set<string>();
  for (const a of assignments) {
    if (a.soldierProfileId === soldierId && a.isOnBase) {
      onBaseDates.add(dateToString(a.date));
    }
  }

  // Find the edges of the block that would form after placing the soldier
  let leftEdge = date;
  while (onBaseDates.has(dateToString(addDays(leftEdge, -1)))) {
    leftEdge = addDays(leftEdge, -1);
  }
  let rightEdge = date;
  while (onBaseDates.has(dateToString(addDays(rightEdge, 1)))) {
    rightEdge = addDays(rightEdge, 1);
  }

  // Measure gap to the left of the resulting block
  let leftGap = 0;
  let d = addDays(leftEdge, -1);
  while (!onBaseDates.has(dateToString(d))) {
    leftGap++;
    d = addDays(d, -1);
    if (leftGap >= hardMinGap) break;
  }
  if (leftGap < hardMinGap && onBaseDates.has(dateToString(d))) return true;

  // Measure gap to the right of the resulting block
  let rightGap = 0;
  d = addDays(rightEdge, 1);
  while (!onBaseDates.has(dateToString(d))) {
    rightGap++;
    d = addDays(d, 1);
    if (rightGap >= hardMinGap) break;
  }
  if (rightGap < hardMinGap && onBaseDates.has(dateToString(d))) return true;

  return false;
}

function hasAdjacentAssignment(
  soldierId: string,
  date: Date,
  assignments: readonly ScheduleAssignment[],
): boolean {
  const prevStr = dateToString(addDays(date, -1));
  const nextStr = dateToString(addDays(date, 1));

  return assignments.some(
    (a) =>
      a.soldierProfileId === soldierId &&
      a.isOnBase &&
      (dateToString(a.date) === prevStr || dateToString(a.date) === nextStr),
  );
}

function countSameCityOnDay(
  city: string,
  date: Date,
  assignments: readonly ScheduleAssignment[],
  soldiers: readonly SeasonSoldier[],
): number {
  const dateStr = dateToString(date);
  let count = 0;
  for (const a of assignments) {
    if (a.isOnBase && dateToString(a.date) === dateStr) {
      const soldier = soldiers.find((s) => s.id === a.soldierProfileId);
      if (soldier?.city === city) count++;
    }
  }
  return count;
}
